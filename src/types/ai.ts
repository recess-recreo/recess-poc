/**
 * TypeScript types and interfaces for AI features in the Recess POC.
 *
 * WHY: Centralized type definitions because:
 * - Ensures type consistency across all AI endpoints and services
 * - Provides IDE support and autocomplete for complex AI data structures
 * - Enables compile-time validation and error prevention
 * - Documents expected data formats and API contracts
 * - Facilitates frontend-backend integration with shared types
 * - Makes refactoring safer with TypeScript's type checking
 *
 * TYPE CATEGORIES:
 * - Family Profile: Natural language parsing and structured family data
 * - Recommendations: Vector search results and AI-enhanced recommendations
 * - Email Processing: Generation and parsing of provider communications
 * - Usage Metrics: Cost tracking and performance monitoring
 * - API Responses: Standardized response formats across all endpoints
 */

import { z } from 'zod';

// ============================================================================
// FAMILY PROFILE TYPES
// ============================================================================

export const AdultSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum(['parent', 'guardian', 'caregiver']).default('parent'),
});

export const ChildSchema = z.object({
  name: z.string().min(1).max(50),
  age: z.number().int().min(0).max(18),
  interests: z.array(z.string()).max(15),
  specialNeeds: z.string().optional(),
  allergies: z.array(z.string()).max(10),
});

export const LocationSchema = z.object({
  neighborhood: z.string().optional(),
  zipCode: z.string().optional(),
  city: z.string().optional(),
  transportationNeeds: z.boolean().default(false),
});

export const ScheduleConstraintSchema = z.object({
  timeSlots: z.array(z.enum([
    'weekday_morning', 'weekday_afternoon', 'weekday_evening',
    'weekend_morning', 'weekend_afternoon', 'weekend_evening'
  ])),
  specificTimes: z.object({
    earliestStart: z.string().optional(), // "9:00 AM"
    latestEnd: z.string().optional(),     // "5:00 PM"
    preferredDuration: z.number().optional(), // minutes
  }).optional(),
  restrictions: z.array(z.string()).optional(), // ["no weekday mornings", "must end before 11am"]
  flexibility: z.enum(['strict', 'somewhat_flexible', 'very_flexible']).default('somewhat_flexible'),
});

export const PreferencesSchema = z.object({
  budget: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().default('USD'),
  }).optional(),
  schedule: z.array(z.enum([
    'weekday_morning', 'weekday_afternoon', 'weekday_evening',
    'weekend_morning', 'weekend_afternoon', 'weekend_evening'
  ])).optional(),
  scheduleConstraints: ScheduleConstraintSchema.optional(),
  activityTypes: z.array(z.string()).max(20),
  languages: z.array(z.string()).max(5),
});

export const FamilyProfileSchema = z.object({
  adults: z.array(AdultSchema).min(1).max(4),
  children: z.array(ChildSchema).min(1).max(8),
  location: LocationSchema,
  preferences: PreferencesSchema,
  notes: z.string().optional(),
});

export type Adult = z.infer<typeof AdultSchema>;
export type Child = z.infer<typeof ChildSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type ScheduleConstraint = z.infer<typeof ScheduleConstraintSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type FamilyProfile = z.infer<typeof FamilyProfileSchema>;

// ============================================================================
// RECOMMENDATION TYPES
// ============================================================================

