/**
 * Main embedding generation logic for providers and camps.
 *
 * WHY: This module handles the complete embedding pipeline because:
 * - Combines database queries, text processing, and API calls
 * - Implements caching to avoid redundant API calls
 * - Provides cost tracking and progress monitoring
 * - Handles retries and error recovery
 *
 * DESIGN DECISIONS:
 * - Text combination strategy: Balances completeness with token efficiency
 * - Batch processing: Optimizes API usage and performance
 * - SHA-256 hashing: Ensures cache consistency across runs
 * - Progress logging: Enables monitoring of long-running processes
 */

import { db } from '../db/client';
import { providerTable } from '../db/schema/providers';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { createHash } from 'crypto';
import {
  OpenAIEmbeddingRequest,
  OpenAIEmbeddingResponse,
  ProviderEmbeddingData,
  CampEmbeddingData,
  EmbeddingData,
  EmbeddingGenerationStats,
  EmbeddingGenerationConfig,
  EmbeddingError,
  ProviderWithRelations,
  QdrantPoint,
} from './types';
import {
  QdrantClient,
  createQdrantClient,
  DEFAULT_EMBEDDING_CONFIG,
} from './qdrant-client';
import { getOpenAIEmbeddingsClient, createEmbeddingCacheKey } from '../ai/openai-embeddings-client';
import { getAIClient } from '../ai/openai-client';
import { getLocalEmbeddingsClient } from './local-embeddings-client';
import {
  extractNeighborhoodInfo,
  formatPriceInfo,
  formatCategoryInfo,
  formatAgeInfo,
  createProviderOfferingsText
} from './generator-helpers';

/**
 * Main class for generating and managing embeddings.
 * 
 * Handles the complete pipeline:
 * 1. Fetch data from PostgreSQL
 * 2. Generate text representations
 * 3. Create embeddings via OpenAI API
 * 4. Store embeddings in Qdrant
 * 5. Track costs and performance
 */
export class EmbeddingGenerator {
  private config: EmbeddingGenerationConfig;
  private qdrantClient: QdrantClient;
  private stats: EmbeddingGenerationStats;
  private errors: EmbeddingError[] = [];
  private cache: Map<string, number[]> = new Map();

  constructor(config: Partial<EmbeddingGenerationConfig> = {}) {
    // Override collection name from environment if set
    if (process.env.QDRANT_COLLECTION) {
      config.qdrant_collection = process.env.QDRANT_COLLECTION;
    }
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
    this.qdrantClient = createQdrantClient();
    this.stats = {
      total_items: 0,
      providers_processed: 0,
      camps_processed: 0,
      sessions_processed: 0,
      total_tokens: 0,
      estimated_cost: 0,
      actual_cost: 0,
      failed_items: 0,
      start_time: new Date(),
    };
  }

  /**
   * Initialize the embedding system.
   * 
   * - Tests Qdrant connection
   * - Creates collection if needed
   * - Validates API keys (prefers OpenAI direct, fallback to OpenRouter)
   */
  async initialize(): Promise<void> {
    console.log('Initializing embedding generation system...');

    // Test Qdrant connection
    const isHealthy = await this.qdrantClient.healthCheck();
    if (!isHealthy) {
      throw new Error('Failed to connect to Qdrant. Please check connection settings.');
    }
    console.log('✓ Qdrant connection established');

    // Create collection if it doesn't exist
    const collectionExists = await this.qdrantClient.collectionExists(this.config.qdrant_collection);
    if (!collectionExists) {
      await this.qdrantClient.createCollection({
        name: this.config.qdrant_collection,
        vector_size: 1536, // text-embedding-3-small default size
        distance: 'Cosine',
      });
      console.log(`✓ Created Qdrant collection: ${this.config.qdrant_collection}`);
    } else {
      const info = await this.qdrantClient.getCollectionInfo(this.config.qdrant_collection);
      console.log(`✓ Using existing collection: ${this.config.qdrant_collection} (${info.result.points_count} points)`);
    }

    // Check for embedding capabilities (prefer local, then OpenAI direct, then OpenRouter)
    try {
      const localClient = getLocalEmbeddingsClient();
      console.log('✓ Local embeddings model loaded - using local embeddings (free and fast)');
    } catch (error) {
      const openaiClient = getOpenAIEmbeddingsClient();
      if (openaiClient.isAvailable()) {
        console.log('✓ OpenAI API key found - using direct OpenAI for embeddings');
      } else if (process.env.OPENROUTER_API_KEY) {
        console.log('✓ OpenRouter API key found - using OpenRouter for embeddings (fallback mode)');
      } else {
        throw new Error('No embedding method available. Please set either OPENAI_API_KEY or OPENROUTER_API_KEY environment variable');
      }
    }

    console.log('Initialization complete.\n');
  }

