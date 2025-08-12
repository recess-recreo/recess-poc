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

export interface ActivityMetadata {
  providerId: number;
  programId?: number;
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
  providerId: number;
  programId?: number;
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
    } = {}
  ): Promise<RecommendationResult> {
    const startTime = Date.now();
    const {
      limit = 20,
      includeScore = true,
      diversityWeight = 0.3,
      filters = {},
      cacheResults = true,
    } = options;

    try {
      // 1. Generate search query and embedding
      const { searchQuery, embedding, cacheHit: embeddingCacheHit } = await this.generateSearchEmbedding(
        familyProfile,
        { useCache: cacheResults }
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
      
      const vectorResults = await this.performVectorSearch(
        embedding,
        { limit: limit * 3, filters } // Get more results for better filtering
      );
      const vectorSearchMs = Date.now() - vectorStartTime;

      // 3. Apply practical filters and scoring
      const scoringStartTime = Date.now();
      const scoredRecommendations = await this.scoreAndRankRecommendations(
        vectorResults,
        familyProfile,
        filters,
        { includeScore, diversityWeight }
      );
      const scoringMs = Date.now() - scoringStartTime;

      // 4. Select final recommendations
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
   * Generate search embedding from family profile.
   * Uses local embeddings with OpenAI fallback for reliability.
   */
  private async generateSearchEmbedding(
    familyProfile: FamilyProfile,
    options: { useCache?: boolean } = {}
  ): Promise<{ searchQuery: string; embedding: number[]; cacheHit: boolean }> {
    // Build search query from family profile
    const searchQuery = this.buildSearchQuery(familyProfile);

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
   */
  private buildSearchQuery(familyProfile: FamilyProfile): string {
    const parts: string[] = [];

    // Children information
    const childrenDesc = familyProfile.children.map(child => {
      const interests = child.interests.length > 0 ? ` interested in ${child.interests.join(', ')}` : '';
      const special = child.specialNeeds ? ` with special needs: ${child.specialNeeds}` : '';
      return `${child.age}-year-old ${child.name}${interests}${special}`;
    }).join('; ');
    parts.push(`Family with children: ${childrenDesc}`);

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

    // Build Qdrant filter object
    // const qdrantFilter = this.buildQdrantFilter(filters);
    // Temporarily disable complex filters due to JSON serialization issue
    const qdrantFilter = undefined;

    const searchResults = await this.qdrantClient.search({
      collection_name: this.collectionName,
      vector: queryEmbedding,
      limit,
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

  /**
   * Score and rank recommendations based on multiple factors.
   */
  private async scoreAndRankRecommendations(
    vectorResults: Array<QdrantSearchResult & { metadata: ActivityMetadata }>,
    familyProfile: FamilyProfile,
    filters: RecommendationFilters,
    options: { includeScore: boolean; diversityWeight: number }
  ): Promise<ScoredRecommendation[]> {
    const scoredRecommendations: ScoredRecommendation[] = [];

    for (const result of vectorResults) {
      const metadata = result.metadata;
      
      // Calculate various scoring factors - handle missing/different metadata structure
      const ageScore = this.calculateAgeScore(
        this.extractAgeRangeFromMetadata(metadata), 
        familyProfile.children
      );
      const interestScore = this.calculateInterestScore(
        this.extractInterestsFromMetadata(metadata), 
        familyProfile
      );
      const locationScore = this.calculateLocationScore(
        this.extractLocationFromMetadata(metadata), 
        familyProfile.location
      );
      const scheduleScore = this.calculateScheduleScore(
        this.extractScheduleFromMetadata(metadata), 
        familyProfile.preferences?.schedule
      );
      const budgetScore = this.calculateBudgetScore(
        this.extractPricingFromMetadata(metadata), 
        familyProfile.preferences?.budget
      );
      const qualityScore = this.calculateQualityScore(
        this.extractProviderFromMetadata(metadata)
      );

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

      const matchScore = (result.score * weights.vector + practicalScore * (1 - weights.vector));

      // Generate match reasons and concerns
      const { matchReasons, concerns } = this.generateMatchExplanation(
        metadata,
        familyProfile,
        { ageScore, interestScore, locationScore, scheduleScore, budgetScore, qualityScore }
      );

      // Skip if score is too low
      if (matchScore < 0.2) continue;

      // Create a normalized metadata structure for compatibility
      const normalizedMetadata: ActivityMetadata = {
        providerId: parseInt((metadata as any).provider_id) || parseInt((metadata as any).camp_id) || 0,
        programId: (metadata as any).camp_id ? parseInt((metadata as any).camp_id) : undefined,
        name: (metadata as any).provider_name || (metadata as any).company_name || (metadata as any).title || 'Unknown',
        description: (metadata as any).text || '',
        category: (metadata as any).category || 'General',
        subcategory: undefined,
        interests: this.extractInterestsFromMetadata(metadata),
        ageRange: this.extractAgeRangeFromMetadata(metadata) || { min: 0, max: 18 },
        location: this.extractLocationFromMetadata(metadata),
        schedule: this.extractScheduleFromMetadata(metadata),
        pricing: this.extractPricingFromMetadata(metadata),
        provider: this.extractProviderFromMetadata(metadata),
        capacity: {},
        requirements: undefined,
        tags: [(metadata as any).type || 'activity'],
        createdAt: new Date((metadata as any).created_at || Date.now()),
        updatedAt: new Date((metadata as any).updated_at || Date.now()),
      };

      scoredRecommendations.push({
        providerId: normalizedMetadata.providerId,
        programId: normalizedMetadata.programId,
        matchScore,
        vectorSimilarity: result.score,
        practicalScore,
        matchReasons,
        concerns,
        metadata: normalizedMetadata,
        ranking: {
          overall: matchScore,
          age: ageScore,
          interests: interestScore,
          location: locationScore,
          schedule: scheduleScore,
          budget: budgetScore,
          quality: qualityScore,
        },
      });
    }

    // Sort by match score
    return scoredRecommendations.sort((a, b) => b.matchScore - a.matchScore);
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
    // Reduced logging - only log once per session to avoid spam
    if (Math.random() < 0.01) { // Log ~1% of age extractions for debugging
      console.log('Sample age range extraction:', { 
        camp_id: metadata.camp_id, 
        type: metadata.type, 
        grades: metadata.grades, 
        ages: metadata.ages,
        min_age: metadata.min_age,
        max_age: metadata.max_age
      });
    }

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

    // Only warn occasionally to reduce log spam
    if (Math.random() < 0.05) { // Log ~5% of missing age range cases
      console.warn('Age range missing in some provider/camp metadata - this is normal for some activities');
    }
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
    // Reduced logging for location scoring

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
   * Generate match explanation with reasons and concerns.
   */
  private generateMatchExplanation(
    metadata: ActivityMetadata,
    familyProfile: FamilyProfile,
    scores: Record<string, number>
  ): { matchReasons: string[]; concerns: string[] } {
    const matchReasons: string[] = [];
    const concerns: string[] = [];

    // Age appropriateness
    const extractedAgeRange = this.extractAgeRangeFromMetadata(metadata);
    if (scores.ageScore >= 0.8) {
      matchReasons.push(`Perfect age fit for ${familyProfile.children.map(c => c.name).join(' and ')}`);
    } else if (scores.ageScore >= 0.4) {
      matchReasons.push(`Good age fit for some children`);
    } else if (scores.ageScore < 0.3 && extractedAgeRange) {
      concerns.push(`Age range (${extractedAgeRange.min}-${extractedAgeRange.max}) may not fit all children`);
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
   */
  private selectDiverseRecommendations(
    scored: ScoredRecommendation[],
    limit: number,
    diversityWeight: number
  ): ScoredRecommendation[] {
    if (scored.length <= limit) return scored;

    const selected: ScoredRecommendation[] = [];
    const remaining = [...scored];

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

    return selected;
  }

  /**
   * Calculate diversity score compared to already selected recommendations.
   */
  private calculateDiversityScore(candidate: ScoredRecommendation, selected: ScoredRecommendation[]): number {
    if (selected.length === 0) return 1;

    let diversityScore = 1;

    for (const existing of selected) {
      // Provider diversity
      if (candidate.providerId === existing.providerId) {
        diversityScore *= 0.3; // Strong penalty for same provider
      }

      // Category diversity
      if (candidate.metadata.category === existing.metadata.category) {
        diversityScore *= 0.7; // Moderate penalty for same category
      }

      // Location diversity
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
   * Clean up resources.
   */
  async cleanup(): Promise<void> {
    await Promise.all([
      this.aiClient.cleanup(),
      this.localEmbeddingsClient.cleanup(),
    ]);
  }
}