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
 * - Fresh processing: Each request is processed fresh without caching
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
 * - Fresh processing: No caching ensures up-to-date responses
 * - Token optimization: Efficient prompts minimize API costs
 * - Error recovery: Retry logic for transient failures
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIClient } from '@/lib/ai/openai-client';
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
    model: z.enum(['gpt-4o-mini', 'gpt-4o']).optional().default('gpt-4o-mini'),
    includeMetrics: z.boolean().optional().default(false),
  }).optional().default({
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
 * DEMO MODE:
 * To test without OpenRouter API, either:
 * 1. Set DEMO_MODE=true in environment variables, OR
 * 2. Add ?demo query parameter to request URL
 * 
 * Example request:
 * ```json
 * {
 *   "description": "Hi! I'm Sarah with two kids - Emma (7) loves art and Jake (10) plays soccer. We're in Brooklyn Heights looking for after-school activities.",
 *   "options": {
 *     "model": "gpt-4o-mini"
 *   }
 * }
 * ```
 * 
 * Example demo mode request:
 * ```
 * POST /api/v1/ai/parse-family?demo
 * ```
 */
export async function POST(request: NextRequest) {
  let aiClient;
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedRequest = ParseFamilyRequestSchema.parse(body);
    
    const { description, options } = validatedRequest;

    // Check for demo mode
    const searchParams = new URL(request.url).searchParams;
    const isDemoMode = process.env.DEMO_MODE === 'true' || searchParams.has('demo');

    if (isDemoMode) {
      // Parse actual user input in demo mode instead of returning hardcoded data
      const mockProfile = createMockFamilyProfile(description);
      
      console.log('Demo mode: Returning parsed family profile from description');
      
      return NextResponse.json({
        success: true,
        familyProfile: mockProfile,
        confidence: 0.95,
        warnings: ['Demo mode: Parsed using simple string matching (not AI)'],
        usage: {
          tokensUsed: 0,
          estimatedCost: 0,
          model: 'demo-parser',
          cached: false,
        },
      } satisfies ParseFamilyResponse, { status: 200 });
    }

    // Get AI client instance
    aiClient = getAIClient();

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
        cached: false
      };
    }

    // Log success metrics (no personal data)
    console.log(`Family parsing successful: ${aiResponse.usage.totalTokens} tokens, $${aiResponse.usage.estimatedCost.toFixed(4)} cost, ${confidence.toFixed(2)} confidence`);

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Family parsing error:', error);
    
    // Enhanced error logging for debugging
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      status: (error as any)?.status,
      code: (error as any)?.code,
      type: (error as any)?.type,
      response: (error as any)?.response?.data || (error as any)?.response,
    });

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
      console.error('OpenRouter API authentication error - check API key validity');
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
 * Create a family profile by parsing actual user description for demo purposes.
 * 
 * WHY: Demo mode parsing allows local testing without AI API dependencies:
 * - Enables UI development and testing without OpenRouter API key
 * - Parses real user input using regex and string matching
 * - Allows demonstration of features without incurring API costs
 * - Facilitates onboarding new developers to the project
 * - Tests actual user input patterns without AI costs
 * 
 * PARSING STRATEGY:
 * - Uses regex patterns to extract parent names, child info, locations, interests
 * - Handles various input formats: "I'm Maria", "My name is John", "Emma (7)", "Jake age 10"
 * - Falls back to reasonable defaults when specific data isn't found
 * - Simple but effective for demo and testing purposes
 */
