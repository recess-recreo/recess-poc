/**
 * AI-powered recommendation engine using vector similarity search with Qdrant.
 *
 * WHY: Intelligent recommendation engine because:
 * - Vector similarity captures semantic meaning better than keyword matching
 * - Parents describe needs in natural language that doesn't match exact categories
 * - AI can consider multiple factors: interests, age, location, schedule, budget
 * - Hybrid search combines semantic similarity with traditional filters
 * - Personalized recommendations improve family engagement and conversion
 *
 * DESIGN DECISIONS:
 * - Qdrant integration: High-performance vector database for semantic search
 * - Hybrid scoring: Combines vector similarity with practical constraints
 * - Multi-factor optimization: Age, interests, location, budget, schedule
 * - Caching strategy: Cache embeddings and results for performance
 * - Fallback mechanisms: Traditional search when vector search fails
 * - Cost optimization: Efficient embedding generation and reuse
 *
 * RECOMMENDATION ALGORITHM:
 * 1. Generate embedding for family's needs and interests
 * 2. Search Qdrant for similar activities using vector similarity
 * 3. Apply practical filters (age, location, budget, schedule)
 * 4. Score activities using weighted factors
 * 5. Rank and categorize recommendations
 * 6. Return diverse recommendations across different match levels
 */

import { getAIClient, createAICacheKey } from './openai-client';
import { getLocalEmbeddingsClient, createLocalEmbeddingCacheKey } from '@/lib/embeddings/local-embeddings-client';
import { createQdrantClient, QdrantClient, QdrantSearchResult } from '@/lib/embeddings/qdrant-client';
import { FamilyProfile } from '@/types/ai';
import { 
  getRecommendationProviders, 
  extractUniqueIds,
  type RecommendationProvider 
} from '@/lib/db/queries/providers';
import { 
  LightweightRecommendation, 
  LightweightRecommendationResult 
} from '@/types/ai';

export interface ActivityMetadata {
  providerId: string;
  programId?: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  interests: string[];
  ageRange: {
    min: number;
    max: number;
  };
  location: {
    neighborhood?: string;
    city?: string;
    zipCode?: string;
    address?: string;
    coordinates?: { lat: number; lng: number };
  };
  schedule: {
    days: string[];
    times: string[];
    recurring?: boolean;
    flexibility?: 'fixed' | 'flexible' | 'very_flexible';
  };
  pricing: {
    type: 'per_session' | 'per_month' | 'per_program' | 'free';
    amount?: number;
    currency?: string;
    range?: { min: number; max: number };
  };
  provider: {
    name: string;
    rating?: number;
    reviewCount?: number;
    verified?: boolean;
    experience?: number; // years
  };
  capacity: {
    maxStudents?: number;
    currentEnrollment?: number;
    waitlist?: boolean;
  };
  requirements?: {
    experience?: string;
    equipment?: string[];
    parentParticipation?: boolean;
  };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RecommendationFilters {
  maxDistance?: number; // miles
  budgetRange?: { min?: number; max?: number };
  schedule?: string[]; // e.g., ['weekday_afternoon', 'weekend_morning']
  ageRanges?: Array<{ min: number; max: number }>;
  interests?: string[];
  categories?: string[];
  languages?: string[];
  specialNeeds?: string[];
  transportationRequired?: boolean;
}

export interface ScoredRecommendation {
  providerId: string;
  programId?: string;
  matchScore: number; // 0-1
  vectorSimilarity: number; // 0-1 from Qdrant
  practicalScore: number; // 0-1 from practical factors
  matchReasons: string[];
  concerns: string[];
  metadata: ActivityMetadata;
  ranking: {
    overall: number;
    age: number;
    interests: number;
    location: number;
    schedule: number;
    budget: number;
    quality: number;
  };
}

export interface RecommendationResult {
  recommendations: ScoredRecommendation[];
  searchMetadata: {
    totalMatches: number;
    vectorSearchResults: number;
    filtersApplied: string[];
    searchQuery: string;
    embedding?: number[];
  };
  performance: {
    vectorSearchMs: number;
    scoringMs: number;
    totalMs: number;
    cacheHit: boolean;
  };
}

/**
 * Recommendation engine that combines vector similarity search with practical filters.
 */
export class RecommendationEngine {
  private qdrantClient: QdrantClient;
  private aiClient: ReturnType<typeof getAIClient>;
  private localEmbeddingsClient: ReturnType<typeof getLocalEmbeddingsClient>;
  private collectionName: string;

  constructor(collectionName: string = 'recess_embeddings') {
    this.qdrantClient = createQdrantClient();
    this.aiClient = getAIClient();
    this.localEmbeddingsClient = getLocalEmbeddingsClient();
    this.collectionName = collectionName;
  }

