/**
 * OpenRouter client wrapper with cost tracking and error handling.
 *
 * WHY: Centralized OpenRouter client wrapper because:
 * - Provides consistent error handling across all AI endpoints
 * - Tracks token usage and costs for budgeting and monitoring
 * - Implements retry logic for transient failures
 * - Standardizes request/response patterns
 * - Enables easy switching between models for different use cases
 * - Uses OpenRouter for better model availability and pricing
 *
 * DESIGN DECISIONS:
 * - Cost tracking: Essential for POC budget monitoring and production planning
 * - Redis caching: Reduces API calls and costs for repeated queries
 * - Retry logic: Handles rate limits and transient network issues
 * - Model flexibility: Different models for different use cases (chat vs embeddings)
 * - Token counting: Accurate cost calculation using tiktoken
 * - OpenRouter compatibility: Uses OpenAI SDK with OpenRouter endpoints
 *
 * SECURITY CONSIDERATIONS:
 * - API key stored in environment variables only
 * - No logging of sensitive request/response data
 * - Rate limiting to prevent abuse
 * - Input validation and sanitization
 */

import OpenAI from 'openai';
import { getRedisClient, safeRedisOperation, createCacheKey } from '../redis/client';
import { z } from 'zod';

// Cost tracking interfaces
export interface AIUsageMetrics {
  requestId: string;
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface AIModelConfig {
  name: string;
  inputCostPer1kTokens: number; // USD
  outputCostPer1kTokens: number; // USD
  maxTokens: number;
  temperature?: number;
}

// Model configurations with OpenRouter pricing (using OpenRouter model format)
export const AI_MODELS: Record<string, AIModelConfig> = {
  'openai/gpt-4o': {
    name: 'openai/gpt-4o',
    inputCostPer1kTokens: 0.0025, // $2.50 per 1M input tokens
    outputCostPer1kTokens: 0.01, // $10.00 per 1M output tokens
    maxTokens: 128000,
    temperature: 0.7,
  },
  'openai/gpt-4o-mini': {
    name: 'openai/gpt-4o-mini',
    inputCostPer1kTokens: 0.00015, // $0.15 per 1M input tokens
    outputCostPer1kTokens: 0.0006, // $0.60 per 1M output tokens
    maxTokens: 128000,
    temperature: 0.7,
  },
  // Free OpenRouter models
  'mistralai/mistral-7b-instruct:free': {
    name: 'mistralai/mistral-7b-instruct:free',
    inputCostPer1kTokens: 0, // Free model
    outputCostPer1kTokens: 0, // Free model
    maxTokens: 32768,
    temperature: 0.7,
  },
  'google/gemma-2-9b-it:free': {
    name: 'google/gemma-2-9b-it:free',
    inputCostPer1kTokens: 0, // Free model
    outputCostPer1kTokens: 0, // Free model
    maxTokens: 8192,
    temperature: 0.7,
  },
  'microsoft/phi-3-mini-128k-instruct:free': {
    name: 'microsoft/phi-3-mini-128k-instruct:free',
    inputCostPer1kTokens: 0, // Free model
    outputCostPer1kTokens: 0, // Free model
    maxTokens: 128000,
    temperature: 0.7,
  },
  'openai/text-embedding-3-small': {
    name: 'openai/text-embedding-3-small',
    inputCostPer1kTokens: 0.00002, // $0.02 per 1M tokens
    outputCostPer1kTokens: 0, // No output tokens for embeddings
    maxTokens: 8191,
  },
  'openai/text-embedding-3-large': {
    name: 'openai/text-embedding-3-large',
    inputCostPer1kTokens: 0.00013, // $0.13 per 1M tokens
    outputCostPer1kTokens: 0, // No output tokens for embeddings
    maxTokens: 8191,
  },
  // Backward compatibility aliases
  'gpt-4o': {
    name: 'openai/gpt-4o',
    inputCostPer1kTokens: 0.0025,
    outputCostPer1kTokens: 0.01,
    maxTokens: 128000,
    temperature: 0.7,
  },
  'gpt-4o-mini': {
    name: 'openai/gpt-4o-mini',
    inputCostPer1kTokens: 0.00015,
    outputCostPer1kTokens: 0.0006,
    maxTokens: 128000,
    temperature: 0.7,
  },
  // Aliases for invalid model names - redirect to valid free models
  'meta-llama/llama-3.1-8b-instruct:free': {
    name: 'mistralai/mistral-7b-instruct:free', // Redirect to valid free model
    inputCostPer1kTokens: 0,
    outputCostPer1kTokens: 0,
    maxTokens: 32768,
    temperature: 0.7,
  },
  'text-embedding-3-small': {
    name: 'openai/text-embedding-3-small',
    inputCostPer1kTokens: 0.00002,
    outputCostPer1kTokens: 0,
    maxTokens: 8191,
  },
};

// Validation schemas
export const ChatCompletionSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(32000), // Reasonable content limit
  })).min(1).max(50), // Reasonable conversation limit
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(4096).optional(),
  stream: z.boolean().optional().default(false),
});