function createMockFamilyProfile(description: string): FamilyProfile {
  const text = description.toLowerCase();
  
  // Parse parent names
  const parentNamePatterns = [
    /(?:i'm|i am|my name is|i'm called)\s+([a-zA-Z]+)/i,
    /^([a-zA-Z]+)\s+(?:here|with|and)/i,
    /^hi,?\s*i'm\s+([a-zA-Z]+)/i,
  ];
  
  let parentName = 'Parent';
  for (const pattern of parentNamePatterns) {
    const match = description.match(pattern);
    if (match) {
      parentName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      break;
    }
  }
  
  // Parse children information
  const children: Array<{ name: string; age: number; interests: string[]; allergies: string[]; specialNeeds?: string }> = [];
  
  // Pattern 1: "Emma (7)", "Jake (10 years old)"
  const childPatternParens = /([a-zA-Z]+)\s*\((\d+)(?:\s*years?\s*old)?\)/gi;
  let match;
  while ((match = childPatternParens.exec(description)) !== null) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const age = parseInt(match[2]);
    if (age >= 0 && age <= 18) {
      children.push({
        name,
        age,
        interests: [],
        allergies: [],
      });
    }
  }
  
  // Pattern 2: "Emma age 7", "Jake is 10"
  const childPatternAge = /([a-zA-Z]+)(?:\s+(?:age|is|who is|who's))\s+(\d+)/gi;
  while ((match = childPatternAge.exec(description)) !== null) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const age = parseInt(match[2]);
    if (age >= 0 && age <= 18) {
      // Check if child already exists before adding
      const existingChild = children.find(child => child.name.toLowerCase() === name.toLowerCase());
      if (!existingChild) {
        children.push({
          name,
          age,
          interests: [],
          allergies: [],
        });
      }
    }
  }
  
  // Pattern 3: "my 7 year old Emma", "our 10-year-old Jake"
  const childPatternMyChild = /(?:my|our)\s+(\d+)[-\s]*year[-\s]*old\s+([a-zA-Z]+)/gi;
  while ((match = childPatternMyChild.exec(description)) !== null) {
    const age = parseInt(match[1]);
    const name = match[2].charAt(0).toUpperCase() + match[2].slice(1);
    if (age >= 0 && age <= 18) {
      // Check if child already exists before adding
      const existingChild = children.find(child => child.name.toLowerCase() === name.toLowerCase());
      if (!existingChild) {
        children.push({
          name,
          age,
          interests: [],
          allergies: [],
        });
      }
    }
  }
  
  // If no specific children found, create a default child
  if (children.length === 0) {
    children.push({
      name: 'Child',
      age: 8,
      interests: [],
      allergies: [],
    });
  }
  
  // Parse interests for each child
  const interestKeywords = [
    'loves', 'likes', 'enjoys', 'plays', 'does', 'interested in', 'passionate about'
  ];
  
  children.forEach(child => {
    const childNameLower = child.name.toLowerCase();
    
    // Look for interest patterns mentioning the child's name
    for (const keyword of interestKeywords) {
      // Match pattern: "Emma ... loves art" but stop at sentence boundaries
      const pattern = new RegExp(`${childNameLower}[^.!?]*?\\b${keyword}\\s+([^.!?]*?)(?:\\s+(?:and|we|my|our|\\.|!|\\?)|$)`, 'i');
      const interestMatch = description.match(pattern);
      if (interestMatch) {
        const rawInterests = interestMatch[1].trim();
        // Filter out obvious non-interests (other children's names, ages, etc.)
        const filteredInterests = rawInterests
          .split(/\s+(?:and|,)\s+/)
          .map(interest => interest.trim())
          .filter(interest => {
            return interest.length > 0 && 
                   interest.length < 20 && 
                   !interest.match(/\d+\s+years?\s+old/) && // Not "10 years old"
                   !interest.match(/\bis\s+\d+/) &&         // Not "is 10"  
                   !interest.match(/age\s+\d+/) &&          // Not "age 10"
                   !interest.match(/^\d+$/) &&              // Not just a number
                   !children.some(otherChild => otherChild.name.toLowerCase() === interest.toLowerCase());
          });
        child.interests.push(...filteredInterests);
      }
    }
    
    // Also check patterns like "daughter Sofia (8) who loves dance"
    const whoPattern = new RegExp(`${childNameLower}[^.!?]*?who\\s+(loves|likes|enjoys|plays)\\s+([^.!?]*?)(?:\\s+(?:and|we|my|our|\\.|!|\\?)|$)`, 'i');
    const whoMatch = description.match(whoPattern);
    if (whoMatch) {
      const rawInterests = whoMatch[2].trim();
      const filteredInterests = rawInterests
        .split(/\s+(?:and|,)\s+/)
        .map(interest => interest.trim())
        .filter(interest => {
          return interest.length > 0 && 
                 interest.length < 20 && 
                 !interest.match(/\d+\s+years?\s+old/) && 
                 !interest.match(/\bis\s+\d+/) &&         
                 !interest.match(/age\s+\d+/) &&          
                 !interest.match(/^\d+$/) &&              
                 !children.some(otherChild => otherChild.name.toLowerCase() === interest.toLowerCase());
        });
      child.interests.push(...filteredInterests);
    }
    
    // Remove duplicates
    child.interests = Array.from(new Set(child.interests));
    
    // If child has no specific interests, look for general patterns but be much more conservative
    if (child.interests.length === 0) {
      const generalInterests = [];
      
      // Only assign interests if this child is specifically mentioned in the same sentence/clause with the activity
      const sentences = description.toLowerCase().split(/[.!?]/)
        .filter(sentence => sentence.includes(childNameLower));
      
      for (const sentence of sentences) {
        // Only look for activities mentioned in the same sentence as this specific child
        const beforeChild = sentence.substring(0, sentence.indexOf(childNameLower));
        const afterChild = sentence.substring(sentence.indexOf(childNameLower));
        
        // Check if activities are mentioned close to this child's name (within same sentence)
        if (afterChild.includes('soccer') || afterChild.includes('football')) generalInterests.push('soccer');
        else if (beforeChild.includes('soccer') || beforeChild.includes('football')) {
          // Only if it's directly related to this child, not another child mentioned earlier
          if (!beforeChild.match(/\w+\s+(?:who|loves|likes|plays|enjoys)\s.*?(?:soccer|football)/)) {
            generalInterests.push('soccer');
          }
        }
        
        if (afterChild.includes('art') || afterChild.includes('drawing') || afterChild.includes('paint')) generalInterests.push('art');
        if (afterChild.includes('music') || afterChild.includes('piano') || afterChild.includes('guitar')) generalInterests.push('music');
        if (afterChild.includes('dance') || afterChild.includes('ballet')) generalInterests.push('dance');
        if (afterChild.includes('swim')) generalInterests.push('swimming');
        if (afterChild.includes('basketball')) generalInterests.push('basketball');
        if (afterChild.includes('tennis')) generalInterests.push('tennis');
        if (afterChild.includes('reading') || afterChild.includes('books')) generalInterests.push('reading');
        if (afterChild.includes('science') || afterChild.includes('stem')) generalInterests.push('science');
        if (afterChild.includes('math')) generalInterests.push('math');
      }
      
      // Remove duplicates and limit
      child.interests = Array.from(new Set(generalInterests)).slice(0, 3);
    }
  });
  
  // Parse location information
  const location: any = {
    transportationNeeds: false,
  };
  
  // Common city patterns
  const cityPatterns = [
    /(?:we live in|in|from|live in|located in)\s+([a-zA-Z\s]+?)(?:\s*(?:and|,|$|\.|!|\?))/i,
    /([a-zA-Z\s]+)\s+area/i,
  ];
  
  for (const pattern of cityPatterns) {
    const locationMatch = description.match(pattern);
    if (locationMatch) {
      const locationText = locationMatch[1].trim();
      // Common city/neighborhood names
      const commonCities = ['austin', 'brooklyn', 'manhattan', 'seattle', 'portland', 'denver', 'chicago', 'boston', 'atlanta', 'dallas', 'houston'];
      const commonNeighborhoods = ['heights', 'downtown', 'midtown', 'uptown', 'westside', 'eastside', 'north', 'south'];
      
      const locationLower = locationText.toLowerCase();
      
      // Check if it's a known city
      const cityMatch = commonCities.find(city => locationLower.includes(city));
      if (cityMatch) {
        location.city = cityMatch.charAt(0).toUpperCase() + cityMatch.slice(1);
        // If it's "Brooklyn Heights", set the neighborhood too
        if (locationLower.includes('heights') && cityMatch === 'brooklyn') {
          location.neighborhood = locationText;
        }
      }
      
      // Check if it mentions a neighborhood
      const neighborhoodMatch = commonNeighborhoods.find(neighborhood => locationLower.includes(neighborhood));
      if (neighborhoodMatch && !location.neighborhood) {
        location.neighborhood = locationText;
      }
      
      // If no specific match, use as neighborhood
      if (!location.city && !location.neighborhood) {
        location.neighborhood = locationText;
      }
      break;
    }
  }
  
  // Parse budget information
  let budget: any = undefined;
  // Look for budget patterns with or without dollar signs
  const budgetPatterns = [
    /\$(\d+)(?:\s*[-to]+\s*\$?(\d+))?/i,                          // $150-$250 or $150-250
    /budget\s+of\s+\$?(\d+)(?:\s*[-to]+\s*\$?(\d+))?/i,          // budget of 150-250
    /(\d+)[-to]+(\d+)(?:\s+(?:dollars?|per month|monthly))/i,    // 150-250 per month
    /\$?(\d+)\s*[-to]+\s*\$?(\d+)/i                              // 150-250 or $150-$250
  ];
  
  for (const pattern of budgetPatterns) {
    const budgetMatch = description.match(pattern);
    if (budgetMatch) {
      const min = parseInt(budgetMatch[1]);
      const max = budgetMatch[2] ? parseInt(budgetMatch[2]) : undefined;
      budget = {
        min,
        max,
        currency: 'USD',
      };
      break;
    }
  }
  
  // Parse schedule preferences
  const schedule: Array<'weekday_morning' | 'weekday_afternoon' | 'weekday_evening' | 'weekend_morning' | 'weekend_afternoon' | 'weekend_evening'> = [];
  const scheduleConstraints: any = {
    timeSlots: [] as Array<'weekday_morning' | 'weekday_afternoon' | 'weekday_evening' | 'weekend_morning' | 'weekend_afternoon' | 'weekend_evening'>,
    flexibility: 'somewhat_flexible' as const,
  };
  
  if (text.includes('after school') || text.includes('afternoon')) {
    schedule.push('weekday_afternoon');
    scheduleConstraints.timeSlots.push('weekday_afternoon');
  }
  if (text.includes('weekend') || text.includes('saturday') || text.includes('sunday')) {
    schedule.push('weekend_morning');
    scheduleConstraints.timeSlots.push('weekend_morning');
  }
  if (text.includes('morning')) {
    schedule.push('weekday_morning');
    scheduleConstraints.timeSlots.push('weekday_morning');
  }
  if (text.includes('evening')) {
    schedule.push('weekday_evening');
    scheduleConstraints.timeSlots.push('weekday_evening');
  }
  
  // Default schedule if none specified
  if (schedule.length === 0) {
    schedule.push('weekday_afternoon');
    scheduleConstraints.timeSlots.push('weekday_afternoon');
  }
  
  // Activity types based on interests
  const activityTypes = new Set<string>();
  children.forEach(child => {
    child.interests.forEach(interest => {
      if (['soccer', 'basketball', 'tennis', 'swimming'].includes(interest)) {
        activityTypes.add('sports');
      }
      if (['art', 'drawing', 'painting'].includes(interest)) {
        activityTypes.add('arts');
      }
      if (['music', 'piano', 'guitar'].includes(interest)) {
        activityTypes.add('music');
      }
      if (['dance', 'ballet'].includes(interest)) {
        activityTypes.add('dance');
      }
      if (['science', 'math', 'reading'].includes(interest)) {
        activityTypes.add('educational');
      }
    });
  });
  
  // Add some default activity types
  if (activityTypes.size === 0) {
    activityTypes.add('educational');
    activityTypes.add('recreational');
  }
  
  return {
    adults: [
      {
        name: parentName,
        role: 'parent',
      }
    ],
    children,
    location,
    preferences: {
      budget,
      schedule,
      scheduleConstraints,
      activityTypes: Array.from(activityTypes),
      languages: ['English'],
    },
    notes: `Parsed from description: "${description.slice(0, 100)}${description.length > 100 ? '...' : ''}"`
  };
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