  /**
   * Generate activity recommendations for a family profile.
   */
  async generateRecommendations(
    familyProfile: FamilyProfile,
    options: {
      limit?: number;
      includeScore?: boolean;
      diversityWeight?: number; // 0-1, higher = more diverse results
      filters?: RecommendationFilters;
      cacheResults?: boolean;
      recommendationType?: string; // 'family', 'all_kids', or child name
    } = {}
  ): Promise<RecommendationResult> {
    const startTime = Date.now();
    const {
      limit = 20,
      includeScore = true,
      diversityWeight = 0.3,
      filters = {},
      cacheResults = true,
      recommendationType,
    } = options;

    try {
      // 1. Generate search query and embedding
      const { searchQuery, embedding, cacheHit: embeddingCacheHit } = await this.generateSearchEmbedding(
        familyProfile,
        { useCache: cacheResults, recommendationType }
      );

      // 2. Perform vector similarity search
      const vectorStartTime = Date.now();
      
      // Validate embedding vector before sending to Qdrant
      if (!Array.isArray(embedding)) {
        throw new Error('Invalid embedding: not an array');
      }
      if (embedding.length === 0) {
        throw new Error('Invalid embedding: empty array');
      }
      const nullIndices = embedding.map((val, idx) => val === null || val === undefined ? idx : -1).filter(idx => idx !== -1);
      if (nullIndices.length > 0) {
        throw new Error(`Invalid embedding: contains ${nullIndices.length} null/undefined values at indices: ${nullIndices.slice(0, 5).join(', ')}`);
      }
      const nanIndices = embedding.map((val, idx) => (typeof val === 'number' && val !== val) ? idx : -1).filter(idx => idx !== -1);
      if (nanIndices.length > 0) {
        throw new Error(`Invalid embedding: contains ${nanIndices.length} NaN values at indices: ${nanIndices.slice(0, 5).join(', ')}`);
      }
      console.log(`Embedding validation passed: ${embedding.length} dimensions, sample values: [${embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}, ..., ${embedding.slice(-3).map(v => v.toFixed(4)).join(', ')}]`);
      
      // Add timeout protection to vector search
      const vectorResults = await Promise.race([
        this.performVectorSearch(
          embedding,
          { limit: Math.floor(Math.min(limit * 2, 50)), filters } // Ensure limit is always an integer for Qdrant
        ),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Vector search timeout: Qdrant search exceeded 5 seconds')), 5000)
        )
      ]);
      const vectorSearchMs = Date.now() - vectorStartTime;

      // 3. Extract unique provider/event IDs from vector results
      const { providerIds, eventIds } = extractUniqueIds(vectorResults);
      console.log(`Vector search found ${providerIds.length} unique providers and ${eventIds.length} events`);

      // 4. Query database for actual provider data
      const databaseStartTime = Date.now();
      
      // Check if we need to limit provider IDs to prevent timeout
      const elapsedSoFar = Date.now() - startTime;
      if (elapsedSoFar > 4000) {
        console.warn(`Time budget exceeded after vector search (${elapsedSoFar}ms). Limiting provider query scope.`);
        providerIds.splice(20); // Limit to first 20 providers
      }
      
      const databaseProviders = await getRecommendationProviders(
        providerIds, 
        eventIds.length > 0 ? eventIds.slice(0, 50) : undefined // Limit events too
      );
      const databaseMs = Date.now() - databaseStartTime;
      console.log(`Database query completed in ${databaseMs}ms, found ${databaseProviders.length} providers`);

      // 5. Apply practical filters and scoring using database data
      const scoringStartTime = Date.now();
      const scoredRecommendations = await this.scoreAndRankDatabaseRecommendations(
        databaseProviders,
        vectorResults,
        familyProfile,
        filters,
        { includeScore, diversityWeight, recommendationType }
      );
      const scoringMs = Date.now() - scoringStartTime;

      // 6. Select final recommendations
      const finalRecommendations = this.selectDiverseRecommendations(
        scoredRecommendations,
        limit,
        diversityWeight
      );

      const totalMs = Date.now() - startTime;

      const result: RecommendationResult = {
        recommendations: finalRecommendations,
        searchMetadata: {
          totalMatches: scoredRecommendations.length,
          vectorSearchResults: vectorResults.length,
          filtersApplied: this.getAppliedFilters(filters),
          searchQuery,
          embedding: includeScore ? embedding : undefined,
        },
        performance: {
          vectorSearchMs,
          scoringMs,
          totalMs,
          cacheHit: embeddingCacheHit,
        },
      };

      // 5. Cache results if enabled
      if (cacheResults) {
        await this.cacheRecommendations(familyProfile, filters, result);
      }

      return result;

    } catch (error) {
      console.error('Recommendation generation failed:', error);
      throw new Error(`Failed to generate recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate lightweight activity recommendations with only IDs and scores.
   * 
   * WHY: Lightweight recommendations to prevent duplicates because:
   * - Vector search returns many similar activities from same providers
   * - Full metadata creates bloated responses with duplicate information
   * - API route needs to deduplicate IDs before fetching full provider data
   * - Separation of concerns: engine finds matches, API route handles data enrichment
   * - Reduces memory usage and network overhead for large result sets
   * 
   * This method returns only provider IDs, event IDs, and scores, allowing the
   * API route to deduplicate and batch-fetch full data efficiently.
   */
  async generateLightweightRecommendations(
    familyProfile: FamilyProfile,
    options: {
      limit?: number;
      includeScore?: boolean;
      diversityWeight?: number; // 0-1, higher = more diverse results
      filters?: RecommendationFilters;
      cacheResults?: boolean;
      recommendationType?: string; // 'family', 'all_kids', or child name
    } = {}
  ): Promise<LightweightRecommendationResult> {
    const startTime = Date.now();
    const {
      limit = 20,
      includeScore = true,
      diversityWeight = 0.3,
      filters = {},
      cacheResults = true,
      recommendationType,
    } = options;

    try {
      // 1. Generate search query and embedding
      const { searchQuery, embedding, cacheHit: embeddingCacheHit } = await this.generateSearchEmbedding(
        familyProfile,
        { useCache: cacheResults, recommendationType }
      );

      // 2. Perform vector similarity search
      const vectorStartTime = Date.now();
      
      // Add timeout protection to vector search
      const vectorResults = await Promise.race([
        this.performVectorSearch(
          embedding,
          { limit: Math.floor(Math.min(limit * 2, 50)), filters } // Get extra for diversity
        ),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Vector search timeout: Qdrant search exceeded 5 seconds')), 5000)
        )
      ]);
      const vectorSearchMs = Date.now() - vectorStartTime;

      // 3. Score and rank using only vector data (no database queries)
      const scoringStartTime = Date.now();
      const lightweightRecommendations = this.scoreLightweightRecommendations(
        vectorResults,
        familyProfile,
        filters,
        { diversityWeight, recommendationType }
      );
      const scoringMs = Date.now() - scoringStartTime;

      // 4. Select final recommendations with diversity
      const finalRecommendations = this.selectDiverseLightweightRecommendations(
        lightweightRecommendations,
        limit,
        diversityWeight
      );

      const totalMs = Date.now() - startTime;

      const result: LightweightRecommendationResult = {
        recommendations: finalRecommendations,
        searchMetadata: {
          totalMatches: lightweightRecommendations.length,
          vectorSearchResults: vectorResults.length,
          filtersApplied: this.getAppliedFilters(filters),
          searchQuery,
          embedding: includeScore ? embedding : undefined,
        },
        performance: {
          vectorSearchMs,
          scoringMs,
          totalMs,
          cacheHit: embeddingCacheHit,
        },
      };

      // 5. Cache results if enabled
      if (cacheResults) {
        await this.cacheLightweightRecommendations(familyProfile, filters, result);
      }

      return result;

    } catch (error) {
      console.error('Lightweight recommendation generation failed:', error);
      throw new Error(`Failed to generate lightweight recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate search embedding from family profile.
   * Uses local embeddings with OpenAI fallback for reliability.
   */
  private async generateSearchEmbedding(
    familyProfile: FamilyProfile,
    options: { useCache?: boolean; recommendationType?: string } = {}
  ): Promise<{ searchQuery: string; embedding: number[]; cacheHit: boolean }> {
    // Build search query from family profile
    const searchQuery = this.buildSearchQuery(familyProfile, options.recommendationType);

    let cacheKey: string | undefined;
    let cacheHit = false;
    
    if (options.useCache) {
      cacheKey = createLocalEmbeddingCacheKey(searchQuery, 'all-MiniLM-L6-v2', 1536, true);
    }

    try {
      // Try local embeddings first (free and fast)
      console.log('Attempting to generate embedding using local model...');
      
      const localResponse = await this.localEmbeddingsClient.createOpenAICompatibleEmbedding(
        searchQuery,
        {
          model: 'all-MiniLM-L6-v2',
          cacheKey,
          cacheTtl: 86400, // 24 hours for embeddings
        }
      );

      console.log(`Generated local search embedding: ${localResponse.embedding.length} dimensions, query: "${searchQuery.slice(0, 100)}..." (${localResponse.usage.processTimeMs}ms)`);

      return { 
        searchQuery, 
        embedding: localResponse.embedding, 
        cacheHit: localResponse.usage.cacheHit || false 
      };

    } catch (localError) {
      console.warn('Local embeddings failed, falling back to OpenAI:', localError);

      // Fallback to OpenAI embeddings
      try {
        const openAICacheKey = options.useCache ? 
          createAICacheKey('rec-embed', { query: searchQuery }) : undefined;

        const embeddingResponse = await this.aiClient.createEmbedding({
          input: searchQuery,
          model: 'text-embedding-3-small', // Cost-effective for search
        }, {
          cacheKey: openAICacheKey,
          cacheTtl: 86400, // 24 hours for embeddings
        });

        const embedding = embeddingResponse.embeddings[0];
        if (!embedding) {
          throw new Error('Failed to generate search embedding');
        }

        console.log(`Generated OpenAI search embedding: ${embedding.length} dimensions, query: "${searchQuery.slice(0, 100)}..."`);

        return { searchQuery, embedding, cacheHit: false };

      } catch (openAIError) {
        console.error('Both local and OpenAI embeddings failed:', { localError, openAIError });
        throw new Error(`Failed to generate search embedding: Local error: ${localError}, OpenAI error: ${openAIError}`);
      }
    }
  }

  /**
   * Build search query text from family profile.
   * 
   * WHY: Enhanced search query building with recommendation type filtering because:
   * - When recommendationType specifies a child, should focus search on that child only
   * - Family activities should include all children for broader matching
   * - Specific child queries need more targeted age and interest matching
   * - Improves relevance of vector search results
   */
  private buildSearchQuery(familyProfile: FamilyProfile, recommendationType?: string): string {
    const parts: string[] = [];

    // Get relevant children based on recommendation type
    const relevantChildren = this.getRelevantChildren(familyProfile, recommendationType);

    // Children information - use only relevant children
    if (relevantChildren.length > 0) {
      const childrenDesc = relevantChildren.map(child => {
        const interests = child.interests.length > 0 ? ` interested in ${child.interests.join(', ')}` : '';
        const special = child.specialNeeds ? ` with special needs: ${child.specialNeeds}` : '';
        return `${child.age}-year-old ${child.name}${interests}${special}`;
      }).join('; ');
      
      if (relevantChildren.length === 1 && recommendationType && recommendationType !== 'family' && recommendationType !== 'all_kids') {
        parts.push(`Activities for ${childrenDesc}`);
      } else {
        parts.push(`Family with children: ${childrenDesc}`);
      }
    }

    // Location
    const location = [
      familyProfile.location.neighborhood,
      familyProfile.location.city,
      familyProfile.location.zipCode
    ].filter(Boolean).join(', ');
    if (location) {
      parts.push(`Located in ${location}`);
    }

    // Activity preferences
    if (familyProfile.preferences?.activityTypes && familyProfile.preferences.activityTypes.length > 0) {
      parts.push(`Looking for ${familyProfile.preferences.activityTypes.join(', ')} activities`);
    }

    // Schedule preferences
    if (familyProfile.preferences?.schedule && familyProfile.preferences.schedule.length > 0) {
      const scheduleMap: Record<string, string> = {
        weekday_morning: 'weekday mornings',
        weekday_afternoon: 'weekday afternoons',
        weekday_evening: 'weekday evenings',
        weekend_morning: 'weekend mornings',
        weekend_afternoon: 'weekend afternoons',
        weekend_evening: 'weekend evenings',
      };
      const scheduleDesc = familyProfile.preferences.schedule
        .map(s => scheduleMap[s] || s)
        .join(', ');
      parts.push(`Available during ${scheduleDesc}`);
    }

    // Budget
    if (familyProfile.preferences?.budget) {
      const { min, max, currency = 'USD' } = familyProfile.preferences.budget;
      if (max) {
        const budgetDesc = min ? `${currency}${min}-${max}` : `up to ${currency}${max}`;
        parts.push(`Budget: ${budgetDesc}`);
      }
    }

    // Languages
    if (familyProfile.preferences?.languages && familyProfile.preferences.languages.length > 0) {
      parts.push(`Languages: ${familyProfile.preferences.languages.join(', ')}`);
    }

    // Additional notes
    if (familyProfile.notes) {
      parts.push(familyProfile.notes);
    }

    return parts.join('. ');
  }

  /**
   * Perform vector similarity search using Qdrant.
   */
  private async performVectorSearch(
    queryEmbedding: number[],
    options: { limit: number; filters: RecommendationFilters }
  ): Promise<Array<QdrantSearchResult & { metadata: ActivityMetadata }>> {
    const { limit, filters } = options;
    
    // Ensure limit is always an integer for Qdrant API
    const integerLimit = Math.floor(Math.max(1, limit));

    // Build Qdrant filter object
    // const qdrantFilter = this.buildQdrantFilter(filters);
    // Temporarily disable complex filters due to JSON serialization issue
    const qdrantFilter = undefined;

    const searchResults = await this.qdrantClient.search({
      collection_name: this.collectionName,
      vector: queryEmbedding,
      limit: integerLimit,
      score_threshold: 0.1, // Minimum similarity threshold
      filter: qdrantFilter,
      with_payload: true,
    });

    // Transform results to include typed metadata
    return searchResults.map(result => ({
      ...result,
      metadata: result.payload as ActivityMetadata,
    }));
  }

  /**
   * Build Qdrant filter object from recommendation filters.
   */
  private buildQdrantFilter(filters: RecommendationFilters): Record<string, any> | undefined {
    const conditions: Array<Record<string, any>> = [];

    // Age range filters
    if (filters.ageRanges && filters.ageRanges.length > 0) {
      const ageConditions = filters.ageRanges.map(range => ({
        bool: {
          must: [
            { range: { key: 'ageRange.min', lte: range.max } },
            { range: { key: 'ageRange.max', gte: range.min } },
          ],
        },
      }));
      
      if (ageConditions.length === 1) {
        conditions.push(ageConditions[0]);
      } else {
        conditions.push({ bool: { should: ageConditions } });
      }
    }

    // Category filters
    if (filters.categories && filters.categories.length > 0) {
      conditions.push({
        bool: {
          should: filters.categories.map(cat => ({ match: { key: 'category', value: cat } })),
        },
      });
    }

    // Interest filters
    if (filters.interests && filters.interests.length > 0) {
      conditions.push({
        bool: {
          should: filters.interests.map(interest => ({ match: { key: 'interests', value: interest } })),
        },
      });
    }

    // Budget filters
    if (filters.budgetRange) {
      const budgetConditions: Array<Record<string, any>> = [];
      
      if (filters.budgetRange.max !== undefined) {
        budgetConditions.push(
          { match: { key: 'pricing.type', value: 'free' } },
          { range: { key: 'pricing.amount', lte: filters.budgetRange.max } },
          { range: { key: 'pricing.range.max', lte: filters.budgetRange.max } }
        );
      }
      
      if (budgetConditions.length > 0) {
        conditions.push({ bool: { should: budgetConditions } });
      }
    }

    return conditions.length > 0 ? { bool: { must: conditions } } : undefined;
  }

  // NOTE: Old scoreAndRankRecommendations method removed in favor of scoreAndRankDatabaseRecommendations
  // which uses the improved database-driven approach to eliminate duplicates at source

  /**
   * Score and rank recommendations based on database provider data.
   * 
   * WHY: Database-driven scoring approach because:
   * - Vector search identifies relevant providers, database provides complete data
   * - Eliminates duplicates at source (unique providers from database)
   * - Uses real provider/program data for accurate scoring
   * - Maintains vector similarity scores for relevance weighting
   * - Properly handles recommendation type filtering for specific children
   */
  private async scoreAndRankDatabaseRecommendations(
    databaseProviders: RecommendationProvider[],
    vectorResults: Array<QdrantSearchResult & { metadata: any }>,
    familyProfile: FamilyProfile,
    filters: RecommendationFilters,
    options: { includeScore: boolean; diversityWeight: number; recommendationType?: string }
  ): Promise<ScoredRecommendation[]> {
    const scoredRecommendations: ScoredRecommendation[] = [];
    
    // Create a map of vector scores for quick lookup
    const vectorScores = new Map<string, number>();
    for (const result of vectorResults) {
      const metadata = result.metadata;
      
      // Extract provider ID from various metadata formats and convert to database format
      const rawProviderId = metadata.provider_id || metadata.providerId || '';
      const providerId = this.convertToProviderDbId(rawProviderId) || '';
      
      // Extract program/camp ID if available - camp_id can be the program ID
      const rawCampId = metadata.camp_id || 0;
      const rawProgramId = metadata.programId || rawCampId;
      const programId = this.convertToEventDbId(rawProgramId) || 'default';
      
      // Use provider-program combination as key with proper database formats
      const key = `${providerId}-${programId}`;
      
      // Keep the highest vector score for each provider-program combo
      if (!vectorScores.has(key) || vectorScores.get(key)! < result.score) {
        vectorScores.set(key, result.score);
      }
    }

    // Get relevant children based on recommendation type
    const relevantChildren = this.getRelevantChildren(familyProfile, options.recommendationType);

    // Optimize scoring with early exit conditions and batch processing
    const maxRecommendations = 100; // Limit processing to top candidates
    let processedCount = 0;
    
    for (const provider of databaseProviders) {
      // Early exit if we've processed enough candidates
      if (processedCount >= maxRecommendations) {
        console.log(`Early exit: processed ${processedCount} candidates to optimize performance`);
        break;
      }

      // Handle providers with events
      if (provider.events.length > 0) {
        // Limit events per provider to prevent excessive processing
        const eventsToProcess = provider.events.slice(0, 5); // Max 5 events per provider
        
        for (const event of eventsToProcess) {
          const key = `${provider.id}-${event.id}`;
          const vectorSimilarity = vectorScores.get(key) || vectorScores.get(`${provider.id}-default`) || 0.5;
          
          // Quick relevance check before expensive scoring
          if (vectorSimilarity < 0.3) {
            continue; // Skip low-relevance items
          }
          
          const scoredRecommendation = this.scoreProviderEvent(
            provider, 
            event, 
            vectorSimilarity, 
            familyProfile, 
            relevantChildren, 
            filters,
            options.recommendationType
          );
          
          if (scoredRecommendation && scoredRecommendation.matchScore >= 0.3) {
            scoredRecommendations.push(scoredRecommendation);
            processedCount++;
          }
        }
      } else {
        // Handle providers without specific events
        const key = `${provider.id}-default`;
        const vectorSimilarity = vectorScores.get(key) || 0.5;
        
        // Quick relevance check before expensive scoring
        if (vectorSimilarity < 0.3) {
          continue; // Skip low-relevance items
        }
        
        const scoredRecommendation = this.scoreProviderEvent(
          provider, 
          null, 
          vectorSimilarity, 
          familyProfile, 
          relevantChildren, 
          filters,
          options.recommendationType
        );
        
        if (scoredRecommendation && scoredRecommendation.matchScore >= 0.3) {
          scoredRecommendations.push(scoredRecommendation);
          processedCount++;
        }
      }
    }

    // Sort by match score
    const finalRecommendations = scoredRecommendations.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log(`Database scoring: ${databaseProviders.length} providers → ${finalRecommendations.length} scored recommendations`);
    
    return finalRecommendations;
  }

  /**
   * Score individual provider-event combination.
   */
  private scoreProviderEvent(
    provider: RecommendationProvider,
    event: RecommendationProvider['events'][0] | null,
    vectorSimilarity: number,
    familyProfile: FamilyProfile,
    relevantChildren: FamilyProfile['children'],
    filters: RecommendationFilters,
    recommendationType?: string
  ): ScoredRecommendation | null {
    // Create metadata structure from database provider data
    const metadata: ActivityMetadata = {
      providerId: provider.id,
      programId: event?.id ? String(event.id) : undefined,
      name: event?.title || provider.name,
      description: event?.description || provider.description || '',
      category: event?.category || 'General',
      subcategory: undefined,
      interests: this.inferInterestsFromEvent(event) || [],
      ageRange: this.extractAgeRangeFromEvent(event) || this.extractAgeRangeFromProvider(provider) || { min: 3, max: 18 },
      location: {
        neighborhood: undefined, // No neighborhood in current schema
        city: event?.city || provider.city || undefined,
        zipCode: event?.zipCode || provider.zipCode || undefined,
        address: event?.address || provider.address || undefined,
        coordinates: event?.latitude && event?.longitude ? {
          lat: parseFloat(event.latitude.toString()),
          lng: parseFloat(event.longitude.toString())
        } : (provider.latitude && provider.longitude ? {
          lat: parseFloat(provider.latitude),
          lng: parseFloat(provider.longitude)
        } : undefined)
      },
      schedule: this.extractScheduleFromEvent(event) || { days: [], times: [], recurring: false, flexibility: 'flexible' },
      pricing: this.extractPricingFromEvent(event, provider),
      provider: {
        name: provider.name,
        rating: undefined,
        reviewCount: undefined,
        verified: provider.verified,
        experience: undefined
      },
      capacity: {
        maxStudents: event?.capacity || undefined,
        currentEnrollment: event?.enrolled || undefined,
        waitlist: false,
      },
      requirements: undefined,
      tags: [event?.category].filter((tag): tag is string => Boolean(tag)),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Calculate scoring factors
    const ageScore = this.calculateAgeScore(metadata.ageRange, relevantChildren);
    const interestScore = this.calculateInterestScore(metadata.interests, familyProfile);
    const locationScore = this.calculateLocationScore(metadata.location, familyProfile.location);
    const scheduleScore = this.calculateScheduleScore(metadata.schedule, familyProfile.preferences?.schedule);
    const budgetScore = this.calculateBudgetScore(metadata.pricing, familyProfile.preferences?.budget);
    const qualityScore = this.calculateQualityScore(metadata.provider);

    // Weighted overall score
    const weights = {
      vector: 0.3,
      age: 0.25,
      interests: 0.2,
      location: 0.1,
      schedule: 0.1,
      budget: 0.03,
      quality: 0.02,
    };

    const practicalScore = (
      ageScore * weights.age +
      interestScore * weights.interests +
      locationScore * weights.location +
      scheduleScore * weights.schedule +
      budgetScore * weights.budget +
      qualityScore * weights.quality
    ) / (weights.age + weights.interests + weights.location + weights.schedule + weights.budget + weights.quality);

    const matchScore = (vectorSimilarity * weights.vector + practicalScore * (1 - weights.vector));

    // Skip if score is too low
    if (matchScore < 0.2) return null;

    // Generate match reasons and concerns (simplified for performance)
    const matchReasons: string[] = [];
    const concerns: string[] = [];
    
    // Only generate detailed explanations for high-scoring matches to save time
    if (matchScore >= 0.7) {
      const explanation = this.generateMatchExplanation(
        metadata,
        familyProfile,
        { ageScore, interestScore, locationScore, scheduleScore, budgetScore, qualityScore },
        recommendationType
      );
      matchReasons.push(...explanation.matchReasons);
      concerns.push(...explanation.concerns);
    } else {
      // Simplified explanations for lower scores
      if (ageScore >= 0.7) matchReasons.push('Good age fit');
      if (interestScore >= 0.7) matchReasons.push('Matches interests');
      if (locationScore >= 0.7) matchReasons.push('Convenient location');
      if (ageScore < 0.3) concerns.push('Age range may not be ideal');
      if (locationScore < 0.4) concerns.push('May require travel');
    }

    return {
      providerId: provider.id,
      programId: event?.id ? String(event.id) : undefined,
      matchScore,
      vectorSimilarity,
      practicalScore,
      matchReasons,
      concerns,
      metadata,
      ranking: {
        overall: matchScore,
        age: ageScore,
        interests: interestScore,
        location: locationScore,
        schedule: scheduleScore,
        budget: budgetScore,
        quality: qualityScore,
      },
    };
  }

  /**
   * Extract age range from actual metadata structure.
   * 
   * WHY: Comprehensive age extraction because:
   * - provider_camps use `grades` field (e.g., "K-5", "6-12", "PreK-K")
   * - events use `ages` field with various formats
   * - some have numeric min_age/max_age fields
   * - need to handle edge cases like "All ages", "Adults", etc.
   * - Austin data has diverse age specifications
   * 
   * FORMATS HANDLED:
   * - Grades: "K-5", "6-12", "PreK-2", "9-12" 
   * - Ages: "3-5", "6-10", "All ages", "Adults only"
   * - Direct fields: min_age, max_age, age_min, age_max
   * - Text parsing: "ages 4-8", "for 6 year olds"
   */
  private extractAgeRangeFromMetadata(metadata: any): { min: number; max: number } | null {
    // Remove debug logging to optimize performance

    // Method 1: Direct age fields (most reliable)
    if (metadata.min_age !== undefined && metadata.max_age !== undefined) {
      const min = parseInt(metadata.min_age);
      const max = parseInt(metadata.max_age);
      if (!isNaN(min) && !isNaN(max) && min >= 0 && max <= 25 && min <= max) {
        return { min, max };
      }
    }

    // Method 2: Alternative age field names
    if (metadata.age_min !== undefined && metadata.age_max !== undefined) {
      const min = parseInt(metadata.age_min);
      const max = parseInt(metadata.age_max);
      if (!isNaN(min) && !isNaN(max) && min >= 0 && max <= 25 && min <= max) {
        return { min, max };
      }
    }

    // Method 3: Parse grades field (common in provider_camps)
    if (metadata.grades && typeof metadata.grades === 'string') {
      const ageRange = this.parseGradesString(metadata.grades);
      if (ageRange) {
        return ageRange;
      }
    }

    // Method 4: Parse ages field (common in events)
    if (metadata.ages && typeof metadata.ages === 'string') {
      const ageRange = this.parseAgesString(metadata.ages);
      if (ageRange) {
        return ageRange;
      }
    }

    // Method 5: Parse from text description
    const textFields = [
      metadata.text,
      metadata.description, 
      metadata.title,
      metadata.company_name
    ].filter(Boolean);
    
    for (const text of textFields) {
      if (typeof text === 'string') {
        const ageRange = this.parseAgesFromText(text);
        if (ageRange) {
          return ageRange;
        }
      }
    }

    // Skip logging to optimize performance
    return null;
  }

  /**
   * Parse grade strings like "K-5", "6-12", "PreK-2" into age ranges.
   */
  private parseGradesString(grades: string): { min: number; max: number } | null {
    const gradeStr = grades.toLowerCase().trim();
    
    // Handle common grade range patterns
    const patterns = [
      // "K-5", "k-5"
      /^k-(\d+)$/,
      // "PreK-K", "prek-k"
      /^pre?k-k$/,
      // "PreK-2", "prek-2"
      /^pre?k-(\d+)$/,
      // "6-12", "9-12"
      /^(\d+)-(\d+)$/,
      // "Kindergarten", "K"
      /^k(?:indergarten)?$/,
      // "PreK", "Pre-K"
      /^pre?-?k$/,
    ];

    // Grade to age mapping (approximate)
    const gradeToAge: Record<string, { min: number; max: number }> = {
      'prek': { min: 3, max: 4 },
      'pre-k': { min: 3, max: 4 },
      'k': { min: 5, max: 6 },
      'kindergarten': { min: 5, max: 6 },
      '1': { min: 6, max: 7 },
      '2': { min: 7, max: 8 },
      '3': { min: 8, max: 9 },
      '4': { min: 9, max: 10 },
      '5': { min: 10, max: 11 },
      '6': { min: 11, max: 12 },
      '7': { min: 12, max: 13 },
      '8': { min: 13, max: 14 },
      '9': { min: 14, max: 15 },
      '10': { min: 15, max: 16 },
      '11': { min: 16, max: 17 },
      '12': { min: 17, max: 18 },
    };

    // K-5 pattern
    let match = gradeStr.match(/^k-(\d+)$/);
    if (match) {
      const endGrade = parseInt(match[1]);
      return { min: 5, max: gradeToAge[endGrade.toString()]?.max || (5 + endGrade) };
    }

    // PreK-K pattern
    if (gradeStr.match(/^pre?k-k$/)) {
      return { min: 3, max: 6 };
    }

    // PreK-2 pattern
    match = gradeStr.match(/^pre?k-(\d+)$/);
    if (match) {
      const endGrade = parseInt(match[1]);
      return { min: 3, max: gradeToAge[endGrade.toString()]?.max || (6 + endGrade) };
    }

    // Numeric grade range: 6-12
    match = gradeStr.match(/^(\d+)-(\d+)$/);
    if (match) {
      const startGrade = parseInt(match[1]);
      const endGrade = parseInt(match[2]);
      if (startGrade <= endGrade && startGrade >= 0 && endGrade <= 12) {
        const startAge = gradeToAge[startGrade.toString()]?.min || (5 + startGrade);
        const endAge = gradeToAge[endGrade.toString()]?.max || (5 + endGrade + 1);
        return { min: startAge, max: endAge };
      }
    }

    // Single grade patterns
    if (gradeToAge[gradeStr]) {
      return gradeToAge[gradeStr];
    }

    return null;
  }

  /**
   * Parse age strings like "3-5", "6-10", "All ages", "Adults" into age ranges.
   */
  private parseAgesString(ages: string): { min: number; max: number } | null {
    const ageStr = ages.toLowerCase().trim();
    
    // Handle special cases
    if (ageStr.includes('all ages') || ageStr.includes('any age')) {
      return { min: 0, max: 18 };
    }
    
    if (ageStr.includes('adult') || ageStr.includes('18+') || ageStr.includes('grown up')) {
      return { min: 18, max: 99 };
    }
    
    if (ageStr.includes('toddler')) {
      return { min: 1, max: 3 };
    }
    
    if (ageStr.includes('preschool') || ageStr.includes('pre-school')) {
      return { min: 3, max: 5 };
    }
    
    if (ageStr.includes('infant') || ageStr.includes('baby')) {
      return { min: 0, max: 2 };
    }

    // Numeric range patterns: "3-5", "6-10", "ages 4-8"
    const patterns = [
      /^(\d+)\s*-\s*(\d+)$/,
      /ages?\s+(\d+)\s*-\s*(\d+)/,
      /^(\d+)\s*to\s*(\d+)$/,
      /(\d+)\s*through\s*(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = ageStr.match(pattern);
      if (match) {
        const min = parseInt(match[1]);
        const max = parseInt(match[2]);
        if (!isNaN(min) && !isNaN(max) && min >= 0 && max <= 25 && min <= max) {
          return { min, max };
        }
      }
    }

    // Single age patterns: "age 5", "5 years", "for 6 year olds"
    const singleAgePatterns = [
      /^(\d+)\s*(?:years?\s*old|yo)$/,
      /^age\s*(\d+)$/,
      /^(\d+)\s*years?$/,
      /for\s*(\d+)\s*year\s*olds?/,
    ];

    for (const pattern of singleAgePatterns) {
      const match = ageStr.match(pattern);
      if (match) {
        const age = parseInt(match[1]);
        if (!isNaN(age) && age >= 0 && age <= 25) {
          // Single age gets +/- 1 year flexibility
          return { min: Math.max(0, age - 1), max: Math.min(18, age + 1) };
        }
      }
    }

    return null;
  }

  /**
   * Parse age information from general text descriptions.
   */
  private parseAgesFromText(text: string): { min: number; max: number } | null {
    const lowerText = text.toLowerCase();
    
    // Look for age patterns in the text
    const patterns = [
      /ages?\s+(\d+)\s*-\s*(\d+)/g,
      /(\d+)\s*to\s*(\d+)\s*years?\s*old/g,
      /for\s*(\d+)\s*-\s*(\d+)\s*year\s*olds?/g,
      /grades?\s+(\d+)\s*-\s*(\d+)/g,
      /grade\s+k\s*-\s*(\d+)/g,
    ];

    for (const pattern of patterns) {
      const matches = Array.from(lowerText.matchAll(pattern));
      for (const match of matches) {
        if (pattern.source.includes('grade\s+k')) {
          // Handle "grade k-5" pattern
          const endGrade = parseInt(match[1]);
          if (!isNaN(endGrade) && endGrade >= 1 && endGrade <= 12) {
            return { min: 5, max: 5 + endGrade + 1 };
          }
        } else {
          // Handle numeric age ranges
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          if (!isNaN(min) && !isNaN(max) && min >= 0 && max <= 25 && min <= max) {
            return { min, max };
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract interests/categories from metadata.
   */
  private extractInterestsFromMetadata(metadata: any): string[] {
    const interests: string[] = [];
    
    // Add actual interest-related metadata, not IDs or titles
    if (metadata.category) interests.push(metadata.category);
    
    // Add provider name as an interest for filtering/matching
    if (metadata.provider_name) interests.push(metadata.provider_name);
    if (metadata.company_name) interests.push(metadata.company_name);
    
    // Only add title if it's different from provider name (to avoid duplication)
    if (metadata.title && metadata.title !== metadata.provider_name && metadata.title !== metadata.company_name) {
      interests.push(metadata.title);
    }
    
    // Skip numeric NAICS codes as they're not user-friendly interests
    
    return interests;
  }

  /**
   * Extract location from metadata.
   */
  private extractLocationFromMetadata(metadata: any): ActivityMetadata['location'] {
    const location: ActivityMetadata['location'] = {};
    
    if ((metadata as any).location) {
      if (typeof (metadata as any).location === 'string') {
        // Parse string location like "Austin, TX"
        const parts = (metadata as any).location.split(',').map((p: string) => p.trim());
        if (parts.length >= 2) {
          location.city = parts[0];
          location.address = (metadata as any).location;
        }
      } else if (typeof (metadata as any).location === 'object') {
        location.city = (metadata as any).location.municipality || (metadata as any).location.city;
        location.zipCode = (metadata as any).location.postal_code;
        location.address = (metadata as any).location.address;
        if ((metadata as any).location.latitude && (metadata as any).location.longitude) {
          location.coordinates = {
            lat: parseFloat((metadata as any).location.latitude),
            lng: parseFloat((metadata as any).location.longitude)
          };
        }
      }
    }
    
    return location;
  }

  /**
   * Extract schedule info from metadata with real provider data.
   * 
   * WHY: Enhanced schedule extraction because:
   * - Provider data contains actual schedule information in various fields
   * - Some providers specify days, hours, or operating schedules
   * - Events often have specific date/time information
   * - Need to handle different data formats from camps vs providers vs events
   * - Schedule compatibility is crucial for family matching
   */
  private extractScheduleFromMetadata(metadata: any): ActivityMetadata['schedule'] {
    const schedule: ActivityMetadata['schedule'] = {
      days: [],
      times: [],
      recurring: false,
      flexibility: 'flexible'
    };

    // Extract days of operation
    if (metadata.days_of_operation) {
      schedule.days = this.parseDaysString(metadata.days_of_operation);
    } else if (metadata.schedule && typeof metadata.schedule === 'string') {
      schedule.days = this.parseDaysString(metadata.schedule);
    } else if (metadata.operating_days) {
      schedule.days = this.parseDaysString(metadata.operating_days);
    }

    // Extract hours/times of operation
    if (metadata.hours_of_operation) {
      schedule.times = this.parseTimesString(metadata.hours_of_operation);
    } else if (metadata.operating_hours) {
      schedule.times = this.parseTimesString(metadata.operating_hours);
    } else if (metadata.hours) {
      schedule.times = this.parseTimesString(metadata.hours);
    }

    // Check for recurring patterns
    if (metadata.recurring !== undefined) {
      schedule.recurring = Boolean(metadata.recurring);
    } else if (metadata.type === 'camp' || metadata.type === 'class' || metadata.type === 'program') {
      schedule.recurring = true; // Assume camps and classes are recurring
    } else if (metadata.type === 'event') {
      schedule.recurring = false; // Events are typically one-time
    }

    // Determine flexibility based on available data
    if (metadata.flexibility) {
      schedule.flexibility = metadata.flexibility;
    } else if (schedule.days.length > 0 && schedule.times.length > 0) {
      schedule.flexibility = 'fixed'; // Has specific schedule
    } else if (schedule.days.length > 0 || schedule.times.length > 0) {
      schedule.flexibility = 'flexible'; // Partial schedule info
    } else {
      schedule.flexibility = 'very_flexible'; // No specific schedule
    }

    // For activities without specific schedule data, try to infer from text
    if (schedule.days.length === 0 && schedule.times.length === 0) {
      const textFields = [
        metadata.text,
        metadata.description,
        metadata.title,
        metadata.notes
      ].filter(Boolean);

      for (const text of textFields) {
        if (typeof text === 'string') {
          const inferredDays = this.inferDaysFromText(text);
          const inferredTimes = this.inferTimesFromText(text);
          
          if (inferredDays.length > 0) {
            schedule.days = [...schedule.days, ...inferredDays];
          }
          if (inferredTimes.length > 0) {
            schedule.times = [...schedule.times, ...inferredTimes];
          }
        }
      }
    }

    return schedule;
  }

  /**
   * Parse days string into standardized day names.
   */
  private parseDaysString(daysStr: string): string[] {
    if (!daysStr || typeof daysStr !== 'string') return [];
    
    const dayMappings: Record<string, string[]> = {
      'monday': ['monday', 'mon'],
      'tuesday': ['tuesday', 'tue', 'tues'],
      'wednesday': ['wednesday', 'wed'],
      'thursday': ['thursday', 'thu', 'thurs'],
      'friday': ['friday', 'fri'],
      'saturday': ['saturday', 'sat'],
      'sunday': ['sunday', 'sun'],
      'weekdays': ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      'weekends': ['saturday', 'sunday'],
    };

    const days: string[] = [];
    const lowerStr = daysStr.toLowerCase();

    for (const [standardDay, variations] of Object.entries(dayMappings)) {
      if (variations.some(variant => lowerStr.includes(variant))) {
        if (standardDay === 'weekdays') {
          days.push('monday', 'tuesday', 'wednesday', 'thursday', 'friday');
        } else if (standardDay === 'weekends') {
          days.push('saturday', 'sunday');
        } else {
          days.push(standardDay);
        }
      }
    }

    return [...new Set(days)]; // Remove duplicates
  }

  /**
   * Parse time string into time values.
   */
  private parseTimesString(timesStr: string): string[] {
    if (!timesStr || typeof timesStr !== 'string') return [];
    
    const times: string[] = [];
    
    // Match various time formats: "9:00 AM", "2:30 PM", "14:00", etc.
    const timeMatches = timesStr.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?/g);
    
    if (timeMatches) {
      times.push(...timeMatches);
    }

    // Also look for hour ranges: "9am-5pm", "9:00-17:00"
    const rangeMatches = timesStr.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi);
    
    if (rangeMatches) {
      for (const range of rangeMatches) {
        times.push(range);
      }
    }

    return times;
  }

  /**
   * Infer days from text description.
   */
  private inferDaysFromText(text: string): string[] {
    const days: string[] = [];
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('weekday') || lowerText.includes('monday through friday') || lowerText.includes('m-f')) {
      days.push('monday', 'tuesday', 'wednesday', 'thursday', 'friday');
    }
    if (lowerText.includes('weekend') || lowerText.includes('saturday and sunday') || lowerText.includes('sat-sun')) {
      days.push('saturday', 'sunday');
    }
    
    // Individual days
    const dayWords = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of dayWords) {
      if (lowerText.includes(day)) {
        days.push(day);
      }
    }
    
    return [...new Set(days)];
  }

  /**
   * Infer times from text description.
   */
  private inferTimesFromText(text: string): string[] {
    const times: string[] = [];
    
    // Look for time-related phrases
    const timePatterns = [
      /\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi,
      /morning/gi,
      /afternoon/gi,
      /evening/gi,
      /after school/gi,
      /before school/gi,
    ];
    
    for (const pattern of timePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        times.push(...matches);
      }
    }
    
    return times;
  }

  /**
   * Extract pricing from metadata.
   */
  private extractPricingFromMetadata(metadata: any): ActivityMetadata['pricing'] {
    const pricing: ActivityMetadata['pricing'] = { type: 'per_session' };
    
    if (metadata.price || metadata.pricing) {
      const priceStr = metadata.price || metadata.pricing;
      if (typeof priceStr === 'string') {
        if (priceStr.toLowerCase().includes('free')) {
          pricing.type = 'free';
        } else {
          // Try to extract numeric price
          const match = priceStr.match(/\$?(\d+)/);
          if (match) {
            pricing.amount = parseInt(match[1]);
            pricing.currency = 'USD';
          }
        }
      }
    }
    
    return pricing;
  }

  /**
   * Extract provider info from metadata.
   */
  private extractProviderFromMetadata(metadata: any): ActivityMetadata['provider'] {
    return {
      name: metadata.provider_name || metadata.company_name || metadata.title || 'Unknown Provider',
      rating: undefined,
      reviewCount: undefined,
      verified: metadata.verified || false,
      experience: undefined
    };
  }

  /**
   * Calculate age appropriateness score.
   * 
   * WHY: Improved age scoring because:
   * - Need to handle missing age data gracefully (common in real data)
   * - Should provide partial credit for close age matches
   * - Account for activity flexibility (some work for wider ranges)
   * - Penalize completely inappropriate ages while rewarding perfect matches
   * - Handle edge cases like single child vs multiple children families
   */
  private calculateAgeScore(activityAgeRange: { min: number; max: number } | null | undefined, children: FamilyProfile['children']): number {
    if (children.length === 0) return 0.5;

    // Handle missing age range data - use educated guessing
    if (!activityAgeRange || typeof activityAgeRange.min !== 'number' || typeof activityAgeRange.max !== 'number') {
      // Return slightly below neutral to prefer activities with known age ranges
      return 0.4;
    }

    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const child of children) {
      maxPossibleScore += 1; // Each child can contribute up to 1.0
      
      // Perfect match (child age within range)
      if (child.age >= activityAgeRange.min && child.age <= activityAgeRange.max) {
        totalScore += 1.0;
      }
      // Close match (within 1 year of range)
      else if (
        (child.age >= activityAgeRange.min - 1 && child.age < activityAgeRange.min) ||
        (child.age > activityAgeRange.max && child.age <= activityAgeRange.max + 1)
      ) {
        totalScore += 0.7;
      }
      // Nearby match (within 2 years of range)
      else if (
        (child.age >= activityAgeRange.min - 2 && child.age < activityAgeRange.min - 1) ||
        (child.age > activityAgeRange.max + 1 && child.age <= activityAgeRange.max + 2)
      ) {
        totalScore += 0.4;
      }
      // Far from range (more than 2 years off)
      else {
        const distanceFromRange = Math.min(
          Math.abs(child.age - activityAgeRange.min),
          Math.abs(child.age - activityAgeRange.max)
        );
        // Give minimal credit for very far ages, zero for extremely inappropriate
        if (distanceFromRange <= 5) {
          const farScore = Math.max(0.1, 0.3 - (distanceFromRange * 0.05));
          totalScore += farScore;
        }
      }
    }

    const finalScore = totalScore / maxPossibleScore;
    
    return Math.min(1, Math.max(0, finalScore));
  }

  /**
   * Calculate interest alignment score.
   */
  private calculateInterestScore(activityInterests: string[], familyProfile: FamilyProfile): number {
    const childInterests = familyProfile.children.flatMap(child => child.interests);
    const preferredActivities = familyProfile.preferences?.activityTypes || [];
    const allInterests = [...childInterests, ...preferredActivities];

    if (allInterests.length === 0) return 0.5; // Neutral if no interests specified

    const matchingInterests = activityInterests.filter(interest =>
      allInterests.some(familyInterest =>
        interest.toLowerCase().includes(familyInterest.toLowerCase()) ||
        familyInterest.toLowerCase().includes(interest.toLowerCase())
      )
    );

    return Math.min(matchingInterests.length / Math.max(allInterests.length, activityInterests.length), 1);
  }

  /**
   * Calculate location convenience score using distance and Austin geography.
   * 
   * WHY: Production-quality location scoring because:
   * - Parents care deeply about travel time and distance
   * - Austin traffic patterns make some short distances take longer
   * - Need to handle missing coordinate data gracefully
   * - Should account for both distance and neighborhood familiarity
   * - ZIP code proximity is important for Austin families
   */
  private calculateLocationScore(
    activityLocation: ActivityMetadata['location'],
    familyLocation: FamilyProfile['location']
  ): number {
    // If both locations have coordinates, use distance calculation
    if (activityLocation.coordinates && this.getFamilyCoordinates(familyLocation)) {
      const familyCoords = this.getFamilyCoordinates(familyLocation)!;
      const distance = this.calculateHaversineDistance(
        familyCoords.lat,
        familyCoords.lng,
        activityLocation.coordinates.lat,
        activityLocation.coordinates.lng
      );
      
      return this.distanceToScore(distance);
    }

    // Fallback to text-based location matching
    let score = 0.3; // Lower base score when coordinates unavailable

    // Exact neighborhood match (very high value in Austin)
    if (activityLocation.neighborhood && familyLocation.neighborhood &&
        this.normalizeLocation(activityLocation.neighborhood) === this.normalizeLocation(familyLocation.neighborhood)) {
      score = 0.9; // Strong preference for same neighborhood
    }
    // City match (Austin metro area)
    else if (activityLocation.city && familyLocation.city &&
        this.normalizeLocation(activityLocation.city) === this.normalizeLocation(familyLocation.city)) {
      score = 0.7;
      
      // Bonus for ZIP code proximity within same city
      if (activityLocation.zipCode && familyLocation.zipCode) {
        const zipDistance = this.calculateZipCodeProximity(activityLocation.zipCode, familyLocation.zipCode);
        if (zipDistance <= 2) {
          score += 0.2; // Nearby ZIP codes
        }
      }
    }
    // Austin metro area matching (Cedar Park, Round Rock, etc.)
    else if (this.isAustinMetroArea(activityLocation) && this.isAustinMetroArea(familyLocation)) {
      score = 0.5;
    }
    // Texas match (very low score, but not zero)
    else if (this.isTexasLocation(activityLocation) && this.isTexasLocation(familyLocation)) {
      score = 0.2;
    }
    return Math.min(score, 1);
  }

  /**
   * Get coordinates for family location, with Austin ZIP code defaults.
   */
  private getFamilyCoordinates(familyLocation: FamilyProfile['location']): { lat: number; lng: number } | null {
    // If coordinates provided, use them
    if ((familyLocation as any).coordinates?.lat && (familyLocation as any).coordinates?.lng) {
      return (familyLocation as any).coordinates;
    }

    // Austin ZIP code to coordinates mapping (city center approximations)
    const austinZipCoordinates: Record<string, { lat: number; lng: number }> = {
      '78701': { lat: 30.2672, lng: -97.7431 }, // Downtown Austin
      '78702': { lat: 30.2547, lng: -97.7178 }, // East Austin
      '78703': { lat: 30.2729, lng: -97.7689 }, // Tarrytown/Clarksville
      '78704': { lat: 30.2426, lng: -97.7568 }, // Zilker/South Congress
      '78705': { lat: 30.2955, lng: -97.7414 }, // UT Campus
      '78723': { lat: 30.2888, lng: -97.6781 }, // Mueller
      '78739': { lat: 30.2263, lng: -97.8897 }, // Circle C
      '78746': { lat: 30.2932, lng: -97.8147 }, // Westlake Hills
      '78751': { lat: 30.3077, lng: -97.7264 }, // Hyde Park
      '78756': { lat: 30.3244, lng: -97.7403 }, // Rosedale
      '78757': { lat: 30.3390, lng: -97.7506 }, // Allandale/Crestview
      // Cedar Park area
      '78613': { lat: 30.5052, lng: -97.8203 },
      '78641': { lat: 30.4947, lng: -97.7876 },
      // Round Rock area  
      '78664': { lat: 30.5082, lng: -97.6789 },
      '78665': { lat: 30.5266, lng: -97.6631 },
    };

    if (familyLocation.zipCode && austinZipCoordinates[familyLocation.zipCode]) {
      return austinZipCoordinates[familyLocation.zipCode];
    }

    return null;
  }

  /**
   * Calculate distance between two points using the Haversine formula.
   */
  private calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in miles
  }

  /**
   * Convert degrees to radians.
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Convert distance to location score (closer = higher score).
   */
  private distanceToScore(distanceMiles: number): number {
    if (distanceMiles <= 2) return 1.0;    // Within 2 miles = perfect
    if (distanceMiles <= 5) return 0.9;    // Within 5 miles = excellent  
    if (distanceMiles <= 10) return 0.7;   // Within 10 miles = good
    if (distanceMiles <= 15) return 0.5;   // Within 15 miles = okay
    if (distanceMiles <= 25) return 0.3;   // Within 25 miles = far but doable
    if (distanceMiles <= 40) return 0.1;   // Within 40 miles = very far
    return 0.05; // Beyond 40 miles = not practical for regular activities
  }

  /**
   * Normalize location strings for comparison.
   */
  private normalizeLocation(location: string): string {
    return location.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate ZIP code proximity (rough approximation).
   */
  private calculateZipCodeProximity(zip1: string, zip2: string): number {
    // Simple numeric difference for Austin area ZIP codes
    const num1 = parseInt(zip1.replace(/\D/g, ''));
    const num2 = parseInt(zip2.replace(/\D/g, ''));
    
    if (isNaN(num1) || isNaN(num2)) return 999;
    
    return Math.abs(num1 - num2);
  }

  /**
   * Check if location is in Austin metro area.
   */
  private isAustinMetroArea(location: ActivityMetadata['location']): boolean {
    const austinMetroCities = [
      'austin', 'cedar park', 'round rock', 'pflugerville', 'georgetown', 
      'leander', 'lakeway', 'bee cave', 'dripping springs', 'kyle', 
      'buda', 'manor', 'elgin', 'del valle'
    ];
    
    const city = location.city?.toLowerCase() || '';
    const neighborhood = location.neighborhood?.toLowerCase() || '';
    
    return austinMetroCities.some(metroCity => 
      city.includes(metroCity) || neighborhood.includes(metroCity)
    );
  }

  /**
   * Check if location is in Texas.
   */
  private isTexasLocation(location: ActivityMetadata['location']): boolean {
    const address = location.address?.toLowerCase() || '';
    const city = location.city?.toLowerCase() || '';
    
    return address.includes('texas') || address.includes(' tx') || 
           city.includes('texas') || city.includes(' tx');
  }

  /**
   * Calculate schedule compatibility score with enhanced matching.
   * 
   * WHY: Improved schedule scoring because:
   * - Parents have strict time constraints that must be respected
   * - Schedule mismatch can make an otherwise perfect activity unusable
   * - Need to extract real schedule info from provider data when available
   * - Should handle both basic time slots and specific time restrictions
   * - Austin families care deeply about commute timing and school schedules
   */
  private calculateScheduleScore(
    activitySchedule: ActivityMetadata['schedule'],
    familySchedule?: string[]
  ): number {
    if (!familySchedule || familySchedule.length === 0) return 0.7; // Neutral if no preference

    let baseScore = 0;
    let hasDirectMatch = false;

    // Enhanced schedule matching using real provider data
    if (activitySchedule.days && activitySchedule.days.length > 0 && 
        activitySchedule.times && activitySchedule.times.length > 0) {
      
      // Parse activity schedule to time slots
      const activityTimeSlots = this.parseActivityScheduleToTimeSlots(
        activitySchedule.days, 
        activitySchedule.times
      );
      
      // Check for direct time slot overlap
      const matchingSlots = activityTimeSlots.filter(slot => 
        familySchedule.includes(slot)
      );
      
      if (matchingSlots.length > 0) {
        hasDirectMatch = true;
        // Perfect match: activity time exactly aligns with family preference
        baseScore = 1.0;
      } else {
        // Check for partial compatibility
        const hasCompatibleDays = this.hasCompatibleDayPattern(
          activitySchedule.days, 
          familySchedule
        );
        
        if (hasCompatibleDays) {
          baseScore = 0.6; // Compatible days but uncertain about exact times
        } else {
          baseScore = 0.2; // Day pattern doesn't match family preferences
        }
      }
    } else {
      // Fallback for activities without detailed schedule info
      baseScore = 0.5; // Unknown schedule, assume moderate compatibility
    }

    // Apply flexibility bonuses
    const flexibilityBonus = activitySchedule.flexibility === 'very_flexible' ? 0.3 :
                            activitySchedule.flexibility === 'flexible' ? 0.15 : 0;

    const finalScore = Math.min(baseScore + flexibilityBonus, 1.0);
    
    // Additional penalty for strict schedule mismatches
    if (!hasDirectMatch && familySchedule.length === 1) {
      // If family has only one available time slot and activity doesn't match,
      // this is likely a deal-breaker regardless of other factors
      return Math.max(finalScore * 0.3, 0.1);
    }

    return finalScore;
  }

  /**
   * Parse activity days and times into standard time slot enums.
   */
  private parseActivityScheduleToTimeSlots(days: string[], times: string[]): string[] {
    const timeSlots: string[] = [];
    
    for (const day of days) {
      const normalizedDay = day.toLowerCase().trim();
      const isWeekday = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'mon', 'tue', 'wed', 'thu', 'fri'].includes(normalizedDay);
      const isWeekend = ['saturday', 'sunday', 'sat', 'sun', 'weekend'].includes(normalizedDay);
      
      for (const time of times) {
        const timeSlot = this.parseTimeToSlot(time, isWeekday, isWeekend);
        if (timeSlot && !timeSlots.includes(timeSlot)) {
          timeSlots.push(timeSlot);
        }
      }
    }
    
    return timeSlots;
  }

  /**
   * Parse time strings into time slot categories.
   */
  private parseTimeToSlot(timeString: string, isWeekday: boolean, isWeekend: boolean): string | null {
    const timeStr = timeString.toLowerCase().trim();
    
    // Extract hour from various time formats
    const hourMatch = timeStr.match(/(\d+)(?::(\d+))?\s*(am|pm)?/);
    if (!hourMatch) return null;
    
    let hour = parseInt(hourMatch[1]);
    const minute = hourMatch[2] ? parseInt(hourMatch[2]) : 0;
    const ampm = hourMatch[3];
    
    // Convert to 24-hour format
    if (ampm === 'pm' && hour !== 12) {
      hour += 12;
    } else if (ampm === 'am' && hour === 12) {
      hour = 0;
    }
    
    // Categorize times into slots
    if (isWeekday) {
      if (hour >= 6 && hour < 12) {
        return 'weekday_morning';
      } else if (hour >= 12 && hour < 18) {
        return 'weekday_afternoon';
      } else if (hour >= 18 && hour < 22) {
        return 'weekday_evening';
      }
    }
    
    if (isWeekend) {
      if (hour >= 7 && hour < 12) {
        return 'weekend_morning';
      } else if (hour >= 12 && hour < 18) {
        return 'weekend_afternoon';
      } else if (hour >= 18 && hour < 22) {
        return 'weekend_evening';
      }
    }
    
    return null;
  }

  /**
   * Check if activity days are compatible with family schedule preferences.
   */
  private hasCompatibleDayPattern(activityDays: string[], familySchedule: string[]): boolean {
    const weekdaySlots = ['weekday_morning', 'weekday_afternoon', 'weekday_evening'];
    const weekendSlots = ['weekend_morning', 'weekend_afternoon', 'weekend_evening'];
    
    const familyWantsWeekdays = familySchedule.some(slot => weekdaySlots.includes(slot));
    const familyWantsWeekends = familySchedule.some(slot => weekendSlots.includes(slot));
    
    const activityHasWeekdays = activityDays.some(day => 
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'weekdays', 'mon', 'tue', 'wed', 'thu', 'fri'].includes(day.toLowerCase())
    );
    const activityHasWeekends = activityDays.some(day => 
      ['saturday', 'sunday', 'weekend', 'sat', 'sun'].includes(day.toLowerCase())
    );
    
    // Compatible if there's overlap in weekday/weekend preferences
    return (familyWantsWeekdays && activityHasWeekdays) || (familyWantsWeekends && activityHasWeekends);
  }

  /**
   * Calculate budget compatibility score.
   */
  private calculateBudgetScore(
    activityPricing: ActivityMetadata['pricing'],
    familyBudget?: FamilyProfile['preferences']['budget']
  ): number {
    if (!familyBudget || !familyBudget.max) return 0.7; // Neutral if no budget specified

    if (activityPricing.type === 'free') return 1;

    const maxBudget = familyBudget.max;
    const activityCost = activityPricing.amount || activityPricing.range?.max || 0;

    if (activityCost === 0) return 0.8; // Unknown cost, slightly negative
    if (activityCost <= maxBudget) return 1;
    if (activityCost <= maxBudget * 1.2) return 0.7; // 20% over budget
    if (activityCost <= maxBudget * 1.5) return 0.4; // 50% over budget
    
    return 0.1; // Too expensive
  }

  /**
   * Calculate provider quality score.
   */
  private calculateQualityScore(provider: ActivityMetadata['provider']): number {
    let score = 0.5; // Base score

    // Rating bonus
    if (provider.rating) {
      score += (provider.rating - 3) * 0.1; // Scale 1-5 rating to score contribution
    }

    // Review count bonus
    if (provider.reviewCount) {
      const reviewBonus = Math.min(provider.reviewCount / 100, 1) * 0.2; // Up to 0.2 bonus for 100+ reviews
      score += reviewBonus;
    }

    // Verification bonus
    if (provider.verified) {
      score += 0.1;
    }

    // Experience bonus
    if (provider.experience) {
      const expBonus = Math.min(provider.experience / 10, 1) * 0.1; // Up to 0.1 bonus for 10+ years
      score += expBonus;
    }

    return Math.min(score, 1);
  }

  /**
   * Get relevant children based on recommendation type.
   */
  private getRelevantChildren(familyProfile: FamilyProfile, recommendationType?: string): FamilyProfile['children'] {
    if (!recommendationType || recommendationType === 'family') {
      // For family activities, include all children
      return familyProfile.children;
    } else if (recommendationType === 'all_kids') {
      // For all kids activities, include all children 
      return familyProfile.children;
    } else {
      // For individual child recommendations, find the specific child
      const specificChild = familyProfile.children.find(
        child => child.name.toLowerCase() === recommendationType.toLowerCase()
      );
      return specificChild ? [specificChild] : familyProfile.children;
    }
  }

  /**
   * Generate match explanation with reasons and concerns.
   */
  private generateMatchExplanation(
    metadata: ActivityMetadata,
    familyProfile: FamilyProfile,
    scores: Record<string, number>,
    recommendationType?: string
  ): { matchReasons: string[]; concerns: string[] } {
    const matchReasons: string[] = [];
    const concerns: string[] = [];

    // Age appropriateness - filter children based on recommendationType
    const extractedAgeRange = this.extractAgeRangeFromMetadata(metadata);
    const relevantChildren = this.getRelevantChildren(familyProfile, recommendationType);
    
    if (scores.ageScore >= 0.8) {
      if (relevantChildren.length === 1) {
        matchReasons.push(`Perfect age fit for ${relevantChildren[0].name}`);
      } else if (relevantChildren.length > 1) {
        matchReasons.push(`Perfect age fit for ${relevantChildren.map(c => c.name).join(' and ')}`);
      } else {
        matchReasons.push(`Perfect age fit for family activities`);
      }
    } else if (scores.ageScore >= 0.4) {
      if (relevantChildren.length <= 1) {
        matchReasons.push(`Good age fit`);
      } else {
        matchReasons.push(`Good age fit for some children`);
      }
    } else if (scores.ageScore < 0.3 && extractedAgeRange) {
      if (relevantChildren.length <= 1) {
        concerns.push(`Age range (${extractedAgeRange.min}-${extractedAgeRange.max}) may not be ideal`);
      } else {
        concerns.push(`Age range (${extractedAgeRange.min}-${extractedAgeRange.max}) may not fit all children`);
      }
    }

    // Interest alignment
    const extractedInterests = this.extractInterestsFromMetadata(metadata);
    if (scores.interestScore >= 0.7) {
      matchReasons.push(`Matches family interests in ${extractedInterests.slice(0, 3).join(', ')}`);
    } else if (scores.interestScore < 0.3) {
      concerns.push(`Limited alignment with stated interests`);
    }

    // Location convenience
    if (scores.locationScore >= 0.8) {
      matchReasons.push(`Conveniently located in your area`);
    } else if (scores.locationScore < 0.4) {
      concerns.push(`May require travel outside your preferred area`);
    }

    // Budget considerations
    if (scores.budgetScore >= 0.9) {
      matchReasons.push(`Within your budget range`);
    } else if (scores.budgetScore < 0.5) {
      concerns.push(`May exceed your stated budget`);
    }

    // Provider quality
    if (scores.qualityScore >= 0.8) {
      matchReasons.push(`Highly rated provider with excellent reviews`);
    }

    // Add specific activity highlights
    const extractedProvider = this.extractProviderFromMetadata(metadata);
    if (extractedProvider.verified) {
      matchReasons.push(`Verified provider with background checks`);
    }

    // Note: capacity information is not available in current metadata structure
    // This would need to be added to the embedding generator if needed

    return { matchReasons, concerns };
  }

  /**
   * Select diverse recommendations to avoid clustering.
   * 
   * WHY: Enhanced deduplication approach because:
   * - Multiple layers of deduplication ensure no provider appears multiple times
   * - Pre-filtering eliminates exact duplicates before selection algorithm
   * - Diversity scoring prevents same provider with different programs
   * - Final verification ensures absolutely no duplicates reach the frontend
   */
  private selectDiverseRecommendations(
    scored: ScoredRecommendation[],
    limit: number,
    diversityWeight: number
  ): ScoredRecommendation[] {
    if (scored.length === 0) return [];

    // Layer 1: Pre-filter to remove exact duplicates using provider-program key
    const seenProviderPrograms = new Set<string>();
    const dedupedScored = scored.filter(rec => {
      const key = `${rec.providerId}-${rec.programId || 'default'}`;
      if (seenProviderPrograms.has(key)) {
        console.log(`Pre-filter deduplication: removing duplicate provider-program ${rec.metadata.provider?.name || rec.providerId} (${rec.programId || 'default'})`);
        return false;
      }
      seenProviderPrograms.add(key);
      return true;
    });

    console.log(`Deduplication: ${scored.length} → ${dedupedScored.length} after removing exact provider-program duplicates`);

    // Layer 2: Ensure no provider appears twice, even with different programs
    const seenProviders = new Set<string>();
    const uniqueProviders = dedupedScored.filter(rec => {
      if (seenProviders.has(rec.providerId)) {
        console.log(`Provider deduplication: removing additional instance of provider ${rec.metadata.provider?.name || rec.providerId}`);
        return false;
      }
      seenProviders.add(rec.providerId);
      return true;
    });

    console.log(`Deduplication: ${dedupedScored.length} → ${uniqueProviders.length} after ensuring unique providers`);

    // If we have few enough recommendations, return them all
    if (uniqueProviders.length <= limit) {
      return uniqueProviders;
    }

    const selected: ScoredRecommendation[] = [];
    const remaining = [...uniqueProviders];

    // Always include the top recommendation
    if (remaining.length > 0) {
      selected.push(remaining.shift()!);
    }

    // Select remaining recommendations balancing score and diversity
    while (selected.length < limit && remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = -1;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const diversityScore = this.calculateDiversityScore(candidate, selected);
        const combinedScore = (1 - diversityWeight) * candidate.matchScore + diversityWeight * diversityScore;

        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestIndex = i;
        }
      }

      selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    // Layer 3: Final verification - ensure no duplicates in final result
    const finalSeenProviders = new Set<string>();
    const finalDeduped = selected.filter(rec => {
      if (finalSeenProviders.has(rec.providerId)) {
        console.warn(`FINAL DEDUPLICATION WARNING: removing duplicate provider ${rec.metadata.provider?.name || rec.providerId} that somehow made it to final selection`);
        return false;
      }
      finalSeenProviders.add(rec.providerId);
      return true;
    });

    if (finalDeduped.length !== selected.length) {
      console.warn(`Final deduplication caught ${selected.length - finalDeduped.length} duplicates in final selection`);
    }

    return finalDeduped;
  }