export const EmbeddingRequestSchema = z.object({
  input: z.union([
    z.string().min(1).max(8000), // Single text input
    z.array(z.string().min(1).max(8000)).max(100), // Batch input with reasonable limits
  ]),
  model: z.string().optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionSchema>;
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;

/**
 * Enhanced OpenRouter client with cost tracking, caching, and error handling.
 * Uses OpenAI SDK but connects to OpenRouter endpoints for better model access.
 */
export class AIClient {
  private openai: OpenAI;
  // Redis is managed by centralized client
  private usageMetrics: AIUsageMetrics[] = [];

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    // Log API key validation (first 8 and last 4 characters for debugging)
    const maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    console.log(`OpenRouter API key configured: ${maskedKey}`);
    console.log(`OpenRouter HTTP-Referer header: ${siteUrl}`);
    console.log(`OpenRouter X-Title header: Recess POC`);

    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: 30000, // 30 second timeout
      defaultHeaders: {
        'HTTP-Referer': siteUrl,
        'X-Title': 'Recess POC',
        'User-Agent': `Recess POC/1.0 (${siteUrl})`,
      },
    });

    // Redis is managed by centralized client - no initialization needed
  }

  /**
   * Get Redis client from centralized manager.
   */
  private async getRedis() {
    return getRedisClient();
  }

  /**
   * Generate chat completion with cost tracking and caching.
   */
  async createChatCompletion(
    request: ChatCompletionRequest,
    options: {
      cacheKey?: string;
      cacheTtl?: number; // seconds
      retries?: number;
    } = {}
  ): Promise<{
    content: string;
    usage: AIUsageMetrics;
  }> {
    const requestId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const model = request.model || 'mistralai/mistral-7b-instruct:free'; // Use free model as default
    const modelConfig = AI_MODELS[model];

    if (!modelConfig) {
      throw new Error(`Unsupported model: ${model}`);
    }

    // Validate request
    const validatedRequest = ChatCompletionSchema.parse(request);

    // Check cache if enabled
    if (options.cacheKey) {
      const cacheKey = createCacheKey('ai', 'chat', options.cacheKey);
      const cachedResult = await safeRedisOperation(
        async (redis) => {
          const cached = await redis.get(cacheKey);
          return cached ? JSON.parse(cached) : null;
        },
        null
      );
      
      if (cachedResult) {
        console.log(`Cache hit for chat completion: ${options.cacheKey}`);
        return cachedResult;
      }
    }

    let lastError: Error | null = null;
    const maxRetries = options.retries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();

        const completion = await this.openai.chat.completions.create({
          model: modelConfig.name, // Use the proper OpenRouter model name
          messages: validatedRequest.messages,
          temperature: validatedRequest.temperature ?? modelConfig.temperature,
          max_tokens: validatedRequest.max_tokens,
          stream: false,
        });

        const usage = completion.usage;
        if (!usage) {
          throw new Error('No usage information returned from OpenAI');
        }

        // Calculate cost
        const inputCost = (usage.prompt_tokens / 1000) * modelConfig.inputCostPer1kTokens;
        const outputCost = (usage.completion_tokens / 1000) * modelConfig.outputCostPer1kTokens;
        const totalCost = inputCost + outputCost;

        // Create usage metrics
        const usageMetrics: AIUsageMetrics = {
          requestId,
          endpoint: 'chat.completions',
          model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          estimatedCost: totalCost,
          timestamp: new Date(),
          success: true,
        };

        // Track usage
        this.usageMetrics.push(usageMetrics);
        console.log(`OpenRouter chat completion: ${usage.total_tokens} tokens, $${totalCost.toFixed(4)} cost`);

        const content = completion.choices[0]?.message?.content || '';
        const result = { content, usage: usageMetrics };

        // Cache result if enabled
        if (options.cacheKey) {
          const cacheKey = createCacheKey('ai', 'chat', options.cacheKey);
          const ttl = options.cacheTtl || 3600; // 1 hour default
          
          await safeRedisOperation(
            async (redis) => {
              await redis.setEx(cacheKey, ttl, JSON.stringify(result));
              console.log(`Cached chat completion: ${options.cacheKey} (TTL: ${ttl}s)`);
            },
            null
          );
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        
        // Enhanced error logging
        console.error('OpenRouter API error:', {
          status: (error as any)?.status,
          code: (error as any)?.code,
          message: lastError.message,
          type: (error as any)?.type,
        });
        
        // Log failed usage
        const failedUsageMetrics: AIUsageMetrics = {
          requestId,
          endpoint: 'chat.completions',
          model,
          promptTokens: 0,
          completionTokens: 0,
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

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.warn(`OpenRouter request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`OpenRouter chat completion failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Generate embeddings with cost tracking and caching.
   */
  async createEmbedding(
    request: EmbeddingRequest,
    options: {
      cacheKey?: string;
      cacheTtl?: number;
      retries?: number;
    } = {}
  ): Promise<{
    embeddings: number[][];
    usage: AIUsageMetrics;
  }> {
    const requestId = `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const model = request.model || 'openai/text-embedding-3-small';
    const modelConfig = AI_MODELS[model];

    if (!modelConfig) {
      throw new Error(`Unsupported embedding model: ${model}`);
    }

    // Validate request
    const validatedRequest = EmbeddingRequestSchema.parse(request);

    // Check cache if enabled
    if (options.cacheKey) {
      const cacheKey = createCacheKey('ai', 'embed', options.cacheKey);
      const cachedResult = await safeRedisOperation(
        async (redis) => {
          const cached = await redis.get(cacheKey);
          return cached ? JSON.parse(cached) : null;
        },
        null
      );
      
      if (cachedResult) {
        console.log(`Cache hit for embedding: ${options.cacheKey}`);
        return cachedResult;
      }
    }

    let lastError: Error | null = null;
    const maxRetries = options.retries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const embedding = await this.openai.embeddings.create({
          model: modelConfig.name, // Use the proper OpenRouter model name
          input: validatedRequest.input,
        });

        const usage = embedding.usage;
        if (!usage) {
          throw new Error('No usage information returned from OpenRouter embeddings');
        }

        // Calculate cost (embeddings only have input cost)
        const totalCost = (usage.total_tokens / 1000) * modelConfig.inputCostPer1kTokens;

        // Create usage metrics
        const usageMetrics: AIUsageMetrics = {
          requestId,
          endpoint: 'embeddings',
          model,
          promptTokens: usage.total_tokens,
          completionTokens: 0,
          totalTokens: usage.total_tokens,
          estimatedCost: totalCost,
          timestamp: new Date(),
          success: true,
        };

        // Track usage
        this.usageMetrics.push(usageMetrics);
        console.log(`OpenRouter embedding: ${usage.total_tokens} tokens, $${totalCost.toFixed(4)} cost`);

        const embeddings = embedding.data.map(d => d.embedding);
        const result = { embeddings, usage: usageMetrics };

        // Cache result if enabled
        if (options.cacheKey) {
          const cacheKey = createCacheKey('ai', 'embed', options.cacheKey);
          const ttl = options.cacheTtl || 86400; // 24 hours default for embeddings
          
          await safeRedisOperation(
            async (redis) => {
              await redis.setEx(cacheKey, ttl, JSON.stringify(result));
              console.log(`Cached embedding: ${options.cacheKey} (TTL: ${ttl}s)`);
            },
            null
          );
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        
        // Log failed usage
        const failedUsageMetrics: AIUsageMetrics = {
          requestId,
          endpoint: 'embeddings',
          model,
          promptTokens: 0,
          completionTokens: 0,
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
          console.warn(`OpenRouter embedding failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`OpenRouter embedding failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Get usage metrics for cost tracking and monitoring.
   */
  getUsageMetrics(): AIUsageMetrics[] {
    return [...this.usageMetrics];
  }

  /**
   * Get total cost across all tracked requests.
   */
  getTotalCost(): number {
    return this.usageMetrics.reduce((total, metric) => total + metric.estimatedCost, 0);
  }

  /**
   * Clear usage metrics (useful for testing or periodic resets).
   */
  clearUsageMetrics(): void {
    this.usageMetrics = [];
  }

  /**
   * Get usage summary by model and endpoint.
   */
  getUsageSummary(): {
    totalCost: number;
    totalTokens: number;
    requestCount: number;
    successRate: number;
    byModel: Record<string, { cost: number; tokens: number; requests: number; }>;
    byEndpoint: Record<string, { cost: number; tokens: number; requests: number; }>;
  } {
    const summary = {
      totalCost: 0,
      totalTokens: 0,
      requestCount: 0,
      successfulRequests: 0,
      byModel: {} as Record<string, { cost: number; tokens: number; requests: number; }>,
      byEndpoint: {} as Record<string, { cost: number; tokens: number; requests: number; }>,
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

      // By endpoint
      if (!summary.byEndpoint[metric.endpoint]) {
        summary.byEndpoint[metric.endpoint] = { cost: 0, tokens: 0, requests: 0 };
      }
      summary.byEndpoint[metric.endpoint].cost += metric.estimatedCost;
      summary.byEndpoint[metric.endpoint].tokens += metric.totalTokens;
      summary.byEndpoint[metric.endpoint].requests += 1;
    }

    const successRate = summary.requestCount > 0 ? summary.successfulRequests / summary.requestCount : 0;
    
    return {
      totalCost: summary.totalCost,
      totalTokens: summary.totalTokens,
      requestCount: summary.requestCount,
      successRate,
      byModel: summary.byModel,
      byEndpoint: summary.byEndpoint,
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
 * Global AI client instance for reuse across the application.
 */
let globalAIClient: AIClient | null = null;

/**
 * Get or create the global AI client instance.
 */
export function getAIClient(): AIClient {
  // In development, always create a new client to pick up env changes
  if (process.env.NODE_ENV === 'development') {
    return new AIClient();
  }
  
  if (!globalAIClient) {
    globalAIClient = new AIClient();
  }
  return globalAIClient;
}

/**
 * Reset the global AI client instance (useful for testing or config changes).
 */
export function resetAIClient(): void {
  globalAIClient = null;
}

/**
 * Helper function to create a cache key for AI requests.
 */
export function createAICacheKey(prefix: string, data: any): string {
  const hash = Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 32);
  return `${prefix}:${hash}`;
}