export const ActivityMetadataSchema = z.object({
  providerId: z.number().int().positive(),
  programId: z.number().int().positive().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  category: z.string(),
  subcategory: z.string().optional(),
  interests: z.array(z.string()),
  ageRange: z.object({
    min: z.number().int().min(0).max(18),
    max: z.number().int().min(0).max(18),
  }),
  location: z.object({
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    zipCode: z.string().optional(),
    address: z.string().optional(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
  }),
  schedule: z.object({
    days: z.array(z.string()),
    times: z.array(z.string()),
    recurring: z.boolean().optional(),
    flexibility: z.enum(['fixed', 'flexible', 'very_flexible']).optional(),
  }),
  pricing: z.object({
    type: z.enum(['per_session', 'per_month', 'per_program', 'free']),
    amount: z.number().optional(),
    currency: z.string().optional(),
    range: z.object({
      min: z.number(),
      max: z.number(),
    }).optional(),
  }),
  provider: z.object({
    name: z.string(),
    rating: z.number().min(0).max(5).optional(),
    reviewCount: z.number().int().min(0).optional(),
    verified: z.boolean().optional(),
    experience: z.number().int().min(0).optional(),
  }),
  capacity: z.object({
    maxStudents: z.number().int().positive().optional(),
    currentEnrollment: z.number().int().min(0).optional(),
    waitlist: z.boolean().optional(),
  }),
  requirements: z.object({
    experience: z.string().optional(),
    equipment: z.array(z.string()).optional(),
    parentParticipation: z.boolean().optional(),
  }).optional(),
  tags: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const RecommendationSchema = z.object({
  providerId: z.string(),
  programId: z.string().optional(),
  matchScore: z.number().min(0).max(1),
  matchReasons: z.array(z.string()),
  recommendationType: z.enum(['perfect_match', 'good_fit', 'worth_exploring', 'backup_option']),
  ageAppropriate: z.boolean(),
  interests: z.array(z.string()),
  logisticalFit: z.object({
    location: z.boolean(),
    schedule: z.boolean(),
    budget: z.boolean(),
    transportation: z.boolean(),
  }),
  metadata: z.any().optional(), // For additional dynamic data
});

export const RecommendationFiltersSchema = z.object({
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
});

export type ActivityMetadata = z.infer<typeof ActivityMetadataSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type RecommendationFilters = z.infer<typeof RecommendationFiltersSchema>;

// ============================================================================
// LIGHTWEIGHT RECOMMENDATION TYPES (FOR ENGINE OUTPUT)
// ============================================================================

/**
 * Lightweight recommendation result that contains only IDs and scores.
 * Used by the recommendation engine to avoid duplication issues.
 * The API route will deduplicate these IDs and fetch full data separately.
 */
export const LightweightRecommendationSchema = z.object({
  providerId: z.string(),
  programId: z.string().optional(),
  eventId: z.string().optional(),
  vectorSimilarity: z.number().min(0).max(1),
  practicalScore: z.number().min(0).max(1),
  matchScore: z.number().min(0).max(1),
  matchReasons: z.array(z.string()),
  concerns: z.array(z.string()),
  ranking: z.object({
    overall: z.number().min(0).max(1),
    age: z.number().min(0).max(1),
    interests: z.number().min(0).max(1),
    location: z.number().min(0).max(1),
    schedule: z.number().min(0).max(1),
    budget: z.number().min(0).max(1),
    quality: z.number().min(0).max(1),
  }),
});

/**
 * Lightweight recommendation engine result that contains arrays of IDs with scores.
 * This prevents duplication by allowing the API route to deduplicate IDs before
 * fetching full data from the database.
 */
export const LightweightRecommendationResultSchema = z.object({
  recommendations: z.array(LightweightRecommendationSchema),
  searchMetadata: z.object({
    totalMatches: z.number().int().min(0),
    vectorSearchResults: z.number().int().min(0),
    filtersApplied: z.array(z.string()),
    searchQuery: z.string(),
    embedding: z.array(z.number()).optional(),
  }),
  performance: z.object({
    vectorSearchMs: z.number().int().min(0),
    scoringMs: z.number().int().min(0),
    totalMs: z.number().int().min(0),
    cacheHit: z.boolean(),
  }),
});

export type LightweightRecommendation = z.infer<typeof LightweightRecommendationSchema>;
export type LightweightRecommendationResult = z.infer<typeof LightweightRecommendationResultSchema>;

// ============================================================================
// EMAIL PROCESSING TYPES
// ============================================================================

export const EmailMetadataSchema = z.object({
  tone: z.enum(['professional', 'casual', 'urgent']),
  priority: z.enum(['low', 'medium', 'high']),
  expectedResponse: z.enum(['none', 'acknowledgment', 'action_required']),
  wordCount: z.number().int().positive(),
  estimatedReadTime: z.number().int().positive(), // minutes
});

export const GeneratedEmailSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  htmlBody: z.string().optional(),
  metadata: EmailMetadataSchema,
});

export const TaskExtractionSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    dueDate: z.string().optional(),
    category: z.string().optional(),
    status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  })),
  summary: z.string(),
  urgentItems: z.array(z.string()).optional(),
});