  /**
   * Calculate diversity score compared to already selected recommendations.
   * 
   * WHY: Enhanced diversity scoring because:
   * - Exact same provider+program combinations should be completely eliminated (score 0)
   * - Same provider with ANY program should be completely eliminated (score 0) to prevent provider duplicates
   * - This ensures no provider appears twice in final recommendations under any circumstances
   * - Maintains variety across categories and neighborhoods for remaining unique providers
   */
  private calculateDiversityScore(candidate: ScoredRecommendation, selected: ScoredRecommendation[]): number {
    if (selected.length === 0) return 1;

    let diversityScore = 1;

    for (const existing of selected) {
      // ANY provider match - completely eliminate (including exact provider+program matches)
      if (candidate.providerId === existing.providerId) {
        console.log(`Diversity filtering: eliminating duplicate provider ${candidate.metadata.provider?.name || candidate.providerId} (existing program: ${existing.programId || 'default'}, candidate program: ${candidate.programId || 'default'})`);
        return 0; // Complete elimination for ANY provider match
      }

      // Category diversity (only applied to different providers now)
      if (candidate.metadata.category === existing.metadata.category) {
        diversityScore *= 0.7; // Moderate penalty for same category
      }

      // Location diversity (only applied to different providers now)
      if (candidate.metadata.location.neighborhood === existing.metadata.location.neighborhood) {
        diversityScore *= 0.8; // Slight penalty for same neighborhood
      }
    }

    return diversityScore;
  }

