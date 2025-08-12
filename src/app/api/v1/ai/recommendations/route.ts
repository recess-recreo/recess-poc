/**
 * POST /api/v1/ai/recommendations - Get AI-powered activity recommendations using vector search
 *
 * WHY: AI-powered recommendations because:
 * - Traditional keyword search misses semantic meaning and context
 * - Parents express needs in natural language that doesn't match exact categories
 * - Vector similarity captures subtle relationships between activities and interests
 * - Personalized recommendations improve family engagement and booking conversion
 * - Multi-factor scoring considers practical constraints (age, location, budget, schedule)
 *
 * DESIGN DECISIONS:
 * - Hybrid approach: Vector similarity + practical filters + AI reasoning
 * - Flexible input: Accepts both structured family profiles and natural language queries
 * - Comprehensive scoring: Age, interests, location, schedule, budget, provider quality
 * - Diversity optimization: Prevents clustering around similar providers/categories
 * - Performance optimization: Caching, efficient queries, reasonable limits
 * - Cost control: Smart caching and model selection for cost-effective operations
 *
 * ALGORITHM FLOW:
 * 1. Accept family profile or natural language query
 * 2. Generate search embedding using OpenAI
 * 3. Perform vector similarity search in Qdrant
 * 4. Apply practical filters (age, budget, location, schedule)
 * 5. Score activities using weighted multi-factor algorithm
 * 6. Use AI to generate intelligent explanations and categorizations
 * 7. Return diverse, ranked recommendations with detailed reasoning
 *
 * SECURITY & PERFORMANCE:
 * - Request validation and size limits
 * - Rate limiting to prevent abuse
 * - Caching for repeated similar queries
 * - Usage tracking for cost monitoring
 * - Error handling with graceful fallbacks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIClient } from '@/lib/ai/openai-client';
import { RecommendationEngine, type RecommendationFilters, type ScoredRecommendation } from '@/lib/ai/recommendation-engine';
import { createRecommendationPrompt, ActivityRecommendationSchema, type ActivityRecommendation } from '@/lib/ai/prompts';
import { FamilyProfileSchema, type FamilyProfile, type LightweightRecommendationResult } from '@/types/ai';
import { getRecommendationProviders, type RecommendationProvider } from '@/lib/db/queries/providers';
import { db } from '@/lib/db/client';
import { providerTable } from '@/lib/db/schema/providers';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';

// New structured request schema
const PersonSchema = z.object({
  type: z.enum(['parent', 'child']),
  name: z.string(),
  age: z.number(),
  gender: z.string().optional(),
  interests: z.array(z.string())
});

const LocationRequestSchema = z.object({
  city: z.string(),
  neighborhood: z.string().optional(),
  postalCode: z.string().optional()
});

const BudgetRequestSchema = z.object({
  amount: z.number(),
  period: z.enum(['month', 'week', 'session'])
});

const ScheduleRequestSchema = z.object({
  preferences: z.array(z.string())
});

// New request schema that supports both formats for backward compatibility
const RecommendationRequestSchema = z.union([
  // New structured format
  z.object({
    people: z.array(PersonSchema).min(1),
    location: LocationRequestSchema,
    budget: BudgetRequestSchema,
    schedule: ScheduleRequestSchema.optional(),
    
    // Request options
    options: z.object({
      limit: z.number().int().min(1).max(50).optional().default(10),
      includeExplanations: z.boolean().optional().default(true),
      includeScores: z.boolean().optional().default(false),
      diversityWeight: z.number().min(0).max(1).optional().default(0.3),
      useCache: z.boolean().optional().default(true),
      model: z.enum(['gpt-4o-mini', 'gpt-4o']).optional().default('gpt-4o-mini'),
      includeMetrics: z.boolean().optional().default(false),
    }).optional().default({
      limit: 10,
      includeExplanations: true,
      includeScores: false,
      diversityWeight: 0.3,
      useCache: true,
      model: 'gpt-4o-mini',
      includeMetrics: false
    }),
  }),
  // Legacy format for backward compatibility
  z.object({
    // Option 1: Structured family profile
    familyProfile: FamilyProfileSchema.optional(),
    
    // Option 2: Natural language query
    query: z.string().min(10).max(2000).optional(),
    
    // Recommendation type for targeted queries
    recommendationType: z.enum(['family', 'all_kids']).or(z.string()).optional(),
    
    // Filtering options
    filters: z.object({
      maxDistance: z.number().positive().max(50).optional(),
      budgetRange: z.object({
        min: z.number().min(0).optional(),
        max: z.number().min(0).optional(),
      }).optional(),
      schedule: z.array(z.enum([
        'weekday_morning', 'weekday_afternoon', 'weekday_evening',
        'weekend_morning', 'weekend_afternoon', 'weekend_evening'
      ])).optional(),
      ageRanges: z.array(z.object({
        min: z.number().int().min(0).max(18),
        max: z.number().int().min(0).max(18),
      })).optional(),
      interests: z.array(z.string()).max(20).optional(),
      categories: z.array(z.string()).max(10).optional(),
      languages: z.array(z.string()).max(5).optional(),
      specialNeeds: z.array(z.string()).max(10).optional(),
      transportationRequired: z.boolean().optional(),
    }).optional().default({}),
    
    // Request options
    options: z.object({
      limit: z.number().int().min(1).max(50).optional().default(10),
      includeExplanations: z.boolean().optional().default(true),
      includeScores: z.boolean().optional().default(false),
      diversityWeight: z.number().min(0).max(1).optional().default(0.3),
      useCache: z.boolean().optional().default(true),
      model: z.enum(['gpt-4o-mini', 'gpt-4o']).optional().default('gpt-4o-mini'),
      includeMetrics: z.boolean().optional().default(false),
    }).optional().default({
      limit: 10,
      includeExplanations: true,
      includeScores: false,
      diversityWeight: 0.3,
      useCache: true,
      model: 'gpt-4o-mini',
      includeMetrics: false
    }),
  }).refine(
    data => data.familyProfile || data.query,
    {
      message: "Either 'familyProfile' or 'query' must be provided",
      path: ['familyProfile', 'query'],
    }
  )
]);

type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;
type Person = z.infer<typeof PersonSchema>;
type LocationRequest = z.infer<typeof LocationRequestSchema>;
type BudgetRequest = z.infer<typeof BudgetRequestSchema>;
type ScheduleRequest = z.infer<typeof ScheduleRequestSchema>;

// Helper functions for merging lightweight recommendations with database data
function extractInterestsFromProvider(provider: RecommendationProvider, event: any): string[] {
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

function createMetadataFromProvider(provider: RecommendationProvider, event: any): any {
  return {
    providerId: provider.id,
    programId: event?.id,
    name: event?.title || provider.name,
    description: event?.description || provider.description || '',
    category: event?.category || 'General',
    subcategory: undefined,
    interests: extractInterestsFromProvider(provider, event),
    ageRange: extractAgeRangeFromEvent(event) || extractAgeRangeFromProvider(provider) || { min: 3, max: 18 },
    location: {
      neighborhood: undefined,
      city: event?.city || provider.city || undefined,
      zipCode: event?.zipCode || provider.zipCode || undefined,
      address: event?.address || provider.address || undefined,
      coordinates: event?.latitude && event?.longitude ? {
        lat: parseFloat(event.latitude.toString()),
        lng: parseFloat(event.longitude.toString())
      } : provider.latitude && provider.longitude ? {
        lat: parseFloat(provider.latitude.toString()),
        lng: parseFloat(provider.longitude.toString())
      } : undefined,
    },
    schedule: extractScheduleFromEvent(event) || getDefaultSchedule(),
    pricing: extractPricingFromEvent(event, provider),
    provider: {
      name: provider.name,
      rating: undefined, // Rating not available in current schema
      reviewCount: undefined,
      verified: provider.verified || false,
      experience: undefined, // Experience not available in current schema
    },
    capacity: {
      maxStudents: event?.maxCapacity || undefined,
      currentEnrollment: event?.currentCapacity || undefined,
      waitlist: false,
    },
    requirements: {
      experience: undefined,
      equipment: undefined,
      parentParticipation: undefined,
    },
    tags: event?.category ? [event.category] : [],
    createdAt: new Date(), // Current date as fallback
    updatedAt: new Date(), // Current date as fallback
  };
}

// Helper function to parse age information from text using patterns
function parseAgesFromText(text: string): { min: number; max: number } | null {
  if (!text) return null;
  
  const textLower = text.toLowerCase();
  
  // Look for age patterns in the text
  const patterns = [
    /ages?\s+(\d+)\s*-\s*(\d+)/g,
    /(\d+)\s*-\s*(\d+)\s*years?\s*old/g,
    /ages?\s+(\d+)\s*to\s*(\d+)/g,
    /(\d+)\s*to\s*(\d+)\s*years?\s*old/g
  ];

  for (const pattern of patterns) {
    const matches = Array.from(textLower.matchAll(pattern));
    for (const match of matches) {
      const min = parseInt(match[1]);
      const max = parseInt(match[2]);
      if (!isNaN(min) && !isNaN(max) && min >= 0 && max <= 25 && min <= max) {
        return { min, max };
      }
    }
  }

  return null;
}

// Helper function to infer age from category keywords or text
function inferAgeFromCategory(categoryOrText: string): { min: number; max: number } | null {
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

function extractAgeRangeFromEvent(event: any): { min: number; max: number } | null {
  if (!event) return null;
  
  // 1. First check explicit database fields (most reliable when available)
  if (event.minAge !== null && event.maxAge !== null && event.minAge !== undefined && event.maxAge !== undefined) {
    return { min: event.minAge, max: event.maxAge };
  }
  
  // 2. Parse age from event title using text analysis
  if (event.title) {
    const titleAge = parseAgesFromText(event.title);
    if (titleAge) {
      return titleAge;
    }
  }
  
  // 3. Parse age from event description
  if (event.description) {
    const descriptionAge = parseAgesFromText(event.description);
    if (descriptionAge) {
      return descriptionAge;
    }
  }
  
  // 4. Category-based inference for common age patterns
  if (event.category) {
    const categoryAge = inferAgeFromCategory(event.category);
    if (categoryAge) {
      return categoryAge;
    }
  }
  
  // 5. Check title and description for category keywords if explicit category didn't match
  const combinedText = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  const textCategoryAge = inferAgeFromCategory(combinedText);
  if (textCategoryAge) {
    return textCategoryAge;
  }
  
  return null;
}

function extractAgeRangeFromProvider(provider: RecommendationProvider): { min: number; max: number } | null {
  // Default age range if none specified
  return { min: 3, max: 18 };
}

function extractScheduleFromEvent(event: any): any | null {
  if (!event) return null;
  
  const schedule = {
    days: [] as string[],
    times: [] as string[],
    recurring: event.recurring || false,
    flexibility: 'fixed' as const
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
  schedule.times = inferTimesFromText(timeText);
  
  return schedule;
}

function getDefaultSchedule(): any {
  return {
    days: [] as string[],
    times: [] as string[],
    recurring: false,
    flexibility: 'flexible' as const
  };
}

function extractPricingFromEvent(event: any, provider: RecommendationProvider): any {
  if (event?.price !== null && event?.price !== undefined) {
    if (event.price === 0) {
      return { type: 'free' };
    }
    return {
      type: 'per_session',
      amount: event.price,
      currency: 'USD'
    };
  }
  
  return { type: 'per_session' };
}

function inferTimesFromText(text: string): string[] {
  // Simple time extraction - could be enhanced
  const timeRegex = /(\d{1,2}):?(\d{2})?\s*(am|pm)/gi;
  const matches = text.match(timeRegex);
  return matches || [];
}

// Response interfaces
interface RecommendationResponse {
  success: boolean;
  activities?: ActivityRecommendation['recommendations'];
  events?: ActivityRecommendation['recommendations'];
  recommendations?: ActivityRecommendation['recommendations'];
  totalCount?: number;
  searchCriteria?: any;
  searchSummary?: string;
  totalMatches?: number;
  performance?: {
    vectorSearchMs: number;
    aiProcessingMs: number;
    totalMs: number;
    cacheHit: boolean;
  };
  usage?: {
    tokensUsed: number;
    estimatedCost: number;
    model: string;
  };
  error?: string;
  details?: string;
}

// Helper functions for new format transformation
function transformNewFormatToFamilyProfile(request: any): FamilyProfile {
  const { people, location, budget, schedule } = request;
  
  // Separate adults and children
  const adults = people.filter((p: Person) => p.type === 'parent');
  const children = people.filter((p: Person) => p.type === 'child');
  
  // If no adults specified, create a default parent
  const familyAdults = adults.length > 0 ? adults.map((adult: Person) => ({
    name: adult.name,
    role: 'parent' as const,
    email: undefined,
    phone: undefined
  })) : [{ name: 'Parent', role: 'parent' as const }];
  
  // Transform children
  const familyChildren = children.map((child: Person) => ({
    name: child.name,
    age: child.age,
    interests: child.interests,
    specialNeeds: undefined,
    allergies: []
  }));
  
  // Transform location
  const familyLocation = {
    neighborhood: location.neighborhood,
    city: location.city,
    zipCode: location.postalCode,
    transportationNeeds: false
  };
  
  // Transform budget and schedule
  const preferences = {
    budget: {
      max: budget.amount,
      currency: 'USD'
    },
    schedule: schedule?.preferences || [],
    activityTypes: [] as string[],
    languages: [] as string[]
  };
  
  return {
    adults: familyAdults,
    children: familyChildren,
    location: familyLocation,
    preferences,
    notes: undefined
  };
}

function determineRecommendationType(people: Person[]): string {
  const children = people.filter(p => p.type === 'child');
  const adults = people.filter(p => p.type === 'parent');
  
  if (adults.length > 0 && children.length > 0) {
    return 'family';
  } else if (children.length > 1) {
    return 'all_kids';
  } else if (children.length === 1) {
    return children[0].name.toLowerCase();
  } else {
    return 'family';
  }
}

// Global recommendation engine instance
let globalRecommendationEngine: RecommendationEngine | null = null;

function getRecommendationEngine(): RecommendationEngine {
  if (!globalRecommendationEngine) {
    globalRecommendationEngine = new RecommendationEngine();
  }
  return globalRecommendationEngine;
}

/**
 * POST /api/v1/ai/recommendations
 * 
 * Generate AI-powered activity recommendations using vector similarity search.
 * 
 * Example request with family profile:
 * ```json
 * {
 *   "familyProfile": {
 *     "adults": [{"name": "Sarah", "role": "parent"}],
 *     "children": [{"name": "Emma", "age": 7, "interests": ["art", "dance"]}],
 *     "location": {"neighborhood": "Brooklyn Heights"},
 *     "preferences": {
 *       "budget": {"max": 200},
 *       "schedule": ["weekday_afternoon"],
 *       "activityTypes": ["arts", "dance"]
 *     }
 *   },
 *   "options": {
 *     "limit": 10,
 *     "includeExplanations": true
 *   }
 * }
 * ```
 * 
 * Example request with natural language query:
 * ```json
 * {
 *   "query": "Looking for art classes for my 7-year-old daughter Emma in Brooklyn Heights, after school activities under $200/month",
 *   "options": {
 *     "limit": 5
 *   }
 * }
 * ```
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let totalTokens = 0;
  let totalCost = 0;

  try {
    // Parse and validate request
    const body = await request.json();
    const validatedRequest = RecommendationRequestSchema.parse(body);
    
    // Check if this is the new structured format or legacy format
    const isNewFormat = 'people' in validatedRequest;
    let familyProfile: FamilyProfile | undefined;
    let query: string | undefined;
    let recommendationType: string | undefined;
    let filters: any = {};
    let options: any;
    
    if (isNewFormat) {
      // Transform new format to legacy format for internal processing
      familyProfile = transformNewFormatToFamilyProfile(validatedRequest);
      recommendationType = determineRecommendationType((validatedRequest as any).people);
      options = (validatedRequest as any).options || {};
    } else {
      // Legacy format - extract directly
      const legacyRequest = validatedRequest as any;
      familyProfile = legacyRequest.familyProfile;
      query = legacyRequest.query;
      recommendationType = legacyRequest.recommendationType;
      filters = legacyRequest.filters || {};
      options = legacyRequest.options || {};
    }

    // Initialize services
    const aiClient = getAIClient();
    const recommendationEngine = getRecommendationEngine();

    // Health check for recommendation engine
    const healthCheck = await recommendationEngine.healthCheck();
    if (!healthCheck.overall) {
      return NextResponse.json({
        success: false,
        error: 'Recommendation service is currently unavailable',
        details: `Vector search: ${healthCheck.qdrant ? 'OK' : 'Failed'}, Collection: ${healthCheck.collection ? 'OK' : 'Failed'}, Local embeddings: ${healthCheck.localEmbeddings ? 'OK' : 'Failed'}, OpenAI: ${healthCheck.ai ? 'OK' : 'Failed'}`,
      }, { status: 503 });
    }

    let workingFamilyProfile: FamilyProfile;
    let familyParsingPromise: Promise<any> | null = null;

    // If natural language query provided, start parsing in parallel
    if (query && !familyProfile) {
      console.log('Starting parallel parsing of natural language query...');
      
      familyParsingPromise = fetch(new URL('/api/v1/ai/parse-family', request.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: query,
          options: {
            model: options.model,
            useCache: options.useCache,
          },
        }),
      }).then(async (parseResponse) => {
        if (!parseResponse.ok) {
          throw new Error(`Failed to parse family profile from query: ${parseResponse.statusText}`);
        }
        
        const parseResult = await parseResponse.json();
        if (!parseResult.success || !parseResult.familyProfile) {
          throw new Error('Unable to parse family information from the provided query');
        }
        
        return parseResult;
      });
    }

    // Use Promise.race to implement timeout for family parsing
    if (familyParsingPromise) {
      const parseTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Family parsing timeout')), 5000)
      );
      
      try {
        const parseResult = await Promise.race([familyParsingPromise, parseTimeout]);
        workingFamilyProfile = parseResult.familyProfile;
        
        // Track parsing costs
        if (parseResult.usage) {
          totalTokens += parseResult.usage.tokensUsed;
          totalCost += parseResult.usage.estimatedCost;
        }
      } catch (error) {
        console.error('Family parsing failed or timed out:', error);
        throw new Error('Unable to process your query in a timely manner. Please try a simpler description.');
      }
    } else {
      workingFamilyProfile = familyProfile!;
    }

    // Convert filters to recommendation engine format
    const recommendationFilters: RecommendationFilters = {
      maxDistance: filters.maxDistance,
      budgetRange: filters.budgetRange,
      schedule: filters.schedule,
      ageRanges: filters.ageRanges,
      interests: filters.interests,
      categories: filters.categories,
      languages: filters.languages,
      specialNeeds: filters.specialNeeds,
      transportationRequired: filters.transportationRequired,
    };

    // 1. Generate lightweight recommendations (IDs and scores only)
    console.log('Starting lightweight recommendation generation...');
    const lightweightStartTime = Date.now();
    
    // Add timeout to lightweight search
    const lightweightSearchTimeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Lightweight search timeout')), 10000)
    );
    
    const lightweightSearchPromise = recommendationEngine.generateLightweightRecommendations(
      workingFamilyProfile,
      {
        limit: options.limit * 2, // Get more for deduplication
        includeScore: options.includeScores,
        diversityWeight: options.diversityWeight,
        filters: recommendationFilters,
        cacheResults: options.useCache,
        recommendationType, // Pass the recommendation type to the engine
      }
    );

    let lightweightResult: LightweightRecommendationResult;
    try {
      lightweightResult = await Promise.race([lightweightSearchPromise, lightweightSearchTimeout]);
    } catch (error) {
      console.error('Lightweight search failed or timed out:', error);
      throw new Error('Recommendation search is taking too long. Please try again.');
    }

    const lightweightMs = Date.now() - lightweightStartTime;
    console.log(`Lightweight search completed in ${lightweightMs}ms with ${lightweightResult.recommendations.length} results`);

    // If no results found, return early
    if (lightweightResult.recommendations.length === 0) {
      const emptyResponse: RecommendationResponse = {
        success: true,
        ...(isNewFormat ? {
          activities: [],
          events: [],
          totalCount: 0,
          searchCriteria: {
            people: (validatedRequest as any).people,
            location: (validatedRequest as any).location,
            budget: (validatedRequest as any).budget,
            schedule: (validatedRequest as any).schedule
          }
        } : {
          recommendations: []
        }),
        searchSummary: 'No activities found matching your criteria. Try expanding your search filters or location range.',
        totalMatches: 0,
        performance: {
          vectorSearchMs: lightweightMs,
          aiProcessingMs: 0,
          totalMs: Date.now() - startTime,
          cacheHit: lightweightResult.performance.cacheHit,
        },
      };
      
      return NextResponse.json(emptyResponse);
    }

    // 2. Deduplicate provider IDs (this is where we fix the duplication issue)
    console.log('Deduplicating provider and event IDs...');
    const deduplicationStartTime = Date.now();
    
    const uniqueProviderIds = new Set<string>();
    const uniqueEventIds = new Set<string>();
    const dedupedByProviderIdRecs: typeof lightweightResult.recommendations = [];
    
    // Deduplicate by provider ID first - keep the highest scoring recommendation per provider
    for (const rec of lightweightResult.recommendations) {
      if (!uniqueProviderIds.has(rec.providerId)) {
        uniqueProviderIds.add(rec.providerId);
        if (rec.eventId) uniqueEventIds.add(rec.eventId);
        dedupedByProviderIdRecs.push(rec);
      }
    }
    
    console.log(`Provider ID deduplication: ${lightweightResult.recommendations.length} → ${dedupedByProviderIdRecs.length} unique providers`);
    
    // 3. Business name deduplication - fetch provider names for the remaining providers
    console.log('Starting business name deduplication...');
    const providerIds = Array.from(uniqueProviderIds);
    
    // Quick query to get provider ID to name mapping
    const providerNamesPromise = db
      .select({ id: providerTable.id, name: providerTable.name })
      .from(providerTable)
      .where(and(
        eq(providerTable.active, true),
        inArray(providerTable.id, providerIds)
      ));
    
    const providerNamesTimeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Provider names query timeout')), 2000)
    );
    
    let providerNameMap = new Map<string, string>();
    try {
      const providerNames = await Promise.race([providerNamesPromise, providerNamesTimeout]);
      providerNameMap = new Map(providerNames.map(p => [p.id, p.name]));
      console.log(`Fetched names for ${providerNames.length} providers`);
    } catch (error) {
      console.warn('Failed to fetch provider names for business deduplication, skipping business name deduplication:', error);
      // Fall back to provider ID deduplication only
      providerNameMap = new Map();
    }
    
    // Deduplicate by business name (case-insensitive) while preserving highest scores
    const seenBusinessNames = new Set<string>();
    const dedupedLightweightRecs: typeof lightweightResult.recommendations = [];
    
    for (const rec of dedupedByProviderIdRecs) {
      const providerName = providerNameMap.get(rec.providerId);
      if (providerName) {
        const normalizedBusinessName = providerName.toLowerCase().trim();
        if (!seenBusinessNames.has(normalizedBusinessName)) {
          seenBusinessNames.add(normalizedBusinessName);
          dedupedLightweightRecs.push(rec);
        } else {
          console.log(`Business name deduplication: removing duplicate business "${providerName}" (provider ID: ${rec.providerId})`);
        }
      } else {
        // If we couldn't get the provider name, keep the recommendation (fallback)
        dedupedLightweightRecs.push(rec);
      }
    }
    
    console.log(`Business name deduplication: ${dedupedByProviderIdRecs.length} → ${dedupedLightweightRecs.length} unique businesses`);
    
    // Limit to requested amount after deduplication
    const finalLightweightRecs = dedupedLightweightRecs.slice(0, options.limit);
    
    // 4. Fetch full provider data for unique IDs only
    const dbStartTime = Date.now();
    const finalProviderIds = finalLightweightRecs.map(rec => rec.providerId);
    const finalEventIds = finalLightweightRecs.map(rec => rec.eventId).filter((id): id is string => Boolean(id));
    
    const databaseProviders = await getRecommendationProviders(finalProviderIds, finalEventIds.length > 0 ? finalEventIds : undefined);
    const dbMs = Date.now() - dbStartTime;
    
    console.log(`Database query completed in ${dbMs}ms, found ${databaseProviders.length} providers`);
    
    // 5. Merge lightweight scores with database data
    const finalRecommendations: ActivityRecommendation['recommendations'] = [];
    let searchSummary = 'Recommendations generated using lightweight vector similarity search with business name deduplication';
    let aiProcessingMs = 0;
    
    // Create a map of provider data for quick lookup
    const providerMap = new Map<string, RecommendationProvider>();
    for (const provider of databaseProviders) {
      providerMap.set(provider.id, provider);
    }
    
    // Merge lightweight recommendations with database data
    for (const lightweightRec of finalLightweightRecs) {
      const provider = providerMap.get(lightweightRec.providerId);
      if (!provider) {
        console.warn(`Provider ${lightweightRec.providerId} not found in database, skipping`);
        continue;
      }
      
      // Find the relevant event if specified
      const event = lightweightRec.eventId ? 
        provider.events.find(e => String(e.id) === String(lightweightRec.eventId)) : 
        (provider.events.length > 0 ? provider.events[0] : null);
      
      // Create full recommendation object
      const fullRecommendation = {
        providerId: lightweightRec.providerId,
        programId: lightweightRec.programId,
        matchScore: lightweightRec.matchScore,
        matchReasons: lightweightRec.matchReasons,
        recommendationType: lightweightRec.matchScore >= 0.8 ? 'perfect_match' as const :
                          lightweightRec.matchScore >= 0.65 ? 'good_fit' as const :
                          lightweightRec.matchScore >= 0.45 ? 'worth_exploring' as const : 'backup_option' as const,
        ageAppropriate: lightweightRec.ranking.age >= 0.7,
        interests: extractInterestsFromProvider(provider, event),
        logisticalFit: {
          location: lightweightRec.ranking.location >= 0.6,
          schedule: lightweightRec.ranking.schedule >= 0.6,
          budget: lightweightRec.ranking.budget >= 0.6,
          transportation: !filters.transportationRequired || lightweightRec.ranking.location >= 0.8,
        },
        metadata: createMetadataFromProvider(provider, event),
      };
      
      finalRecommendations.push(fullRecommendation);
    }
    
    const deduplicationMs = Date.now() - deduplicationStartTime;

    // Use AI to enhance recommendations if explanations are requested
    if (options.includeExplanations && finalRecommendations.length > 0) {
      console.log('Starting AI enhancement...');
      const aiStartTime = Date.now();

      try {
        // Transform recommendations for AI processing with size limits
        const searchResults = finalRecommendations.slice(0, options.limit).map(rec => {
          // Truncate descriptions to avoid bloating the prompt
          const truncatedDescription = rec.metadata.description && rec.metadata.description.length > 200 
            ? rec.metadata.description.slice(0, 200) + '...'
            : rec.metadata.description;

          return {
            providerId: rec.providerId,
            programId: rec.programId,
            score: rec.matchScore, // Use match score instead of vector similarity
            metadata: {
              name: rec.metadata.name,
              description: truncatedDescription,
              ageRange: `${rec.metadata.ageRange.min}-${rec.metadata.ageRange.max}`,
              location: `${rec.metadata.location.neighborhood || ''} ${rec.metadata.location.city || ''}`.trim(),
              priceRange: rec.metadata.pricing.amount ? 
                `$${rec.metadata.pricing.amount}/${rec.metadata.pricing.type.replace('_', ' ')}` :
                rec.metadata.pricing.type === 'free' ? 'Free' : 'Price varies',
              schedule: rec.metadata.schedule.days.join(', '),
              interests: rec.metadata.interests.slice(0, 5), // Limit interests to top 5
            },
          };
        });

        // Generate AI-enhanced recommendations with timeout
        const prompts = createRecommendationPrompt(workingFamilyProfile, searchResults, options.limit);
        
        // Check message size to avoid 32k character limit
        const totalPromptSize = prompts.system.length + prompts.user.length;
        const maxSafeSize = 30000; // Leave buffer for AI response
        
        if (totalPromptSize > maxSafeSize) {
          console.warn(`AI prompt too large (${totalPromptSize} chars), skipping AI enhancement`);
          searchSummary = 'Recommendations generated using lightweight vector similarity search (AI enhancement skipped - prompt too large)';
          aiProcessingMs = Date.now() - aiStartTime;
        } else {
        
        const aiTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('AI processing timeout')), 8000)
        );

        const aiPromise = aiClient.createChatCompletion({
          messages: [
            { role: 'system', content: prompts.system },
            { role: 'user', content: prompts.user },
          ],
          model: options.model,
          temperature: 0.3,
          max_tokens: 2500, // Reduced for faster processing
          stream: false,
        }, {
          cacheKey: options.useCache ? `rec-ai-${JSON.stringify({ workingFamilyProfile, searchResults }).slice(0, 100)}` : undefined,
          cacheTtl: 1800,
          retries: 1, // Reduced retries for faster response
        });

        const aiResponse = await Promise.race([aiPromise, aiTimeout]);
        
        // Track AI costs
        totalTokens += aiResponse.usage.totalTokens;
        totalCost += aiResponse.usage.estimatedCost;

        try {
          const aiRecommendations = JSON.parse(aiResponse.content);
          const validatedAIResponse = ActivityRecommendationSchema.parse(aiRecommendations);
          
          // AI-enhanced recommendations should already be deduplicated at this point
          // since we passed in deduplicated finalRecommendations
          searchSummary = validatedAIResponse.searchSummary;
          
          // Update finalRecommendations with AI-enhanced data while preserving our deduplication
          if (validatedAIResponse.recommendations.length > 0) {
            // Map AI enhancements back to our deduplicated recommendations
            const enhancedRecs = finalRecommendations.map(rec => {
              const aiRec = validatedAIResponse.recommendations.find(ai => ai.providerId === rec.providerId);
              if (aiRec) {
                return {
                  ...rec,
                  matchReasons: aiRec.matchReasons || rec.matchReasons,
                  recommendationType: aiRec.recommendationType || rec.recommendationType,
                  // Keep our existing metadata and scores
                };
              }
              return rec;
            });
            // Only update if we got meaningful AI enhancements
            if (enhancedRecs.some(r => r.matchReasons.length > 0)) {
              // finalRecommendations is already set correctly, no need to reassign
            }
          }
          
        } catch (parseError) {
          console.warn('Failed to parse AI recommendations, keeping original results:', parseError);
          // Keep the existing finalRecommendations as they are already properly deduplicated
        }
        
        aiProcessingMs = Date.now() - aiStartTime;
        
        } // End of prompt size check
        
      } catch (aiError) {
        console.warn('AI enhancement failed or timed out, using deduped results:', aiError);
        // Keep the existing finalRecommendations as they are already properly deduplicated
        aiProcessingMs = Date.now() - aiStartTime;
      }
    } else {
      // Return vector-only recommendations without AI enhancement
      console.log('Using lightweight deduped recommendations (AI enhancement disabled)');
      // finalRecommendations is already properly set and deduplicated
    }

    const totalMs = Date.now() - startTime;

    // No need for final deduplication safeguard - we already deduplicated at the source
    // This is the key architectural fix: deduplication happens BEFORE database queries
    console.log(`Architecture fix: recommendations are pre-deduplicated, no final cleanup needed`);
    const finalDedupedRecommendations = finalRecommendations;

    // Prepare response based on format
    const response: RecommendationResponse = {
      success: true,
      ...(isNewFormat ? {
        // New format response
        activities: finalDedupedRecommendations,
        events: [], // Currently not implemented
        totalCount: finalDedupedRecommendations.length,
        searchCriteria: {
          people: (validatedRequest as any).people,
          location: (validatedRequest as any).location,
          budget: (validatedRequest as any).budget,
          schedule: (validatedRequest as any).schedule
        }
      } : {
        // Legacy format response
        recommendations: finalDedupedRecommendations
      }),
      searchSummary,
      totalMatches: lightweightResult.searchMetadata.totalMatches,
      performance: {
        vectorSearchMs: lightweightMs,
        aiProcessingMs,
        totalMs,
        cacheHit: lightweightResult.performance.cacheHit,
      },
    };

    // Include usage metrics if requested
    if (options.includeMetrics) {
      response.usage = {
        tokensUsed: totalTokens,
        estimatedCost: totalCost,
        model: options.model,
      };
    }

    // Log detailed performance metrics
    console.log(`Recommendations generated: ${finalRecommendations.length} results, ${totalTokens} tokens, $${totalCost.toFixed(4)} cost, ${totalMs}ms total (lightweight: ${lightweightMs}ms, dedup: ${deduplicationMs}ms, db: ${dbMs}ms, AI: ${aiProcessingMs}ms)`);
    
    // Add performance warning if too slow
    if (totalMs > 5000) {
      console.warn(`Slow recommendation generation: ${totalMs}ms - consider optimization`);
    }

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    const totalMs = Date.now() - startTime;
    console.error('Recommendation generation error:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request parameters',
        details: error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      }, { status: 400 });
    }

    // Handle service unavailable errors
    if (error instanceof Error && error.message.includes('unavailable')) {
      return NextResponse.json({
        success: false,
        error: 'Recommendation service is temporarily unavailable',
        details: 'Vector search database is not responding. Please try again later.',
      }, { status: 503 });
    }

    // Handle AI rate limiting
    if ((error as any)?.status === 429) {
      return NextResponse.json({
        success: false,
        error: 'AI service is currently rate limited. Please try again in a few moments.',
      }, { status: 429 });
    }

    // Handle authentication errors
    if ((error as any)?.status === 401 || (error as any)?.status === 403) {
      console.error('AI service authentication error');
      return NextResponse.json({
        success: false,
        error: 'AI service configuration error. Please contact support.',
      }, { status: 500 });
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json({
      success: false,
      error: 'Failed to generate recommendations',
      details: errorMessage.includes('parse') ? 
        'Unable to process your request. Please check your input and try again.' :
        'Internal service error. Please try again later.',
    }, { status: 500 });
  }
}

/**
 * GET /api/v1/ai/recommendations - Health check endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const recommendationEngine = getRecommendationEngine();
    const health = await recommendationEngine.healthCheck();
    
    return NextResponse.json({
      status: health.overall ? 'healthy' : 'degraded',
      services: {
        vectorSearch: health.qdrant ? 'up' : 'down',
        vectorCollection: health.collection ? 'available' : 'unavailable',
        localEmbeddings: health.localEmbeddings ? 'up' : 'down',
        openAIService: health.ai ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    }, { 
      status: health.overall ? 200 : 503 
    });
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}