export const SearchEnhancementSchema = z.object({
  enhancedQuery: z.string(),
  keywords: z.array(z.string()),
  filters: z.object({
    category: z.string().optional(),
    ageRange: z.object({
      min: z.number(),
      max: z.number(),
    }).optional(),
    location: z.string().optional(),
    schedule: z.array(z.string()).optional(),
  }).optional(),
  confidence: z.number().min(0).max(1),
});

export type EmailMetadata = z.infer<typeof EmailMetadataSchema>;
export type GeneratedEmail = z.infer<typeof GeneratedEmailSchema>;
export type TaskExtraction = z.infer<typeof TaskExtractionSchema>;
export type SearchEnhancement = z.infer<typeof SearchEnhancementSchema>;

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Family Parsing API
export const FamilyParsingRequestSchema = z.object({
  description: z.string().min(10).max(5000),
  options: z.object({
    useCache: z.boolean().optional().default(true),
    model: z.enum(['gpt-4o-mini', 'gpt-4o']).optional().default('gpt-4o-mini'),
    includeMetrics: z.boolean().optional().default(false),
  }).optional().default(() => ({
    useCache: true,
    model: 'gpt-4o-mini' as const,
    includeMetrics: false
  })),
});

export const FamilyParsingResponseSchema = z.object({
  success: z.boolean(),
  familyProfile: FamilyProfileSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  warnings: z.array(z.string()).optional(),
  usage: z.object({
    tokensUsed: z.number().int().min(0),
    estimatedCost: z.number().min(0),
    model: z.string(),
    cached: z.boolean(),
  }).optional(),
  error: z.string().optional(),
});

// Recommendations API
export const RecommendationRequestSchema = z.object({
  familyProfile: FamilyProfileSchema.optional(),
  query: z.string().min(10).max(2000).optional(),
  filters: RecommendationFiltersSchema.optional().default({}),
  options: z.object({
    limit: z.number().int().min(1).max(50).optional().default(10),
    includeExplanations: z.boolean().optional().default(true),
    includeScores: z.boolean().optional().default(false),
    diversityWeight: z.number().min(0).max(1).optional().default(0.3),
    useCache: z.boolean().optional().default(true),
    model: z.enum(['gpt-4o-mini', 'gpt-4o']).optional().default('gpt-4o-mini'),
    includeMetrics: z.boolean().optional().default(false),
  }).optional().default(() => ({
    limit: 10,
    includeExplanations: true,
    includeScores: false,
    diversityWeight: 0.3,
    useCache: true,
    model: 'gpt-4o-mini' as const,
    includeMetrics: false
  })),
}).refine(
  data => data.familyProfile || data.query,
  "Either 'familyProfile' or 'query' must be provided"
);

export const RecommendationResponseSchema = z.object({
  success: z.boolean(),
  recommendations: z.array(RecommendationSchema).optional(),
  searchSummary: z.string().optional(),
  totalMatches: z.number().int().min(0).optional(),
  performance: z.object({
    vectorSearchMs: z.number().int().min(0),
    aiProcessingMs: z.number().int().min(0),
    totalMs: z.number().int().min(0),
    cacheHit: z.boolean(),
  }).optional(),
  usage: z.object({
    tokensUsed: z.number().int().min(0),
    estimatedCost: z.number().min(0),
    model: z.string(),
  }).optional(),
  error: z.string().optional(),
});

export type FamilyParsingRequest = z.infer<typeof FamilyParsingRequestSchema>;
export type FamilyParsingResponse = z.infer<typeof FamilyParsingResponseSchema>;
export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;
export type RecommendationResponse = z.infer<typeof RecommendationResponseSchema>;

// ============================================================================
// ERROR TYPES
// ============================================================================

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.union([
    z.string(),
    z.record(z.string(), z.any()),
  ]).optional(),
  timestamp: z.string().optional(),
  requestId: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Extract error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Unknown error occurred';
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  message: string,
  details?: any,
  requestId?: string
): ErrorResponse {
  return {
    success: false,
    error: message,
    details,
    timestamp: new Date().toISOString(),
    requestId,
  };
}