  /**
   * Get list of applied filter descriptions.
   */
  private getAppliedFilters(filters: RecommendationFilters): string[] {
    const applied: string[] = [];

    if (filters.budgetRange) {
      applied.push(`Budget: $${filters.budgetRange.min || 0}-${filters.budgetRange.max || '∞'}`);
    }

    if (filters.ageRanges && filters.ageRanges.length > 0) {
      applied.push(`Age ranges: ${filters.ageRanges.map(r => `${r.min}-${r.max}`).join(', ')}`);
    }

    if (filters.categories && filters.categories.length > 0) {
      applied.push(`Categories: ${filters.categories.join(', ')}`);
    }

    if (filters.interests && filters.interests.length > 0) {
      applied.push(`Interests: ${filters.interests.join(', ')}`);
    }

    if (filters.schedule && filters.schedule.length > 0) {
      applied.push(`Schedule: ${filters.schedule.join(', ')}`);
    }

    if (filters.maxDistance) {
      applied.push(`Distance: within ${filters.maxDistance} miles`);
    }

    return applied;
  }

  /**
   * Cache recommendations for performance.
   */
  private async cacheRecommendations(
    familyProfile: FamilyProfile,
    filters: RecommendationFilters,
    result: RecommendationResult
  ): Promise<void> {
    // For POC, we'll implement basic caching
    // In production, this would use Redis with appropriate TTL
    try {
      const cacheKey = createAICacheKey('recommendations', { familyProfile, filters });
      console.log(`Caching recommendations with key: ${cacheKey}`);
      // TODO: Implement actual caching
    } catch (error) {
      console.warn('Failed to cache recommendations:', error);
    }
  }

