/**
 * OpenAI direct client for embeddings only.
 *
 * WHY: Separate OpenAI client for embeddings because:
 * - OpenRouter may have issues with embedding endpoints
 * - Direct OpenAI API is more reliable for embeddings
 * - Allows hybrid approach: OpenAI for embeddings, OpenRouter for chat
 * - Better error handling and rate limiting for embedding-specific needs
 * - Cost tracking specific to embedding operations
 *
 * DESIGN DECISIONS:
 * - Uses direct OpenAI API (api.openai.com) for maximum reliability
 * - Maintains cost tracking for budget monitoring
 * - Implements caching for repeated embedding requests
 * - Provides batch processing for efficiency
 * - Uses the same interface as OpenRouter client for consistency
 */

import OpenAI from 'openai';
import { getRedisClient, safeRedisOperation, createCacheKey } from '../redis/client';
import { z } from 'zod';

// Embedding-specific interfaces
export interface EmbeddingUsageMetrics {
  requestId: string;
  model: string;
  inputTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface EmbeddingModelConfig {
  name: string;
  costPer1kTokens: number; // USD
  maxTokens: number;
  dimensions?: number; // Output dimensions
}

// OpenAI embedding models configuration
export const EMBEDDING_MODELS: Record<string, EmbeddingModelConfig> = {
  'text-embedding-3-small': {
    name: 'text-embedding-3-small',
    costPer1kTokens: 0.00002, // $0.02 per 1M tokens
    maxTokens: 8191,
    dimensions: 1536,
  },
  'text-embedding-3-large': {
    name: 'text-embedding-3-large',
    costPer1kTokens: 0.00013, // $0.13 per 1M tokens
    maxTokens: 8191,
    dimensions: 3072,
  },
  'text-embedding-ada-002': {
    name: 'text-embedding-ada-002',
    costPer1kTokens: 0.0001, // $0.10 per 1M tokens
    maxTokens: 8191,
    dimensions: 1536,
  },
};

// Validation schema
export const EmbeddingRequestSchema = z.object({
  input: z.union([
    z.string().min(1).max(8000), // Single text input
    z.array(z.string().min(1).max(8000)).max(100), // Batch input with reasonable limits
  ]),
  model: z.string().optional(),
  dimensions: z.number().optional(), // For text-embedding-3-* models
});

export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;

/**
 * Direct OpenAI client for embeddings with cost tracking and caching.
 */
export class OpenAIEmbeddingsClient {
  private openai: OpenAI | null = null;
  // Redis is managed by centralized client
  private usageMetrics: EmbeddingUsageMetrics[] = [];
  private initialized = false;

  constructor() {
    // We'll initialize lazily to handle missing API key gracefully
  }

  /**
   * Initialize the OpenAI client and Redis cache.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for embeddings');
    }

    this.openai = new OpenAI({
      apiKey,
      timeout: 30000, // 30 second timeout
    });

    // Redis is managed by centralized client - no initialization needed
    
    this.initialized = true;
    console.log('OpenAI embeddings client initialized');
  }

  /**
   * Get Redis client from centralized manager.
   */
  private async getRedis() {
    return getRedisClient();
  }