  /**
   * Generate embeddings for all providers and camps.
   * 
   * @param options Generation options
   * @returns Final statistics
   */
  async generateAllEmbeddings(options: {
    providersOnly?: boolean;
    campsOnly?: boolean;
    sessionsOnly?: boolean;
    batchSize?: number;
    skipExisting?: boolean;
  } = {}): Promise<EmbeddingGenerationStats> {
    this.stats.start_time = new Date();
    console.log('Starting embedding generation...\n');

    try {
      // Generate provider embeddings
      if (!options.campsOnly && !options.sessionsOnly) {
        console.log('Generating provider embeddings...');
        await this.generateProviderEmbeddings({
          batchSize: options.batchSize || this.config.batch_size,
          skipExisting: options.skipExisting ?? true,
        });
      }

      // Generate camp embeddings
      if (!options.providersOnly && !options.sessionsOnly) {
        console.log('\nGenerating camp embeddings...');
        await this.generateCampEmbeddings({
          batchSize: options.batchSize || this.config.batch_size,
          skipExisting: options.skipExisting ?? true,
        });
      }

      // Generate session embeddings
      if (!options.providersOnly && !options.campsOnly) {
        console.log('\nGenerating session embeddings...');
        await this.generateSessionEmbeddings({
          batchSize: options.batchSize || this.config.batch_size,
          skipExisting: options.skipExisting ?? true,
        });
      }

      // Finalize stats
      this.stats.end_time = new Date();
      this.stats.duration_seconds = Math.round(
        (this.stats.end_time.getTime() - this.stats.start_time.getTime()) / 1000
      );
      this.stats.actual_cost = this.calculateActualCost();

      console.log('\n🎉 Embedding generation complete!');
      this.printFinalStats();

      return this.stats;
    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for all providers.
   */
  private async generateProviderEmbeddings(options: {
    batchSize: number;
    skipExisting: boolean;
  }): Promise<void> {
    // Fetch all active providers with their camps
    const providers = await this.fetchProviders();
    console.log(`Found ${providers.length} providers to process`);

    if (providers.length === 0) {
      console.log('No providers found to process');
      return;
    }

    // Filter existing embeddings if needed
    let providersToProcess = providers;
    if (options.skipExisting) {
      const existingIds = await this.getExistingProviderIds();
      providersToProcess = providers.filter(p => !existingIds.has(p.id));
      console.log(`${existingIds.size} providers already have embeddings, processing ${providersToProcess.length} remaining`);
    }

    // Process in batches
    const batches = this.createBatches(providersToProcess, options.batchSize);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing provider batch ${i + 1}/${batches.length} (${batch.length} items)`);

      try {
        const processedCount = await this.processBatch(batch, 'provider');
        this.stats.providers_processed += processedCount;
        this.stats.total_items += processedCount;
        this.stats.failed_items += (batch.length - processedCount);
      } catch (error) {
        console.error(`Failed to process provider batch ${i + 1}:`, error);
        this.stats.failed_items += batch.length;
      }

      // Rate limiting - small delay between batches
      if (i < batches.length - 1) {
        await this.delay(100);
      }
    }
  }

  /**
   * Generate embeddings for all camps.
   */
  private async generateCampEmbeddings(options: {
    batchSize: number;
    skipExisting: boolean;
  }): Promise<void> {
    // Fetch all camps
    const camps = await this.fetchCamps();
    console.log(`Found ${camps.length} camps to process`);

    if (camps.length === 0) {
      console.log('No camps found to process');
      return;
    }

    // Filter existing embeddings if needed
    let campsToProcess = camps;
    if (options.skipExisting) {
      const existingIds = await this.getExistingCampIds();
      campsToProcess = camps.filter(c => !existingIds.has(c.id));
      console.log(`${existingIds.size} camps already have embeddings, processing ${campsToProcess.length} remaining`);
    }

    // Process in batches
    const batches = this.createBatches(campsToProcess, options.batchSize);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing camp batch ${i + 1}/${batches.length} (${batch.length} items)`);

      try {
        const processedCount = await this.processBatch(batch, 'camp');
        this.stats.camps_processed += processedCount;
        this.stats.total_items += processedCount;
        this.stats.failed_items += (batch.length - processedCount);
      } catch (error) {
        console.error(`Failed to process camp batch ${i + 1}:`, error);
        this.stats.failed_items += batch.length;
      }

      // Rate limiting - small delay between batches
      if (i < batches.length - 1) {
        await this.delay(100);
      }
    }
  }