  /**
   * Health check for the recommendation engine.
   */
  async healthCheck(): Promise<{
    qdrant: boolean;
    collection: boolean;
    ai: boolean;
    localEmbeddings: boolean;
    overall: boolean;
  }> {
    const status = {
      qdrant: false,
      collection: false,
      ai: false,
      localEmbeddings: false,
      overall: false,
    };

    try {
      // Check Qdrant connection
      status.qdrant = await this.qdrantClient.healthCheck();

      // Check collection existence
      status.collection = await this.qdrantClient.collectionExists(this.collectionName);

      // Check local embeddings client
      try {
        status.localEmbeddings = await this.localEmbeddingsClient.isAvailable();
        if (status.localEmbeddings) {
          console.log('Local embeddings client is available');
        }
      } catch (error) {
        console.warn('Local embeddings client health check failed:', error);
      }

      // Check OpenAI client (fallback)
      try {
        await this.aiClient.createEmbedding({
          input: 'health check test',
          model: 'text-embedding-3-small',
        });
        status.ai = true;
      } catch (error) {
        console.warn('OpenAI client health check failed:', error);
      }

      // For POC: Consider service healthy if vector search and collection are available
      // Either local embeddings OR OpenAI embeddings should work
      status.overall = status.qdrant && status.collection && (status.localEmbeddings || status.ai);

    } catch (error) {
      console.error('Recommendation engine health check failed:', error);
    }

    return status;
  }

