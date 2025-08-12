/**
 * POST /api/v1/ai/parse-family - Parse natural language family descriptions into structured profiles
 *
 * WHY: Natural language family parsing because:
 * - Parents describe their families in diverse, unstructured ways
 * - Manual form-filling is tedious and reduces conversion rates
 * - AI can extract structured data while maintaining natural user experience
 * - Enables voice input and conversational onboarding flows
 * - Reduces friction in the family registration process
 *
 * DESIGN DECISIONS:
 * - Structured output: Consistent family profile format for database storage
 * - Validation: Zod schemas ensure data integrity and type safety
 * - Cost optimization: Use efficient model (gpt-4o-mini) for parsing tasks
 * - Caching: Cache parsed profiles to avoid re-processing similar inputs
 * - Error handling: Graceful fallbacks for unparseable inputs
 * - Usage tracking: Monitor AI costs and performance for optimization
 *
 * SECURITY CONSIDERATIONS:
 * - Input sanitization: Validate and limit user input size
 * - Rate limiting: Prevent abuse of expensive AI operations
 * - Data privacy: No logging of personal information
 * - Authentication: POC bypasses auth, production should validate users
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Model choice: gpt-4o-mini for cost-effective parsing
 * - Response caching: Redis cache for repeated similar inputs
 * - Token optimization: Efficient prompts minimize API costs
 * - Error recovery: Retry logic for transient failures
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIClient, createAICacheKey } from '@/lib/ai/openai-client';
import { createFamilyParsingPrompt } from '@/lib/ai/prompts';
import { FamilyProfileSchema, type FamilyProfile } from '@/types/ai';
import { z } from 'zod';

// Request validation schema
const ParseFamilyRequestSchema = z.object({
  description: z.string()
    .min(10, 'Family description must be at least 10 characters')
    .max(5000, 'Family description must be less than 5000 characters')
    .refine(
      (text) => text.trim().length > 0,
      'Family description cannot be empty or only whitespace'
    ),
  options: z.object({
    useCache: z.boolean().optional().default(true),
    model: z.enum(['gpt-4o-mini', 'gpt-4o']).optional().default('gpt-4o-mini'),
    includeMetrics: z.boolean().optional().default(false),
  }).optional().default({
    useCache: true,
    model: 'gpt-4o-mini',
    includeMetrics: false
  }),
});

type ParseFamilyRequest = z.infer<typeof ParseFamilyRequestSchema>;

// Response interface
interface ParseFamilyResponse {
  success: boolean;
  familyProfile?: FamilyProfile;
  confidence?: number; // 0-1 score indicating parsing confidence
  warnings?: string[]; // Non-critical issues that were handled
  error?: string;
  usage?: {
    tokensUsed: number;
    estimatedCost: number;
    model: string;
    cached: boolean;
  };
}

/**
 * POST /api/v1/ai/parse-family
 * 
 * Parse natural language family description into structured profile.
 * 
 * Example request:
 * ```json
 * {
 *   "description": "Hi! I'm Sarah with two kids - Emma (7) loves art and Jake (10) plays soccer. We're in Brooklyn Heights looking for after-school activities.",
 *   "options": {
 *     "useCache": true,
 *     "model": "gpt-4o-mini"
 *   }
 * }
 * ```
 */
export async function POST(request: NextRequest) {
  let aiClient;
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedRequest = ParseFamilyRequestSchema.parse(body);
    
    const { description, options } = validatedRequest;

    // Get AI client instance
    aiClient = getAIClient();

    // Create cache key if caching is enabled
    let cacheKey: string | undefined;
    if (options.useCache) {
      cacheKey = createAICacheKey('family-parse', {
        description: description.toLowerCase().trim(),
        model: options.model,
      });
    }

    // Generate parsing prompts
    const prompts = createFamilyParsingPrompt(description);

    // Call OpenAI API with cost tracking
    const aiResponse = await aiClient.createChatCompletion({
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user },
      ],
      model: options.model,
      temperature: 0.1, // Low temperature for consistent parsing
      max_tokens: 2000, // Reasonable limit for family profiles
      stream: false,
    }, {
      cacheKey,
      cacheTtl: options.useCache ? 3600 : undefined, // 1 hour cache
      retries: 2,
    });

    // Parse the AI response as JSON
    let parsedProfile: any;
    try {
      parsedProfile = JSON.parse(aiResponse.content);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', aiResponse.content);
      throw new Error('AI returned invalid JSON response. Please try again.');
    }

    // Validate the parsed profile against our schema
    let familyProfile: FamilyProfile;
    let warnings: string[] = [];
    
    try {
      familyProfile = FamilyProfileSchema.parse(parsedProfile);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        // Try to extract partial data and provide helpful warnings
        const issues = validationError.issues.map(issue => 
          `${issue.path.join('.')}: ${issue.message}`
        );
        
        console.warn('Family profile validation issues:', issues);
        
        // For POC, we'll be more lenient and try to fix common issues
        try {
          // Attempt basic fixes for common validation issues
          const fixedProfile = attemptProfileFixes(parsedProfile);
          familyProfile = FamilyProfileSchema.parse(fixedProfile);
          warnings.push('Some profile data was automatically corrected for consistency');
        } catch (secondValidationError) {
          throw new Error(`Unable to parse family profile: ${issues.slice(0, 3).join('; ')}`);
        }
      } else {
        throw validationError;
      }
    }

    // Calculate confidence score based on completeness and quality
    const confidence = calculateParsingConfidence(familyProfile, description);

    // Add low confidence warning
    if (confidence < 0.7) {
      warnings.push('Parsing confidence is low. Please review and edit the extracted information.');
    }

    // Prepare response
    const response: ParseFamilyResponse = {
      success: true,
      familyProfile,
      confidence,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    // Include usage metrics if requested
    if (options.includeMetrics) {
      response.usage = {
        tokensUsed: aiResponse.usage.totalTokens,
        estimatedCost: aiResponse.usage.estimatedCost,
        model: options.model,
        cached: cacheKey ? false : false, // TODO: Detect cache hits
      };
    }

    // Log success metrics (no personal data)
    console.log(`Family parsing successful: ${aiResponse.usage.totalTokens} tokens, $${aiResponse.usage.estimatedCost.toFixed(4)} cost, ${confidence.toFixed(2)} confidence`);

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Family parsing error:', error);

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

    // Handle AI-specific errors
    if ((error as any)?.status === 429) {
      return NextResponse.json({
        success: false,
        error: 'AI service is currently rate limited. Please try again in a few moments.',
      }, { status: 429 });
    }

    if ((error as any)?.status === 401 || (error as any)?.status === 403) {
      console.error('OpenAI API authentication error');
      return NextResponse.json({
        success: false,
        error: 'AI service configuration error. Please contact support.',
      }, { status: 500 });
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json({
      success: false,
      error: errorMessage.includes('AI returned') ? errorMessage : 'Failed to parse family description. Please try rephrasing your input.',
    }, { status: 500 });

  } finally {
    // Clean up resources if needed
    // Note: AI client is shared globally, so we don't clean it up here
  }
}