  /**
   * Generate embeddings with cost tracking and caching.
   */
  async createEmbedding(
    request: EmbeddingRequest,
    options: {
      cacheKey?: string;
      cacheTtl?: number; // seconds
      retries?: number;
    } = {}
  ): Promise<{
    embeddings: number[][];
    usage: EmbeddingUsageMetrics;
  }> {
    await this.initialize();
    
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const requestId = `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const model = request.model || 'text-embedding-3-small';
    const modelConfig = EMBEDDING_MODELS[model];

    if (!modelConfig) {
      throw new Error(`Unsupported embedding model: ${model}`);
    }

    // Validate request
    const validatedRequest = EmbeddingRequestSchema.parse(request);

    // Check cache if enabled
    if (options.cacheKey) {
      const cacheKey = createCacheKey('ai', 'embed_openai', options.cacheKey);
      const cachedResult = await safeRedisOperation(
        async (redis) => {
          const cached = await redis.get(cacheKey);
          return cached ? JSON.parse(cached) : null;
        },
        null
      );
      
      if (cachedResult) {
        console.log(`Cache hit for OpenAI embedding: ${options.cacheKey}`);
        return cachedResult;
      }
    }

    let lastError: Error | null = null;
    const maxRetries = options.retries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const embeddingParams: any = {
          model,
          input: validatedRequest.input,
        };

        // Add dimensions parameter for text-embedding-3-* models if specified
        if (request.dimensions && (model === 'text-embedding-3-small' || model === 'text-embedding-3-large')) {
          embeddingParams.dimensions = request.dimensions;
        }

        const embedding = await this.openai.embeddings.create(embeddingParams);

        const usage = embedding.usage;
        if (!usage) {
          throw new Error('No usage information returned from OpenAI embeddings');
        }

        // Calculate cost (embeddings only have input cost)
        const totalCost = (usage.total_tokens / 1000) * modelConfig.costPer1kTokens;

        // Create usage metrics
        const usageMetrics: EmbeddingUsageMetrics = {
          requestId,
          model,
          inputTokens: usage.total_tokens,
          totalTokens: usage.total_tokens,
          estimatedCost: totalCost,
          timestamp: new Date(),
          success: true,
        };

        // Track usage
        this.usageMetrics.push(usageMetrics);
        console.log(`OpenAI embedding: ${usage.total_tokens} tokens, $${totalCost.toFixed(6)} cost`);

        const embeddings = embedding.data.map(d => d.embedding);
        const result = { embeddings, usage: usageMetrics };

        // Cache result if enabled
        if (options.cacheKey) {
          const cacheKey = createCacheKey('ai', 'embed_openai', options.cacheKey);
          const ttl = options.cacheTtl || 86400; // 24 hours default for embeddings
          
          await safeRedisOperation(
            async (redis) => {
              await redis.setEx(cacheKey, ttl, JSON.stringify(result));
              console.log(`Cached OpenAI embedding: ${options.cacheKey} (TTL: ${ttl}s)`);
            },
            null
          );
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        
        // Log failed usage
        const failedUsageMetrics: EmbeddingUsageMetrics = {
          requestId,
          model,
          inputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
          timestamp: new Date(),
          success: false,
          error: lastError.message,
        };
        this.usageMetrics.push(failedUsageMetrics);

        // Don't retry on validation or auth errors
        if (error instanceof z.ZodError || 
            (error as any)?.status === 401 || 
            (error as any)?.status === 403) {
          throw error;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`OpenAI embedding failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`OpenAI embedding failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Generate a single embedding (convenience method).
   */
  async createSingleEmbedding(
    text: string,
    options: {
      model?: string;
      dimensions?: number;
      cacheKey?: string;
      cacheTtl?: number;
      retries?: number;
    } = {}
  ): Promise<{
    embedding: number[];
    usage: EmbeddingUsageMetrics;
  }> {
    const request: EmbeddingRequest = {
      input: text,
      model: options.model,
      dimensions: options.dimensions,
    };

    const result = await this.createEmbedding(request, {
      cacheKey: options.cacheKey,
      cacheTtl: options.cacheTtl,
      retries: options.retries,
    });

    return {
      embedding: result.embeddings[0],
      usage: result.usage,
    };
  }

  /**
   * Generate embeddings in batch (convenience method).
   */
  async createBatchEmbeddings(
    texts: string[],
    options: {
      model?: string;
      dimensions?: number;
      cacheKey?: string;
      cacheTtl?: number;
      retries?: number;
    } = {}
  ): Promise<{
    embeddings: number[][];
    usage: EmbeddingUsageMetrics;
  }> {
    const request: EmbeddingRequest = {
      input: texts,
      model: options.model,
      dimensions: options.dimensions,
    };

    return this.createEmbedding(request, {
      cacheKey: options.cacheKey,
      cacheTtl: options.cacheTtl,
      retries: options.retries,
    });
  }

  /**
   * Check if the client is available (has API key).
   */
  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * Get usage metrics for cost tracking.
   */
  getUsageMetrics(): EmbeddingUsageMetrics[] {
    return [...this.usageMetrics];
  }

  /**
   * Get total cost across all tracked requests.
   */
  getTotalCost(): number {
    return this.usageMetrics.reduce((total, metric) => total + metric.estimatedCost, 0);
  }

  /**
   * Clear usage metrics.
   */
  clearUsageMetrics(): void {
    this.usageMetrics = [];
  }

  /**
   * Get usage summary.
   */
  getUsageSummary(): {
    totalCost: number;
    totalTokens: number;
    requestCount: number;
    successRate: number;
    byModel: Record<string, { cost: number; tokens: number; requests: number; }>;
  } {
    const summary = {
      totalCost: 0,
      totalTokens: 0,
      requestCount: 0,
      successfulRequests: 0,
      byModel: {} as Record<string, { cost: number; tokens: number; requests: number; }>,
    };

    for (const metric of this.usageMetrics) {
      summary.totalCost += metric.estimatedCost;
      summary.totalTokens += metric.totalTokens;
      summary.requestCount += 1;
      
      if (metric.success) {
        summary.successfulRequests += 1;
      }

      // By model
      if (!summary.byModel[metric.model]) {
        summary.byModel[metric.model] = { cost: 0, tokens: 0, requests: 0 };
      }
      summary.byModel[metric.model].cost += metric.estimatedCost;
      summary.byModel[metric.model].tokens += metric.totalTokens;
      summary.byModel[metric.model].requests += 1;
    }

    const successRate = summary.requestCount > 0 ? summary.successfulRequests / summary.requestCount : 0;
    
    return {
      totalCost: summary.totalCost,
      totalTokens: summary.totalTokens,
      requestCount: summary.requestCount,
      successRate,
      byModel: summary.byModel,
    };
  }

  /**
   * Clean up resources.
   */
  async cleanup(): Promise<void> {
    // Redis is managed by the centralized redis client
    // No cleanup needed for this client
  }
}

/**
 * Global OpenAI embeddings client instance.
 */
let globalEmbeddingsClient: OpenAIEmbeddingsClient | null = null;

/**
 * Get or create the global OpenAI embeddings client instance.
 */
export function getOpenAIEmbeddingsClient(): OpenAIEmbeddingsClient {
  if (!globalEmbeddingsClient) {
    globalEmbeddingsClient = new OpenAIEmbeddingsClient();
  }
  return globalEmbeddingsClient;
}

/**
 * Reset the global OpenAI embeddings client instance (useful for testing or config changes).
 */
export function resetOpenAIEmbeddingsClient(): void {
  globalEmbeddingsClient = null;
}

/**
 * Helper function to create a cache key for embedding requests.
 */
export function createEmbeddingCacheKey(text: string, model?: string, dimensions?: number): string {
  const data = { text, model: model || 'text-embedding-3-small', dimensions };
  const hash = Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 32);
  return `embed:${hash}`;
}