  /**
   * Helper methods for database-driven recommendations
   */
  
  
  /**
   * Infer age range from provider (simplified - no tags available in current schema).
   */
  private inferAgeRangeFromProvider(provider: RecommendationProvider): { min: number; max: number } | null {
    // Default ranges based on provider name patterns
    const name = provider.name.toLowerCase();
    
    if (name.includes('preschool') || name.includes('toddler')) {
      return { min: 2, max: 5 };
    }
    if (name.includes('elementary') || name.includes('kids')) {
      return { min: 6, max: 12 };
    }
    if (name.includes('teen') || name.includes('youth')) {
      return { min: 13, max: 17 };
    }
    
    // Default ranges based on common provider types
    const description = provider.description?.toLowerCase() || '';
    if (description.includes('preschool') || description.includes('toddler')) {
      return { min: 2, max: 5 };
    } else if (description.includes('elementary') || description.includes('after school')) {
      return { min: 5, max: 12 };
    } else if (description.includes('teen') || description.includes('youth')) {
      return { min: 12, max: 18 };
    }
    
    return null;
  }
  
  /**
   * Build formatted address from provider data.
   */
  private buildProviderAddress(provider: RecommendationProvider): string {
    const parts = [
      provider.address,
      provider.city,
      provider.state,
      provider.zipCode
    ].filter(Boolean);
    
    return parts.join(', ');
  }
  