  /**
   * Generate embeddings for all sessions (provider_camps).
   */
  private async generateSessionEmbeddings(options: {
    batchSize: number;
    skipExisting: boolean;
  }): Promise<void> {
    // Fetch all sessions
    const sessions = await this.fetchSessions();
    console.log(`Found ${sessions.length} sessions to process`);

    if (sessions.length === 0) {
      console.log('No sessions found to process');
      return;
    }

    // Filter existing embeddings if needed
    let sessionsToProcess = sessions;
    if (options.skipExisting) {
      const existingIds = await this.getExistingSessionIds();
      sessionsToProcess = sessions.filter(s => !existingIds.has(s.id));
      console.log(`${existingIds.size} sessions already have embeddings, processing ${sessionsToProcess.length} remaining`);
    }

    // Process in batches
    const batches = this.createBatches(sessionsToProcess, options.batchSize);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing session batch ${i + 1}/${batches.length} (${batch.length} items)`);

      try {
        const processedCount = await this.processBatch(batch, 'session');
        this.stats.sessions_processed += processedCount;
        this.stats.total_items += processedCount;
        this.stats.failed_items += (batch.length - processedCount);
      } catch (error) {
        console.error(`Failed to process session batch ${i + 1}:`, error);
        this.stats.failed_items += batch.length;
      }

      // Rate limiting - small delay between batches
      if (i < batches.length - 1) {
        await this.delay(100);
      }
    }
  }

  /**
   * Process a batch of items (providers, camps, or sessions).
   * Returns the number of successfully processed items.
   */
  private async processBatch(items: any[], type: 'provider' | 'camp' | 'session'): Promise<number> {
    let successCount = 0;
    
    // Generate text representations
    const textItems = items.map(item => ({
      id: item.id,
      text: type === 'provider' 
        ? this.generateProviderText(item) 
        : type === 'camp' 
          ? this.generateCampText(item)
          : this.generateSessionText(item),
      originalItem: item,
    }));

    // Generate embeddings for all texts in the batch
    let embeddings: number[][];
    try {
      embeddings = await this.generateEmbeddingsBatch(textItems.map(item => item.text));
    } catch (error) {
      console.error(`Failed to generate embeddings for batch:`, error);
      return 0; // Return 0 if embedding generation fails
    }

    // Create Qdrant points with numeric IDs (hash the string ID)
    const points: QdrantPoint[] = [];
    
    for (let i = 0; i < textItems.length; i++) {
      const item = textItems[i];
      const embedding = embeddings[i];
      
      // Validate embedding
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        console.warn(`Invalid embedding for item ${item.id}, skipping`);
        continue;
      }
      
      // Check for null or NaN values in embedding
      const hasInvalidValues = embedding.some(val => val === null || val === undefined || Number.isNaN(val));
      if (hasInvalidValues) {
        console.warn(`Embedding contains invalid values for item ${item.id}, skipping`);
        continue;
      }
      
      // Convert string ID to numeric ID using a simple hash function
      const numericId = typeof item.id === 'string' 
        ? Math.abs(item.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0))
        : item.id;
      
      const point: QdrantPoint = {
        id: numericId,
        vector: embedding,
        payload: {
          type,
          text: item.text,
          original_id: item.id, // Keep original ID in payload
          ...(type === 'provider' 
            ? this.createProviderMetadata(item.originalItem)
            : type === 'camp'
              ? this.createCampMetadata(item.originalItem)
              : this.createSessionMetadata(item.originalItem)
          ),
        },
      };
      
      points.push(point);
    }

    if (points.length === 0) {
      console.warn('No valid points to insert after processing batch');
      return 0;
    }

    // Insert into Qdrant
    try {
      await this.qdrantClient.insertPointsBatch(this.config.qdrant_collection, points);
      successCount = points.length;
      console.log(`Successfully inserted ${successCount} points out of ${items.length} items`);
    } catch (error) {
      console.error(`Failed to insert points into Qdrant:`, error);
      // Try inserting individual points to identify specific failures
      for (const point of points) {
        try {
          await this.qdrantClient.insertPoint(this.config.qdrant_collection, point);
          successCount++;
        } catch (pointError) {
          console.error(`Failed to insert individual point ${point.id}:`, pointError);
        }
      }
    }
    
    return successCount;
  }

  /**
   * Generate embeddings for a batch of texts using OpenAI API.
   */
  private async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      try {
        // Check cache first
        const textHash = this.hashText(text);
        if (this.cache.has(textHash)) {
          embeddings.push(this.cache.get(textHash)!);
          continue;
        }

        // Generate embedding
        const embedding = await this.generateSingleEmbedding(text);
        embeddings.push(embedding);

        // Cache the result
        this.cache.set(textHash, embedding);

        // Small delay to respect rate limits
        await this.delay(50);
      } catch (error) {
        console.error(`Failed to generate embedding for text: ${text.substring(0, 100)}...`, error);
        throw error;
      }
    }

    return embeddings;
  }

  /**
   * Generate a single embedding using local embeddings (preferred), OpenAI direct API, or OpenRouter (fallback).
   */
  private async generateSingleEmbedding(text: string): Promise<number[]> {
    const model = this.config.openai_model;
    
    // Try local embeddings first (free and fast)
    try {
      const localClient = getLocalEmbeddingsClient();
      // Use createOpenAICompatibleEmbedding for 1536 dimensions to match text-embedding-3-small
      const result = await localClient.createOpenAICompatibleEmbedding(text);
      
      // Local embeddings provide usage metrics
      this.stats.total_tokens += result.usage.totalTokens;
      
      return result.embedding;
    } catch (error) {
      console.warn('Local embedding failed, falling back to OpenAI/OpenRouter:', error);
    }

    const openaiClient = getOpenAIEmbeddingsClient();

    try {
      // Try OpenAI direct (if API key is available)
      if (openaiClient.isAvailable()) {
        const cacheKey = createEmbeddingCacheKey(text, model);
        const result = await openaiClient.createSingleEmbedding(text, {
          model,
          cacheKey,
          cacheTtl: 86400, // 24 hours cache
        });

        // Update token stats
        this.stats.total_tokens += result.usage.totalTokens;
        
        return result.embedding;
      }
    } catch (error) {
      console.warn('OpenAI direct embedding failed, falling back to OpenRouter:', error);
    }

    // Fallback to OpenRouter
    return this.generateEmbeddingViaOpenRouter(text, model);
  }

  /**
   * Generate embedding via OpenRouter (fallback method).
   */
  private async generateEmbeddingViaOpenRouter(text: string, model: string): Promise<number[]> {
    // Convert model name to OpenRouter format if needed
    let routerModel = model;
    if (!routerModel.includes('/')) {
      routerModel = `openai/${routerModel}`;
    }

    const openRouterClient = getAIClient();
    const result = await openRouterClient.createEmbedding({
      input: text,
      model: routerModel,
    });

    // Update token stats
    this.stats.total_tokens += result.usage.totalTokens;
    
    return result.embeddings[0];
  }

  /**
   * Generate enhanced text representation for a provider.
   * 
   * ENHANCEMENT: Creates richer, more searchable embeddings by:
   * - Adding structured fields with consistent labels (Ages:, Location:, Price:, etc.)
   * - Weighting provider descriptions 3x higher for better relevance
   * - Including comprehensive session/camp summaries
   * - Using semantic importance markers for critical content
   * 
   * Combines key fields to create rich text for embedding:
   * - Company name and description for identity (weighted 3x)
   * - Location information for geographic relevance
   * - Business details for categorization
   * - Session/camp information for comprehensive coverage
   */
  private generateProviderText(provider: any): string {
    const parts: string[] = [];

    // Company identity - handle both schema formats
    const companyName = provider.companyName || provider.name;
    if (companyName) {
      parts.push(`PROVIDER: ${companyName}`);
    }
    
    // Weight descriptions 3x higher by repeating
    if (provider.description) {
      const description = `DESCRIPTION: ${provider.description}`;
      parts.push(description);
      parts.push(description); // 2nd copy for weighting
      parts.push(description); // 3rd copy for weighting
    }
    
    if (provider.blurb) {
      const blurb = `ABOUT: ${provider.blurb}`;
      parts.push(blurb);
      parts.push(blurb); // 2nd copy for weighting
    }

    // Enhanced location information with structured format
    const locationParts: string[] = [];
    const city = provider.municipality || provider.city;
    const state = provider.administrativeArea || provider.state;
    const postalCode = provider.postalCode || provider.zip_code;
    
    if (city) locationParts.push(city);
    if (state) locationParts.push(state);
    if (postalCode) locationParts.push(postalCode);
    
    if (locationParts.length > 0) {
      parts.push(`LOCATION: ${locationParts.join(' ')}, ${extractNeighborhoodInfo(provider)}`);
    }

    // Structured pricing information
    if (provider.price) {
      parts.push(`PRICE: ${formatPriceInfo(provider.price)}`);
    }
    
    // Enhanced category information
    if (provider.primaryNaics) {
      parts.push(`TYPE: ${formatCategoryInfo(provider.primaryNaics)}`);
    }

    // Features with structured format
    const features: string[] = [];
    if (provider.instantBooking) features.push('instant booking');
    if (provider.website) features.push('online presence');
    if (provider.phone) features.push('phone contact');
    if (provider.email) features.push('email contact');
    
    if (features.length > 0) {
      parts.push(`FEATURES: ${features.join(', ')}`);
    }

    // Enhanced session/camp information with comprehensive offerings
    if (provider.camps && provider.camps.length > 0) {
      const offerings = createProviderOfferingsText(provider.camps);
      if (offerings.summary) {
        parts.push(`OFFERS: ${offerings.summary}`);
      }
      if (offerings.ages) {
        parts.push(`AGES: ${offerings.ages}`);
      }
      if (offerings.schedule) {
        parts.push(`SCHEDULE: ${offerings.schedule}`);
      }
      if (offerings.specialties) {
        parts.push(`SPECIALTIES: ${offerings.specialties}`);
      }
    }

    return parts.join('. ');
  }

  /**
   * Generate enhanced text representation for a camp.
   * 
   * ENHANCEMENT: Creates structured, searchable text with:
   * - Consistent field labels for better matching
   * - Weighted descriptions for relevance
   * - Structured metadata for filtering
   */
  private generateCampText(camp: any): string {
    const parts: string[] = [];

    parts.push(`PROGRAM: ${camp.title}`);
    
    // Weight description 2x higher
    if (camp.description) {
      const description = `DESCRIPTION: ${camp.description}`;
      parts.push(description);
      parts.push(description); // 2nd copy for weighting
    }

    // Structured scheduling information
    if (camp.dateRange) {
      parts.push(`SCHEDULE: ${camp.dateRange}`);
    } else if (camp.date) {
      parts.push(`SCHEDULE: ${camp.date}`);
    }

    if (camp.time) {
      parts.push(`TIME: ${camp.time}`);
    }

    // Enhanced location with context
    if (camp.location) {
      parts.push(`LOCATION: ${camp.location}`);
    }

    // Structured age information
    if (camp.grades) {
      parts.push(`AGES: ${formatAgeInfo(camp.grades)}`);
    }

    // Structured price information
    if (camp.price) {
      parts.push(`PRICE: ${formatPriceInfo(camp.price)}`);
    }

    // Enhanced availability information
    if (camp.spotsLeft || camp.spotsTotal) {
      const availabilityParts = [];
      if (camp.spotsLeft) availabilityParts.push(`${camp.spotsLeft} spots available`);
      if (camp.spotsTotal) availabilityParts.push(`${camp.spotsTotal} capacity`);
      parts.push(`AVAILABILITY: ${availabilityParts.join(', ')}`);
    }

    // Add category information if available
    if (camp.category) {
      parts.push(`TYPE: ${formatCategoryInfo(camp.category)}`);
    }

    // Status information
    if (camp.status) {
      parts.push(`STATUS: ${camp.status}`);
    }

    return parts.join('. ');
  }

  /**
   * Generate enhanced text representation for a session (provider_camp).
   * 
   * ENHANCEMENT: Creates richer embeddings by:
   * - Adding structured fields with consistent labels
   * - Including parent provider context
   * - Weighting descriptions for better relevance
   * 
   * Combines key fields to create rich text for embedding:
   * - Title and description for program identity (weighted)
   * - Provider context for business association
   * - Location and scheduling information (structured)
   * - Age/grade requirements for targeting
   * - Availability and pricing details
   */
  private generateSessionText(session: any): string {
    const parts: string[] = [];

    // Session identity
    parts.push(`SESSION: ${session.title}`);
    
    // Weight description 2x higher
    if (session.description) {
      const description = `DESCRIPTION: ${session.description}`;
      parts.push(description);
      parts.push(description); // 2nd copy for weighting
    }

    // Provider context with enhanced information
    if (session.providerName) {
      parts.push(`PROVIDER: ${session.providerName}`);
    }

    // Enhanced location information
    if (session.location) {
      parts.push(`LOCATION: ${session.location}`);
    } else if (session.providerLocation) {
      parts.push(`LOCATION: ${session.providerLocation}`);
    }

    // Structured scheduling information
    if (session.dateRange) {
      parts.push(`SCHEDULE: ${session.dateRange}`);
    }

    if (session.time) {
      parts.push(`TIME: ${session.time}`);
    }

    // Structured age/grade targeting
    if (session.grades) {
      parts.push(`AGES: ${formatAgeInfo(session.grades)}`);
    }

    // Structured pricing information
    if (session.price) {
      parts.push(`PRICE: ${formatPriceInfo(session.price)}`);
    }

    // Enhanced availability information
    if (session.spotsLeft || session.spotsTotal) {
      const availabilityParts = [];
      if (session.spotsLeft) availabilityParts.push(`${session.spotsLeft} spots available`);
      if (session.spotsTotal) availabilityParts.push(`${session.spotsTotal} capacity`);
      parts.push(`AVAILABILITY: ${availabilityParts.join(', ')}`);
    }

    // Status with importance marker
    if (session.status) {
      parts.push(`STATUS: ${session.status}`);
    }

    return parts.join('. ');
  }

  /**
   * Create metadata for provider embeddings.
   */
  private createProviderMetadata(provider: any): Record<string, any> {
    return {
      provider_id: provider.id,
      company_name: provider.companyName || provider.name,
      market_id: provider.marketId || provider.market_id,
      neighborhood_id: provider.neighborhoodId || provider.neighborhood_id,
      active: provider.active,
      verified: provider.verified,
      location: {
        municipality: provider.municipality || provider.city,
        administrative_area: provider.administrativeArea || provider.state,
        postal_code: provider.postalCode || provider.zip_code,
        address: provider.address,
        latitude: provider.latitude,
        longitude: provider.longitude,
      },
      contact: {
        website: provider.website,
        phone: provider.phone,
        email: provider.email,
      },
      business: {
        primary_naics: provider.primaryNaics,
        instant_booking: provider.instantBooking,
        not_a_fit: provider.notAFit,
      },
      pricing: provider.price,
      created_at: provider.createdAt?.toISOString() || provider.created_at,
      updated_at: provider.updatedAt?.toISOString() || provider.updated_at,
    };
  }

  /**
   * Create metadata for camp embeddings.
   */
  private createCampMetadata(camp: any): Record<string, any> {
    return {
      camp_id: camp.id,
      provider_id: camp.providerId,
      title: camp.title,
      date: camp.date instanceof Date ? camp.date.toISOString() : camp.date,
      date_range: camp.dateRange,
      location: camp.location,
      price: camp.price,
      grades: camp.grades,
      status: camp.status,
      spots_left: camp.spotsLeft,
      spots_total: camp.spotsTotal,
      scraper_name: camp.scraperName,
      created_at: camp.createdAt instanceof Date ? camp.createdAt.toISOString() : camp.createdAt,
    };
  }

  /**
   * Create metadata for session embeddings.
   */
  private createSessionMetadata(session: any): Record<string, any> {
    return {
      session_id: session.id,
      provider_id: session.providerId,
      provider_name: session.providerName,
      title: session.title,
      description: session.description,
      location: session.location,
      provider_location: session.providerLocation,
      grades: session.grades,
      time: session.time,
      date_range: session.dateRange,
      price: session.price,
      spots_left: session.spotsLeft,
      spots_total: session.spotsTotal,
      status: session.status,
      metadata: session.metadata,
      created_at: session.createdAt instanceof Date ? session.createdAt.toISOString() : session.createdAt,
    };
  }

  /**
   * Fetch all providers from database with related data.
   */
  private async fetchProviders(): Promise<any[]> {
    // Debug logging
    console.log(`Database config: ${process.env.PG_USER}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}`);
    console.log(`Is POC database: ${process.env.PG_DATABASE === 'recess_poc'}`);
    
    // Use raw SQL to work with both POC and production database schemas
    const isPOC = process.env.PG_DATABASE === 'recess_poc';
    let providers;
    
    if (isPOC) {
      // POC database schema (no not_a_fit column, different column names)
      providers = await db.execute(`
        SELECT 
          id, name, description, email, phone, website, address,
          city, state, zip_code, latitude, longitude, 
          active, verified, created_at, updated_at
        FROM provider 
        WHERE active = true
      `);
    } else {
      // Main production database schema
      providers = await db.execute(`
        SELECT 
          id, company_name, description, blurb, email, phone, website,
          street_line_1, street_line_2, municipality, administrative_area, postal_code,
          latitude, longitude, active, not_a_fit, primary_naics, price, instant_booking,
          created_at, updated_at
        FROM provider 
        WHERE active = true AND (not_a_fit IS NULL OR not_a_fit = false)
      `);
    }

    // Convert the result to a more usable format
    const providersArray = providers.rows.map((row: any) => {
      if (isPOC) {
        return {
          id: row.id,
          name: row.name,
          companyName: row.name, // Alias for compatibility
          description: row.description,
          email: row.email,
          phone: row.phone,
          website: row.website,
          address: row.address,
          city: row.city,
          state: row.state,
          zip_code: row.zip_code,
          latitude: row.latitude,
          longitude: row.longitude,
          active: row.active,
          verified: row.verified,
          created_at: row.created_at,
          updated_at: row.updated_at,
          camps: [] // Will be populated if needed
        };
      } else {
        // Main database schema mapping
        return {
          id: row.id,
          name: row.company_name,
          companyName: row.company_name,
          description: row.description,
          blurb: row.blurb,
          email: row.email,
          phone: row.phone,
          website: row.website,
          address: row.street_line_1,
          street_line_2: row.street_line_2,
          city: row.municipality,
          municipality: row.municipality,
          state: row.administrative_area,
          administrativeArea: row.administrative_area,
          zip_code: row.postal_code,
          postalCode: row.postal_code,
          latitude: row.latitude,
          longitude: row.longitude,
          active: row.active,
          notAFit: row.not_a_fit,
          primaryNaics: row.primary_naics,
          price: row.price,
          instantBooking: row.instant_booking,
          created_at: row.created_at,
          updated_at: row.updated_at,
          camps: [] // Will be populated if needed
        };
      }
    });

    // For POC database, try to fetch related events
    if (process.env.PG_DATABASE === 'recess_poc') {
      for (const provider of providersArray) {
        try {
          // Using string interpolation since db.execute doesn't support parameters properly
          const events = await db.execute(`
            SELECT 
              id, title, description, category, min_age, max_age,
              start_date, end_date, price, address, city, state
            FROM event 
            WHERE provider_id = '${provider.id}' AND active = true
          `);
          
          (provider as any).camps = events.rows;
        } catch (error) {
          console.warn(`Could not fetch events for provider ${provider.id}:`, error);
          (provider as any).camps = [];
        }
      }
    }

    return providersArray;
  }

  /**
   * Fetch all camps from database.
   */
  private async fetchCamps(): Promise<any[]> {
    let camps: any[] = [];
    
    if (process.env.PG_DATABASE === 'recess_poc') {
      // Use event table for POC database
      const result = await db.execute(`
        SELECT 
          id, provider_id, title, description, category,
          min_age, max_age, start_date, end_date, price,
          address, city, state, zip_code, active, created_at
        FROM event 
        WHERE active = true AND title IS NOT NULL
      `);
      
      camps = result.rows.map((row: any) => ({
        id: row.id,
        providerId: row.provider_id,
        title: row.title,
        description: row.description,
        category: row.category,
        grades: row.min_age && row.max_age ? `${row.min_age}-${row.max_age}` : null,
        date: row.start_date,
        dateRange: row.start_date && row.end_date ? 
          `${row.start_date} to ${row.end_date}` : null,
        price: row.price,
        location: [row.address, row.city, row.state].filter(Boolean).join(', '),
        status: row.active ? 'active' : 'inactive',
        createdAt: row.created_at
      }));
    } else {
      // Use events table for production database (main database)
      const result = await db.execute(`
        SELECT 
          id, market_id, name, start_date_time, end_date_time, 
          is_all_day, location, address, ages, price, 
          is_free, link, created_at, updated_at
        FROM events 
        WHERE name IS NOT NULL
      `);
      
      camps = result.rows.map((row: any) => ({
        id: row.id,
        marketId: row.market_id,
        title: row.name,
        description: null, // events table doesn't have description
        location: row.location,
        address: row.address,
        grades: row.ages,
        date: row.start_date_time,
        dateRange: row.start_date_time && row.end_date_time ? 
          `${row.start_date_time} to ${row.end_date_time}` : null,
        time: row.is_all_day ? 'All day' : null,
        price: row.is_free ? 'Free' : row.price,
        link: row.link,
        status: 'active',
        createdAt: row.created_at
      }));
    }

    return camps;
  }

  /**
   * Fetch all sessions (provider_camps) from database with provider context.
   */
  private async fetchSessions(): Promise<any[]> {
    let sessions: any[] = [];
    
    if (process.env.PG_DATABASE === 'recess_poc') {
      console.log('Sessions not available in POC database (using events instead)');
      return [];
    } else {
      // Use provider_camps table for production database (main database)
      const result = await db.execute(`
        SELECT 
          pc.id, pc.provider_id, pc.title, pc.description, 
          pc.location, pc.grades, pc.time, pc.date_range,
          pc.metadata, pc.status, pc.price, pc.spots_left, pc.spots_total,
          pc.created_at,
          p.company_name as provider_name,
          p.municipality, p.administrative_area, p.postal_code
        FROM provider_camps pc
        LEFT JOIN provider p ON pc.provider_id = p.id
        WHERE pc.title IS NOT NULL
        ORDER BY pc.id
      `);
      
      sessions = result.rows.map((row: any) => ({
        id: row.id,
        providerId: row.provider_id,
        title: row.title,
        description: row.description,
        location: row.location,
        grades: row.grades,
        time: row.time,
        dateRange: row.date_range,
        metadata: row.metadata,
        status: row.status,
        price: row.price,
        spotsLeft: row.spots_left,
        spotsTotal: row.spots_total,
        createdAt: row.created_at,
        providerName: row.provider_name,
        providerLocation: [row.municipality, row.administrative_area, row.postal_code]
          .filter(Boolean).join(', '),
      }));
    }

    return sessions;
  }

  /**
   * Get set of provider IDs that already have embeddings.
   */
  private async getExistingProviderIds(): Promise<Set<number>> {
    try {
      // This would need to be implemented based on how we track existing embeddings
      // For now, return empty set to process all items
      return new Set();
    } catch (error) {
      console.warn('Could not check existing provider embeddings:', error);
      return new Set();
    }
  }

  /**
   * Get set of camp IDs that already have embeddings.
   */
  private async getExistingCampIds(): Promise<Set<number>> {
    try {
      // This would need to be implemented based on how we track existing embeddings
      // For now, return empty set to process all items
      return new Set();
    } catch (error) {
      console.warn('Could not check existing camp embeddings:', error);
      return new Set();
    }
  }

  /**
   * Get set of session IDs that already have embeddings.
   */
  private async getExistingSessionIds(): Promise<Set<number>> {
    try {
      // This would need to be implemented based on how we track existing embeddings
      // For now, return empty set to process all items
      return new Set();
    } catch (error) {
      console.warn('Could not check existing session embeddings:', error);
      return new Set();
    }
  }

  /**
   * Create batches from array of items.
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Hash text content for caching.
   */
  private hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Calculate actual cost based on tokens used from both OpenAI and OpenRouter.
   */
  private calculateActualCost(): number {
    // Get cost from OpenAI client if used
    let openaiCost = 0;
    try {
      const openaiClient = getOpenAIEmbeddingsClient();
      openaiCost = openaiClient.getTotalCost();
    } catch (error) {
      // OpenAI client not available, use fallback calculation
    }

    // Get cost from OpenRouter client if used
    let openRouterCost = 0;
    try {
      const openRouterClient = getAIClient();
      const summary = openRouterClient.getUsageSummary();
      // Only count embedding costs from OpenRouter
      const embeddingCosts = Object.entries(summary.byEndpoint)
        .filter(([endpoint]) => endpoint === 'embeddings')
        .reduce((total, [_, data]) => total + data.cost, 0);
      openRouterCost = embeddingCosts;
    } catch (error) {
      // OpenRouter client not available, use fallback calculation
    }

    // If no client costs available, use the old calculation as fallback
    const fallbackCost = (this.stats.total_tokens / 1000) * this.config.cost_per_1k_tokens;
    
    return openaiCost + openRouterCost || fallbackCost;
  }

  /**
   * Print final statistics.
   */
  private printFinalStats(): void {
    console.log('\n📊 Final Statistics:');
    console.log(`├── Total items processed: ${this.stats.providers_processed + this.stats.camps_processed + this.stats.sessions_processed}`);
    console.log(`├── Providers: ${this.stats.providers_processed}`);
    console.log(`├── Camps: ${this.stats.camps_processed}`);
    console.log(`├── Sessions: ${this.stats.sessions_processed}`);
    console.log(`├── Failed items: ${this.stats.failed_items}`);
    console.log(`├── Total tokens: ${this.stats.total_tokens.toLocaleString()}`);
    console.log(`├── Actual cost: $${this.stats.actual_cost.toFixed(4)}`);
    console.log(`└── Duration: ${this.stats.duration_seconds}s`);
    
    // Show breakdown by service
    try {
      const openaiClient = getOpenAIEmbeddingsClient();
      const openaiSummary = openaiClient.getUsageSummary();
      if (openaiSummary.requestCount > 0) {
        console.log(`\n🤖 OpenAI Direct Usage:`);
        console.log(`├── Requests: ${openaiSummary.requestCount}`);
        console.log(`├── Tokens: ${openaiSummary.totalTokens.toLocaleString()}`);
        console.log(`└── Cost: $${openaiSummary.totalCost.toFixed(6)}`);
      }
    } catch (error) {
      // OpenAI client not available
    }

    try {
      const openRouterClient = getAIClient();
      const routerSummary = openRouterClient.getUsageSummary();
      const embeddingStats = routerSummary.byEndpoint['embeddings'];
      if (embeddingStats?.requests > 0) {
        console.log(`\n🔄 OpenRouter Fallback Usage:`);
        console.log(`├── Requests: ${embeddingStats.requests}`);
        console.log(`├── Tokens: ${embeddingStats.tokens.toLocaleString()}`);
        console.log(`└── Cost: $${embeddingStats.cost.toFixed(6)}`);
      }
    } catch (error) {
      // OpenRouter client not available
    }
    
    if (this.errors.length > 0) {
      console.log(`\n⚠️  ${this.errors.length} errors occurred during processing`);
    }
  }

  /**
   * Delay execution for rate limiting.
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current statistics.
   */
  getStats(): EmbeddingGenerationStats {
    return { ...this.stats };
  }

  /**
   * Get errors that occurred during processing.
   */
  getErrors(): EmbeddingError[] {
    return [...this.errors];
  }
}