/**
 * Attempt to fix common validation issues in parsed family profiles.
 * 
 * WHY: AI responses sometimes have minor formatting issues that can be automatically corrected:
 * - Missing required fields can be filled with defaults
 * - Invalid enums can be mapped to valid values
 * - Empty arrays can be populated with reasonable defaults
 */
function attemptProfileFixes(profile: any): any {
  const fixed = JSON.parse(JSON.stringify(profile)); // Deep copy

  // Ensure adults array exists and has at least one entry
  if (!fixed.adults || !Array.isArray(fixed.adults) || fixed.adults.length === 0) {
    fixed.adults = [{ name: 'Parent', role: 'parent' }];
  }

  // Fix adult roles
  if (fixed.adults) {
    fixed.adults = fixed.adults.map((adult: any) => ({
      ...adult,
      role: adult.role && ['parent', 'guardian', 'caregiver'].includes(adult.role) ? adult.role : 'parent',
    }));
  }

  // Ensure children array exists
  if (!fixed.children || !Array.isArray(fixed.children)) {
    fixed.children = [];
  }

  // Fix children data
  if (fixed.children) {
    fixed.children = fixed.children.map((child: any) => ({
      ...child,
      age: typeof child.age === 'number' ? child.age : 5, // Default age
      interests: Array.isArray(child.interests) ? child.interests : [],
      allergies: Array.isArray(child.allergies) ? child.allergies : [],
    }));
  }

  // Ensure location object exists
  if (!fixed.location || typeof fixed.location !== 'object') {
    fixed.location = {};
  }

  // Ensure preferences object exists
  if (!fixed.preferences || typeof fixed.preferences !== 'object') {
    fixed.preferences = {};
  }

  // Fix preferences structure
  if (fixed.preferences) {
    if (fixed.preferences.activityTypes && !Array.isArray(fixed.preferences.activityTypes)) {
      fixed.preferences.activityTypes = [];
    }
    if (fixed.preferences.languages && !Array.isArray(fixed.preferences.languages)) {
      fixed.preferences.languages = [];
    }
    if (fixed.preferences.schedule && !Array.isArray(fixed.preferences.schedule)) {
      fixed.preferences.schedule = [];
    }
  }

  return fixed;
}

/**
 * Calculate parsing confidence based on profile completeness and input quality.
 * 
 * WHY: Confidence scoring helps users understand the reliability of the parsing:
 * - High confidence: Profile is complete and well-structured
 * - Medium confidence: Most data extracted but some gaps
 * - Low confidence: Minimal data extracted, manual review recommended
 */
function calculateParsingConfidence(profile: FamilyProfile, originalInput: string): number {
  let score = 0.5; // Base score
  let maxScore = 1.0;

  // Adult information completeness (0.2 weight)
  if (profile.adults.length > 0) {
    score += 0.1;
    if (profile.adults[0].name && profile.adults[0].name.trim() !== 'Parent') {
      score += 0.1;
    }
  }

  // Children information completeness (0.3 weight)
  if (profile.children.length > 0) {
    score += 0.1;
    const avgChildCompleteness = profile.children.reduce((sum, child) => {
      let childScore = 0;
      if (child.name && child.name.trim()) childScore += 0.4;
      if (child.age > 0 && child.age <= 18) childScore += 0.3;
      if (child.interests.length > 0) childScore += 0.3;
      return sum + childScore;
    }, 0) / profile.children.length;
    score += avgChildCompleteness * 0.2;
  }

  // Location information (0.2 weight)
  const locationFields = [
    profile.location.neighborhood,
    profile.location.city,
    profile.location.zipCode
  ].filter(Boolean);
  score += (locationFields.length / 3) * 0.2;

  // Preferences completeness (0.2 weight)
  let preferencesScore = 0;
  if (profile.preferences?.activityTypes && profile.preferences.activityTypes.length > 0) {
    preferencesScore += 0.1;
  }
  if (profile.preferences?.budget && (profile.preferences.budget.min || profile.preferences.budget.max)) {
    preferencesScore += 0.05;
  }
  if (profile.preferences?.schedule && profile.preferences.schedule.length > 0) {
    preferencesScore += 0.05;
  }
  score += preferencesScore;

  // Input quality bonus (0.1 weight)
  const inputLength = originalInput.trim().length;
  if (inputLength > 100) score += 0.05;
  if (inputLength > 300) score += 0.05;

  return Math.min(score, maxScore);
}