  // Note: Removed unused methods that referenced non-existent properties
  // The new lightweight architecture doesn't need these helper methods

  /**
   * Extract age range from event data.
   * 
   * WHY: Age ranges are critical for matching activities to children:
   * - Database fields (minAge/maxAge) provide explicit ranges when available
   * - Event titles often contain age info like "Teen Martial Arts (Age 13-17)"
   * - Descriptions may have age details that database fields miss
   * - Category-based inference handles common patterns (teen, toddler, preschool)
   * 
   * DESIGN DECISION: Multi-layer approach ensures we don't default to 0-18:
   * 1. Check ages field from eventsTable schema first (most reliable when available)
   * 2. Check explicit minAge/maxAge fields from eventTable schema  
   * 3. Parse title and description text for age patterns
   * 4. Infer from category keywords as fallback
   * 5. Only return null if no age info found anywhere
   * 
   * @param event Event data with potential age information
   * @returns Age range object or null if no age info available
   */
  private extractAgeRangeFromEvent(event: RecommendationProvider['events'][0] | null): { min: number; max: number } | null {
    if (!event) return null;
    
    // 1. First check explicit database fields (most reliable when available)
    if (event.minAge !== null && event.maxAge !== null) {
      return { min: event.minAge, max: event.maxAge };
    }
    
    // 2. Parse age from event title using existing parseAgesFromText method
    if (event.title) {
      const titleAge = this.parseAgesFromText(event.title);
      if (titleAge) {
        return titleAge;
      }
    }
    
    // 3. Parse age from event description using existing parseAgesFromText method
    if (event.description) {
      const descriptionAge = this.parseAgesFromText(event.description);
      if (descriptionAge) {
        return descriptionAge;
      }
    }
    
    // 4. Category-based inference for common age patterns
    if (event.category) {
      const categoryAge = this.inferAgeFromCategory(event.category);
      if (categoryAge) {
        return categoryAge;
      }
    }
    
    // 5. Check title and description for category keywords if explicit category didn't match
    const combinedText = `${event.title || ''} ${event.description || ''}`.toLowerCase();
    const textCategoryAge = this.inferAgeFromCategory(combinedText);
    if (textCategoryAge) {
      return textCategoryAge;
    }
    
    return null;
  }

  /**
   * Extract age range from provider data when event data is insufficient.
   * 
   * WHY: When events don't have explicit age ranges, providers often include
   * age information in their names or descriptions. This method provides a
   * fallback to extract age ranges from provider-level data.
   * 
   * DESIGN DECISION: This method follows the same pattern as extractAgeRangeFromEvent
   * but focuses on provider-specific fields (name, description) rather than event fields.
   * 
   * @param provider Provider data with potential age information
   * @returns Age range object or null if no age info available
   */
  private extractAgeRangeFromProvider(provider: RecommendationProvider): { min: number; max: number } | null {
    if (!provider) return null;
    
    // 1. Parse age from provider name using existing parseAgesFromText method
    if (provider.name) {
      const nameAge = this.parseAgesFromText(provider.name);
      if (nameAge) {
        return nameAge;
      }
    }
    
    // 2. Parse age from provider description using existing parseAgesFromText method
    if (provider.description) {
      const descriptionAge = this.parseAgesFromText(provider.description);
      if (descriptionAge) {
        return descriptionAge;
      }
    }
    
    // 3. Category-based inference for common age patterns in provider name/description
    const combinedText = `${provider.name || ''} ${provider.description || ''}`.toLowerCase();
    const textCategoryAge = this.inferAgeFromCategory(combinedText);
    if (textCategoryAge) {
      return textCategoryAge;
    }
    
    return null;
  }

  /**
   * Infer age range from category or text containing category keywords.
   * 
   * WHY: Many activities use standard age-related terms without explicit ranges:
   * - "Teen" programs typically serve 13-17 year olds
   * - "Toddler" activities are for 1-3 year olds
   * - "Preschool" programs serve 3-5 year olds
   * - This provides reasonable defaults when explicit ages aren't available
   * 
   * @param categoryOrText Category name or text containing category keywords
   * @returns Age range based on common category patterns or null if no match
   */
  private inferAgeFromCategory(categoryOrText: string): { min: number; max: number } | null {
    if (!categoryOrText) return null;
    
    const text = categoryOrText.toLowerCase();
    
    // Infant/Baby programs
    if (text.includes('infant') || text.includes('baby') || text.includes('newborn')) {
      return { min: 0, max: 2 };
    }
    
    // Toddler programs
    if (text.includes('toddler')) {
      return { min: 1, max: 3 };
    }
    
    // Preschool programs
    if (text.includes('preschool') || text.includes('pre-school') || text.includes('pre school')) {
      return { min: 3, max: 5 };
    }
    
    // Elementary/School age programs
    if (text.includes('elementary') || text.includes('school age') || text.includes('after school')) {
      return { min: 5, max: 12 };
    }
    
    // Teen/Youth programs
    if (text.includes('teen') || text.includes('teenager') || text.includes('youth') || text.includes('adolescent')) {
      return { min: 13, max: 17 };
    }
    
    // Adult programs
    if (text.includes('adult') || text.includes('grown up') || text.includes('18+') || text.includes('parent')) {
      return { min: 18, max: 99 };
    }
    
    // Family programs (assume suitable for school age kids with parents)
    if (text.includes('family') || text.includes('parent and child') || text.includes('all ages')) {
      return { min: 5, max: 99 };
    }
    
    return null;
  }

