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
import { FamilyProfileSchema, type FamilyProfile } from '@/types/ai';
import { z } from 'zod';

// Request validation schemas
const RecommendationRequestSchema = z.object({
  // Option 1: Structured family profile
  familyProfile: FamilyProfileSchema.optional(),
  
  // Option 2: Natural language query
  query: z.string().min(10).max(2000).optional(),
  
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
);

type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;

// Response interfaces
interface RecommendationResponse {
  success: boolean;
  recommendations?: ActivityRecommendation['recommendations'];
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
    
    const { familyProfile, query, filters, options } = validatedRequest;

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

    // Start vector search and AI processing in parallel (if needed)
    console.log('Starting parallel vector search...');
    const vectorStartTime = Date.now();
    
    // Add timeout to vector search to prevent hanging
    const vectorSearchTimeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Vector search timeout')), 10000)
    );
    
    const vectorSearchPromise = recommendationEngine.generateRecommendations(
      workingFamilyProfile,
      {
        limit: options.limit * (options.includeExplanations ? 2 : 1.2), // Get more only if AI processing
        includeScore: options.includeScores,
        diversityWeight: options.diversityWeight,
        filters: recommendationFilters,
        cacheResults: options.useCache,
      }
    );

    let recommendationResult;
    try {
      recommendationResult = await Promise.race([vectorSearchPromise, vectorSearchTimeout]);
    } catch (error) {
      console.error('Vector search failed or timed out:', error);
      throw new Error('Recommendation search is taking too long. Please try again.');
    }

    const vectorSearchMs = Date.now() - vectorStartTime;
    console.log(`Vector search completed in ${vectorSearchMs}ms with ${recommendationResult.recommendations.length} results`);

    // If no results found, return early
    if (recommendationResult.recommendations.length === 0) {
      return NextResponse.json({
        success: true,
        recommendations: [],
        searchSummary: 'No activities found matching your criteria. Try expanding your search filters or location range.',
        totalMatches: 0,
        performance: {
          vectorSearchMs,
          aiProcessingMs: 0,
          totalMs: Date.now() - startTime,
          cacheHit: recommendationResult.performance.cacheHit,
        },
      });
    }

    let finalRecommendations: ActivityRecommendation['recommendations'] = [];
    let searchSummary = 'Recommendations generated using vector similarity search';
    let aiProcessingMs = 0;

    // Helper function to create fallback recommendations
    const createFallbackRecommendations = (recs: typeof recommendationResult.recommendations) => {
      return recs.slice(0, options.limit).map(rec => ({
        providerId: rec.providerId,
        programId: rec.programId,
        matchScore: rec.matchScore,
        matchReasons: rec.matchReasons,
        recommendationType: rec.matchScore >= 0.8 ? 'perfect_match' as const :
                          rec.matchScore >= 0.65 ? 'good_fit' as const :
                          rec.matchScore >= 0.45 ? 'worth_exploring' as const : 'backup_option' as const,
        ageAppropriate: rec.ranking.age >= 0.7,
        interests: rec.metadata.interests,
        logisticalFit: {
          location: rec.ranking.location >= 0.6,
          schedule: rec.ranking.schedule >= 0.6,
          budget: rec.ranking.budget >= 0.6,
          transportation: !filters.transportationRequired || rec.ranking.location >= 0.8,
        },
      }));
    };

    // Use AI to enhance recommendations if explanations are requested
    if (options.includeExplanations && recommendationResult.recommendations.length > 0) {
      console.log('Starting AI enhancement...');
      const aiStartTime = Date.now();

      try {
        // Transform recommendations for AI processing with size limits
        const searchResults = recommendationResult.recommendations.slice(0, options.limit + 5).map(rec => {
          // Truncate descriptions to avoid bloating the prompt
          const truncatedDescription = rec.metadata.description && rec.metadata.description.length > 200 
            ? rec.metadata.description.slice(0, 200) + '...'
            : rec.metadata.description;

          return {
            providerId: rec.providerId,
            programId: rec.programId,
            score: rec.vectorSimilarity,
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
        
        let shouldProceedWithAI = true;
        
        if (totalPromptSize > maxSafeSize) {
          console.warn(`AI prompt too large (${totalPromptSize} chars), truncating search results`);
          // Truncate search results and regenerate prompt
          const truncatedResults = searchResults.slice(0, Math.max(3, Math.floor(searchResults.length / 2)));
          const truncatedPrompts = createRecommendationPrompt(workingFamilyProfile, truncatedResults, options.limit);
          
          const newSize = truncatedPrompts.system.length + truncatedPrompts.user.length;
          if (newSize > maxSafeSize) {
            // If still too large, fall back to simple processing without AI enhancement
            console.warn(`Even truncated prompt too large (${newSize} chars), using fallback recommendations`);
            finalRecommendations = createFallbackRecommendations(recommendationResult.recommendations);
            aiProcessingMs = Date.now() - aiStartTime;
            shouldProceedWithAI = false;
          } else {
            console.log(`Prompt truncated from ${totalPromptSize} to ${newSize} chars`);
            prompts.system = truncatedPrompts.system;
            prompts.user = truncatedPrompts.user;
          }
        }
        
        if (shouldProceedWithAI) {
        
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
          
          finalRecommendations = validatedAIResponse.recommendations.slice(0, options.limit);
          searchSummary = validatedAIResponse.searchSummary;
          
        } catch (parseError) {
          console.warn('Failed to parse AI recommendations, using fallback:', parseError);
          finalRecommendations = createFallbackRecommendations(recommendationResult.recommendations);
        }
        
        aiProcessingMs = Date.now() - aiStartTime;
        
        } // End of shouldProceedWithAI block
        
      } catch (aiError) {
        console.warn('AI enhancement failed or timed out, using vector-only results:', aiError);
        finalRecommendations = createFallbackRecommendations(recommendationResult.recommendations);
        aiProcessingMs = Date.now() - aiStartTime;
      }
    } else {
      // Return vector-only recommendations without AI enhancement
      console.log('Using vector-only recommendations (AI enhancement disabled or no results)');
      finalRecommendations = createFallbackRecommendations(recommendationResult.recommendations);
    }

    const totalMs = Date.now() - startTime;

    // Prepare response
    const response: RecommendationResponse = {
      success: true,
      recommendations: finalRecommendations,
      searchSummary,
      totalMatches: recommendationResult.searchMetadata.totalMatches,
      performance: {
        vectorSearchMs,
        aiProcessingMs,
        totalMs,
        cacheHit: recommendationResult.performance.cacheHit,
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
    console.log(`Recommendations generated: ${finalRecommendations.length} results, ${totalTokens} tokens, $${totalCost.toFixed(4)} cost, ${totalMs}ms total (vector: ${vectorSearchMs}ms, AI: ${aiProcessingMs}ms)`);
    
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