  /**
   * Extract schedule from event data.
   */
  private extractScheduleFromEvent(event: RecommendationProvider['events'][0] | null): ActivityMetadata['schedule'] | null {
    if (!event) return null;
    
    const schedule: ActivityMetadata['schedule'] = {
      days: [],
      times: [],
      recurring: event.recurring || false,
      flexibility: 'fixed'
    };
    
    // Infer days from event dates
    if (event.startDate) {
      const startDate = new Date(event.startDate);
      const dayOfWeek = startDate.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      schedule.days = [dayNames[dayOfWeek]];
    }
    
    // Extract time info if available in title or description  
    const timeText = event.title + ' ' + (event.description || '');
    schedule.times = this.inferTimesFromText(timeText);
    
    return schedule;
  }

  /**
   * Extract pricing from event data.
   */
  private extractPricingFromEvent(
    event: RecommendationProvider['events'][0] | null,
    provider: RecommendationProvider
  ): ActivityMetadata['pricing'] {
    if (event?.price !== null && event?.price !== undefined) {
      if (parseFloat(String(event.price)) === 0) {
        return { type: 'free' };
      }
      return {
        type: 'per_session',
        amount: parseFloat(String(event.price)),
        currency: 'USD'
      };
    }
    
    return { type: 'per_session' };
  }

  /**
   * Infer interests from event data.
   */
  private inferInterestsFromEvent(event: RecommendationProvider['events'][0] | null): string[] {
    if (!event) return [];
    
    const interests: string[] = [];
    
    if (event.category) {
      interests.push(event.category.toLowerCase());
    }
    
    // Extract interests from title and description
    const text = (event.title + ' ' + (event.description || '')).toLowerCase();
    
    // Common interest keywords
    const interestKeywords = [
      'art', 'music', 'dance', 'sports', 'stem', 'science', 'technology',
      'coding', 'programming', 'reading', 'writing', 'cooking', 'theater',
      'drama', 'swimming', 'soccer', 'basketball', 'tennis', 'martial arts',
      'yoga', 'gymnastics', 'crafts', 'pottery', 'painting', 'drawing'
    ];
    
    for (const keyword of interestKeywords) {
      if (text.includes(keyword)) {
        interests.push(keyword);
      }
    }
    
    return [...new Set(interests)]; // Remove duplicates
  }

  /**
   * Convert vector search provider ID to database format.
   * 
   * WHY: Vector search returns various ID formats but database uses plain string IDs.
   * This ensures compatibility between vector search results and database queries.
   * 
   * @param rawId Raw provider ID from vector search (numeric or string)
   * @returns Plain string ID for database queries or null if invalid
   */
  private convertToProviderDbId(rawId: any): string | null {
    if (!rawId) return null;
    
    // If already a string with provider prefix, remove the prefix
    if (typeof rawId === 'string' && rawId.startsWith('provider-')) {
      return rawId.replace('provider-', '');
    }
    
    // Convert numeric ID to plain string format
    const numericId = parseInt(String(rawId));
    if (!isNaN(numericId) && numericId > 0) {
      return String(numericId);
    }
    
    // If it's already a plain string ID, use as-is
    if (typeof rawId === 'string' && /^\d+$/.test(rawId)) {
      return rawId;
    }
    
    return null;
  }

  /**
   * Convert vector search event ID to database format.
   * 
   * WHY: Similar to provider IDs, event IDs may need format conversion.
   * This handles various ID formats that might come from vector search.
   * 
   * @param rawId Raw event ID from vector search (numeric or string)
   * @returns Plain string ID for database queries or null if invalid
   */
  private convertToEventDbId(rawId: any): string | null {
    if (!rawId) return null;
    
    // If already a string with event prefix, remove the prefix  
    if (typeof rawId === 'string' && (rawId.startsWith('event-') || rawId.startsWith('camp-'))) {
      return rawId.replace(/^(event-|camp-)/, '');
    }
    
    // Convert numeric ID to plain string format
    const numericId = parseInt(String(rawId));
    if (!isNaN(numericId) && numericId > 0) {
      return String(numericId);
    }
    
    // If it's already a plain string ID, use as-is
    if (typeof rawId === 'string' && /^\d+$/.test(rawId)) {
      return rawId;
    }
    
    return null;
  }

  /**
   * Score lightweight recommendations using only vector search data.
   * 
   * WHY: Scoring without database queries because:
   * - Avoids expensive database queries during initial scoring
   * - Uses vector metadata to determine basic compatibility
   * - Allows for quick filtering before database enrichment
   * - Maintains vector similarity as primary ranking factor
   * - Enables deduplication at the ID level before full data fetching
   */
  private scoreLightweightRecommendations(
    vectorResults: Array<QdrantSearchResult & { metadata: any }>,
    familyProfile: FamilyProfile,
    filters: RecommendationFilters,
    options: { diversityWeight: number; recommendationType?: string }
  ): LightweightRecommendation[] {
    const lightweightRecommendations: LightweightRecommendation[] = [];
    const relevantChildren = this.getRelevantChildren(familyProfile, options.recommendationType);

    for (const result of vectorResults) {
      const metadata = result.metadata;
      
      // Extract and clean provider/event IDs
      const rawProviderId = metadata.provider_id || metadata.providerId || '';
      const providerId = this.convertToProviderDbId(rawProviderId);
      if (!providerId) continue;

      const rawEventId = metadata.camp_id || metadata.event_id || metadata.eventId;
      const eventId = rawEventId ? this.convertToEventDbId(rawEventId) : undefined;
      const programId = eventId; // Use event ID as program ID for consistency

      // Basic age compatibility check using metadata
      const ageRange = this.extractBasicAgeRange(metadata);
      const ageScore = this.calculateBasicAgeScore(relevantChildren, ageRange);
      if (ageScore < 0.3) continue; // Skip if clearly age-inappropriate

      // Basic location check
      const locationScore = this.calculateBasicLocationScore(familyProfile, metadata);
      
      // Basic budget check
      const budgetScore = this.calculateBasicBudgetScore(familyProfile, metadata, filters);

      // Basic interest matching
      const interestScore = this.calculateBasicInterestScore(relevantChildren, metadata);

      // Schedule compatibility (basic check)
      const scheduleScore = 0.7; // Assume reasonable schedule compatibility for now

      // Quality score from vector similarity
      const qualityScore = result.score;

      // Calculate overall scores
      const practicalScore = (ageScore * 0.3 + locationScore * 0.25 + budgetScore * 0.2 + 
                            interestScore * 0.15 + scheduleScore * 0.1);
      const matchScore = (result.score * 0.4 + practicalScore * 0.6);

      // Generate match reasons based on scores
      const matchReasons: string[] = [];
      const concerns: string[] = [];

      if (ageScore >= 0.8) matchReasons.push('Age-appropriate activity');
      if (interestScore >= 0.7) matchReasons.push('Matches child interests');
      if (locationScore >= 0.8) matchReasons.push('Convenient location');
      if (budgetScore >= 0.8) matchReasons.push('Within budget');
      if (result.score >= 0.8) matchReasons.push('High relevance match');

      if (ageScore < 0.5) concerns.push('Age compatibility unclear');
      if (budgetScore < 0.5) concerns.push('Price information needed');
      if (locationScore < 0.5) concerns.push('Location may be distant');

      const lightweightRec: LightweightRecommendation = {
        providerId,
        programId: programId || undefined,
        eventId: eventId || undefined,
        vectorSimilarity: result.score,
        practicalScore,
        matchScore,
        matchReasons,
        concerns,
        ranking: {
          overall: matchScore,
          age: ageScore,
          interests: interestScore,
          location: locationScore,
          schedule: scheduleScore,
          budget: budgetScore,
          quality: qualityScore,
        },
      };

      if (matchScore >= 0.3) { // Only include reasonable matches
        lightweightRecommendations.push(lightweightRec);
      }
    }

    // Sort by match score
    return lightweightRecommendations.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Select diverse lightweight recommendations.
   */
  private selectDiverseLightweightRecommendations(
    recommendations: LightweightRecommendation[],
    limit: number,
    diversityWeight: number
  ): LightweightRecommendation[] {
    // For now, simply take top recommendations
    // TODO: Add diversity logic based on provider IDs
    return recommendations.slice(0, limit);
  }

  /**
   * Basic age range extraction from vector metadata.
   */
  private extractBasicAgeRange(metadata: any): { min: number; max: number } {
    // Try to extract age range from metadata
    if (metadata.age_min && metadata.age_max) {
      return { min: metadata.age_min, max: metadata.age_max };
    }
    if (metadata.ageRange) {
      return metadata.ageRange;
    }
    // Default age range if none specified
    return { min: 3, max: 18 };
  }

  /**
   * Calculate basic age compatibility score.
   */
  private calculateBasicAgeScore(children: FamilyProfile['children'], ageRange: { min: number; max: number }): number {
    if (children.length === 0) return 0.5;

    let compatibleChildren = 0;
    for (const child of children) {
      if (child.age >= ageRange.min && child.age <= ageRange.max) {
        compatibleChildren++;
      }
    }

    return compatibleChildren / children.length;
  }

  /**
   * Calculate basic location score.
   */
  private calculateBasicLocationScore(familyProfile: FamilyProfile, metadata: any): number {
    const familyCity = familyProfile.location?.city?.toLowerCase();
    const familyNeighborhood = familyProfile.location?.neighborhood?.toLowerCase();
    
    if (!familyCity) return 0.5; // No location info to compare

    const providerCity = (metadata.city || '').toLowerCase();
    const providerNeighborhood = (metadata.neighborhood || '').toLowerCase();

    if (familyNeighborhood && providerNeighborhood && familyNeighborhood === providerNeighborhood) {
      return 1.0; // Same neighborhood
    }
    if (familyCity && providerCity && familyCity === providerCity) {
      return 0.8; // Same city
    }
    
    return 0.5; // Unknown/different location
  }

  /**
   * Calculate basic budget compatibility score.
   */
  private calculateBasicBudgetScore(
    familyProfile: FamilyProfile, 
    metadata: any, 
    filters: RecommendationFilters
  ): number {
    const familyBudgetMax = familyProfile.preferences?.budget?.max || filters.budgetRange?.max;
    if (!familyBudgetMax) return 0.7; // No budget constraint

    const price = metadata.price || metadata.amount;
    if (price === 0) return 1.0; // Free activity
    if (!price) return 0.6; // Unknown price

    if (price <= familyBudgetMax) return 1.0;
    if (price <= familyBudgetMax * 1.2) return 0.7; // Slightly over budget
    return 0.3; // Over budget
  }

  /**
   * Calculate basic interest matching score.
   */
  private calculateBasicInterestScore(children: FamilyProfile['children'], metadata: any): number {
    const childInterests = children.flatMap(c => c.interests).map(i => i.toLowerCase());
    if (childInterests.length === 0) return 0.6;

    const activityKeywords = [
      metadata.category,
      metadata.subcategory,
      metadata.title,
      metadata.description,
      ...(metadata.interests || []),
      ...(metadata.tags || [])
    ].filter(Boolean).map(k => k.toLowerCase()).join(' ');

    let matchingInterests = 0;
    for (const interest of childInterests) {
      if (activityKeywords.includes(interest)) {
        matchingInterests++;
      }
    }

    return Math.min(1.0, matchingInterests / Math.max(1, childInterests.length * 0.5));
  }

  /**
   * Cache lightweight recommendations results.
   */
  private async cacheLightweightRecommendations(
    familyProfile: FamilyProfile,
    filters: RecommendationFilters,
    result: LightweightRecommendationResult
  ): Promise<void> {
    // TODO: Implement caching for lightweight recommendations
    // For now, skip caching to keep implementation simple
  }

  /**
   * Clean up resources.
   */
  async cleanup(): Promise<void> {
    await Promise.all([
      this.aiClient.cleanup(),
      this.localEmbeddingsClient.cleanup(),
    ]);
  }
}