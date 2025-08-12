/**
 * Email processor for generating realistic provider emails and parsing tasks from email content.
 *
 * WHY: Email processing capabilities because:
 * - Providers send various types of emails: confirmations, changes, reminders, info updates
 * - Parents need help organizing tasks extracted from provider communications
 * - Realistic email generation is crucial for POC demonstrations and testing
 * - AI can understand context and extract actionable items better than rule-based parsing
 * - Automated task extraction reduces parent cognitive load and improves organization
 *
 * DESIGN DECISIONS:
 * - Template-based generation: Ensures realistic, contextually appropriate emails
 * - Multi-format support: HTML and plain text email generation
 * - Intelligent parsing: Uses AI to understand email context and extract tasks
 * - Task categorization: Automatically categorizes tasks by type and priority
 * - Metadata extraction: Pulls relevant dates, amounts, contact info from emails
 * - Error handling: Graceful fallbacks for unparseable or unusual email content
 *
 * EMAIL TYPES SUPPORTED:
 * - Booking confirmations: Registration success, class schedules, preparation items
 * - Schedule changes: Time/date updates, location changes, instructor changes
 * - Payment reminders: Overdue notices, payment method issues, billing questions
 * - Program information: Activity details, policies, required materials
 * - Contact requests: Provider questions, feedback requests, survey invitations
 */

import { getAIClient, createAICacheKey } from './openai-client';
import { createEmailGenerationPrompt, createEmailParsingPrompt } from './prompts';
import { TaskExtractionSchema, type TaskExtraction } from '@/types/ai';
import { z } from 'zod';

// Email generation schemas
export const EmailGenerationRequestSchema = z.object({
  emailType: z.enum(['booking_confirmation', 'schedule_change', 'payment_reminder', 'program_info']),
  context: z.object({
    providerName: z.string().min(1).max(100),
    programName: z.string().min(1).max(100),
    childName: z.string().min(1).max(50),
    parentName: z.string().min(1).max(50),
    details: z.record(z.string(), z.any()).optional().default({}),
  }),
  options: z.object({
    tone: z.enum(['professional', 'casual', 'urgent']).optional().default('professional'),
    includeHtml: z.boolean().optional().default(false),
    useCache: z.boolean().optional().default(true),
    model: z.enum(['gpt-4o-mini', 'gpt-4o']).optional().default('gpt-4o-mini'),
  }).optional().default({
    tone: 'professional',
    includeHtml: false,
    useCache: true,
    model: 'gpt-4o-mini'
  }),
});

// Email parsing schemas
export const EmailParsingRequestSchema = z.object({
  emailContent: z.string().min(10).max(10000),
  emailSubject: z.string().max(200).optional(),
  senderInfo: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    role: z.enum(['provider', 'instructor', 'admin', 'parent', 'other']).optional(),
  }).optional(),
  options: z.object({
    extractMetadata: z.boolean().optional().default(true),
    useCache: z.boolean().optional().default(true),
    model: z.enum(['gpt-4o-mini', 'gpt-4o']).optional().default('gpt-4o-mini'),
  }).optional().default({
    extractMetadata: true,
    useCache: true,
    model: 'gpt-4o-mini'
  }),
});

// Response interfaces
export interface GeneratedEmail {
  subject: string;
  body: string;
  htmlBody?: string;
  metadata: {
    tone: string;
    priority: 'low' | 'medium' | 'high';
    expectedResponse: 'none' | 'acknowledgment' | 'action_required';
    wordCount: number;
    estimatedReadTime: number; // minutes
  };
}

export interface ParsedEmailTasks extends TaskExtraction {
  extractedMetadata?: {
    dates: string[];
    amounts: Array<{ value: number; currency: string; context: string }>;
    contacts: Array<{ name?: string; email?: string; phone?: string; role?: string }>;
    locations: string[];
    links: string[];
  };
}

export type EmailGenerationRequest = z.infer<typeof EmailGenerationRequestSchema>;
export type EmailParsingRequest = z.infer<typeof EmailParsingRequestSchema>;

/**
 * Email processor that handles both generation and parsing of provider emails.
 */
export class EmailProcessor {
  private aiClient: ReturnType<typeof getAIClient>;

  constructor() {
    this.aiClient = getAIClient();
  }

  /**
   * Generate a realistic provider email based on type and context.
   */
  async generateEmail(request: EmailGenerationRequest): Promise<{
    email: GeneratedEmail;
    usage: { tokensUsed: number; estimatedCost: number; model: string; cached: boolean };
  }> {
    const { emailType, context, options } = request;

    // Enhance context with type-specific details
    const enhancedContext = this.enhanceEmailContext(emailType, context);

    // Generate cache key if caching enabled
    let cacheKey: string | undefined;
    if (options.useCache) {
      cacheKey = createAICacheKey('email-gen', {
        type: emailType,
        context: enhancedContext,
        tone: options.tone,
        model: options.model,
      });
    }

    // Create generation prompts
    const prompts = createEmailGenerationPrompt(emailType, enhancedContext);

    // Generate email using AI
    const aiResponse = await this.aiClient.createChatCompletion({
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user },
      ],
      model: options.model,
      temperature: 0.7, // Balanced creativity for natural-sounding emails
      max_tokens: 1000,
      stream: false,
    }, {
      cacheKey,
      cacheTtl: 3600, // 1 hour cache
      retries: 2,
    });

    // Parse AI response
    let emailData: any;
    try {
      emailData = JSON.parse(aiResponse.content);
    } catch (parseError) {
      throw new Error('AI returned invalid email format. Please try again.');
    }

    // Validate required fields
    if (!emailData.subject || !emailData.body) {
      throw new Error('Generated email is missing required fields');
    }

    // Calculate metadata
    const wordCount = this.countWords(emailData.body);
    const estimatedReadTime = Math.ceil(wordCount / 200); // 200 words per minute average

    // Generate HTML version if requested
    let htmlBody: string | undefined;
    if (options.includeHtml) {
      htmlBody = this.convertToHtml(emailData.body, emailData.subject, context.providerName);
    }

    const generatedEmail: GeneratedEmail = {
      subject: emailData.subject,
      body: emailData.body,
      htmlBody,
      metadata: {
        tone: emailData.metadata?.tone || options.tone || 'professional',
        priority: emailData.metadata?.priority || this.inferPriority(emailType),
        expectedResponse: emailData.metadata?.expectedResponse || this.inferExpectedResponse(emailType),
        wordCount,
        estimatedReadTime,
      },
    };

    console.log(`Generated ${emailType} email: ${wordCount} words, ${aiResponse.usage.totalTokens} tokens`);

    return {
      email: generatedEmail,
      usage: {
        tokensUsed: aiResponse.usage.totalTokens,
        estimatedCost: aiResponse.usage.estimatedCost,
        model: options.model,
        cached: false, // TODO: Detect cache hits
      },
    };
  }

  /**
   * Parse email content and extract actionable tasks.
   */
  async parseEmailTasks(request: EmailParsingRequest): Promise<{
    tasks: ParsedEmailTasks;
    usage: { tokensUsed: number; estimatedCost: number; model: string; cached: boolean };
  }> {
    const { emailContent, emailSubject, senderInfo, options } = request;

    // Generate cache key if caching enabled
    let cacheKey: string | undefined;
    if (options.useCache) {
      cacheKey = createAICacheKey('email-parse', {
        content: emailContent.slice(0, 500), // First 500 chars for cache key
        subject: emailSubject,
        model: options.model,
      });
    }

    // Create parsing prompts
    const prompts = createEmailParsingPrompt(emailContent, emailSubject, senderInfo);

    // Parse email using AI
    const aiResponse = await this.aiClient.createChatCompletion({
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user },
      ],
      model: options.model,
      temperature: 0.2, // Low temperature for consistent parsing
      max_tokens: 2000,
      stream: false,
    }, {
      cacheKey,
      cacheTtl: 7200, // 2 hour cache for email parsing
      retries: 2,
    });

    // Parse and validate AI response
    let parsedTasks: any;
    try {
      parsedTasks = JSON.parse(aiResponse.content);
      // Validate against schema
      parsedTasks = TaskExtractionSchema.parse(parsedTasks);
    } catch (parseError) {
      console.error('Email parsing validation failed:', parseError);
      throw new Error('Unable to parse email content. Please check the email format and try again.');
    }

    // Extract additional metadata if requested
    let extractedMetadata;
    if (options.extractMetadata) {
      extractedMetadata = this.extractEmailMetadata(emailContent, emailSubject);
    }

    const result: ParsedEmailTasks = {
      ...parsedTasks,
      extractedMetadata,
    };

    console.log(`Parsed email: ${parsedTasks.tasks.length} tasks extracted, ${aiResponse.usage.totalTokens} tokens`);

    return {
      tasks: result,
      usage: {
        tokensUsed: aiResponse.usage.totalTokens,
        estimatedCost: aiResponse.usage.estimatedCost,
        model: options.model,
        cached: false, // TODO: Detect cache hits
      },
    };
  }

  /**
   * Enhance email context based on email type.
   */
  private enhanceEmailContext(
    emailType: string,
    context: EmailGenerationRequest['context']
  ): EmailGenerationRequest['context'] & { details: Record<string, any> } {
    const enhanced = { ...context };

    // Add type-specific context details
    switch (emailType) {
      case 'booking_confirmation':
        enhanced.details = {
          confirmationNumber: `RC${Date.now().toString().slice(-6)}`,
          sessionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(), // Next week
          sessionTime: '3:30 PM - 4:30 PM',
          location: '123 Activity Street, Brooklyn, NY',
          instructorName: 'Ms. Johnson',
          whatToBring: ['Water bottle', 'Comfortable clothes', 'Positive attitude'],
          ...context.details,
        };
        break;

      case 'schedule_change':
        enhanced.details = {
          originalDate: new Date().toLocaleDateString(),
          newDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(), // 3 days later
          reason: 'Instructor availability change',
          alternativeOptions: ['Reschedule to next week', 'Switch to different time slot'],
          ...context.details,
        };
        break;

      case 'payment_reminder':
        enhanced.details = {
          amountDue: '$85.00',
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString(), // 5 days from now
          paymentMethods: ['Credit card', 'Bank transfer', 'PayPal'],
          lateFeePolicy: '$15 after due date',
          ...context.details,
        };
        break;

      case 'program_info':
        enhanced.details = {
          programDuration: '6 weeks',
          nextSession: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString(),
          specialRequirements: 'Please arrive 10 minutes early',
          contactInfo: 'Call (555) 123-4567 with questions',
          ...context.details,
        };
        break;
    }

    return enhanced;
  }

  /**
   * Infer email priority based on type.
   */
  private inferPriority(emailType: string): 'low' | 'medium' | 'high' {
    switch (emailType) {
      case 'payment_reminder': return 'high';
      case 'schedule_change': return 'medium';
      case 'booking_confirmation': return 'medium';
      case 'program_info': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Infer expected response based on email type.
   */
  private inferExpectedResponse(emailType: string): 'none' | 'acknowledgment' | 'action_required' {
    switch (emailType) {
      case 'payment_reminder': return 'action_required';
      case 'schedule_change': return 'acknowledgment';
      case 'booking_confirmation': return 'acknowledgment';
      case 'program_info': return 'none';
      default: return 'acknowledgment';
    }
  }

  /**
   * Count words in text content.
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).length;
  }

  /**
   * Convert plain text email to HTML format.
   */
  private convertToHtml(body: string, subject: string, providerName: string): string {
    // Simple HTML conversion with basic styling
    const paragraphs = body.split('\n\n').map(p => p.trim()).filter(p => p.length > 0);
    
    const htmlBody = paragraphs
      .map(paragraph => {
        // Handle different content types
        if (paragraph.startsWith('Dear ') || paragraph.startsWith('Hi ')) {
          return `<p style="margin-bottom: 16px; font-weight: 500;">${paragraph}</p>`;
        }
        if (paragraph.includes('Best regards') || paragraph.includes('Sincerely')) {
          return `<p style="margin-top: 20px; margin-bottom: 8px;">${paragraph}</p>`;
        }
        if (paragraph.includes(providerName) && paragraph.length < 100) {
          return `<p style="margin-bottom: 16px; font-weight: 500; color: #2563eb;">${paragraph}</p>`;
        }
        return `<p style="margin-bottom: 12px; line-height: 1.6;">${paragraph}</p>`;
      })
      .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">${subject}</h1>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #6b7280;">From: ${providerName}</p>
    </div>
    <div style="background-color: white; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb;">
        ${htmlBody}
    </div>
    <div style="margin-top: 20px; padding: 16px; background-color: #f3f4f6; border-radius: 6px; font-size: 12px; color: #6b7280;">
        <p style="margin: 0;">This email was generated for demonstration purposes by the Recess AI system.</p>
    </div>
</body>
</html>`.trim();
  }

  /**
   * Extract structured metadata from email content.
   */
  private extractEmailMetadata(emailContent: string, emailSubject?: string): {
    dates: string[];
    amounts: Array<{ value: number; currency: string; context: string }>;
    contacts: Array<{ name?: string; email?: string; phone?: string; role?: string }>;
    locations: string[];
    links: string[];
  } {
    const metadata = {
      dates: [] as string[],
      amounts: [] as Array<{ value: number; currency: string; context: string }>,
      contacts: [] as Array<{ name?: string; email?: string; phone?: string; role?: string }>,
      locations: [] as string[],
      links: [] as string[],
    };

    const fullText = `${emailSubject || ''} ${emailContent}`;

    // Extract dates (simple patterns)
    const datePatterns = [
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, // MM/DD/YYYY
      /\b\d{1,2}-\d{1,2}-\d{4}\b/g,   // MM-DD-YYYY
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g, // Month DD, YYYY
    ];

    datePatterns.forEach(pattern => {
      const matches = fullText.match(pattern);
      if (matches) {
        metadata.dates.push(...matches);
      }
    });

    // Extract monetary amounts
    const amountPattern = /\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g;
    let amountMatch;
    while ((amountMatch = amountPattern.exec(fullText)) !== null) {
      const value = parseFloat(amountMatch[1].replace(/,/g, ''));
      const context = fullText.slice(Math.max(0, amountMatch.index - 20), amountMatch.index + 20);
      metadata.amounts.push({
        value,
        currency: 'USD',
        context: context.trim(),
      });
    }

    // Extract email addresses
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailMatches = fullText.match(emailPattern);
    if (emailMatches) {
      emailMatches.forEach(email => {
        metadata.contacts.push({ email });
      });
    }

    // Extract phone numbers (US format)
    const phonePattern = /\b(?:\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})\b/g;
    const phoneMatches = fullText.match(phonePattern);
    if (phoneMatches) {
      phoneMatches.forEach(phone => {
        metadata.contacts.push({ phone });
      });
    }

    // Extract URLs
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    const urlMatches = fullText.match(urlPattern);
    if (urlMatches) {
      metadata.links.push(...urlMatches);
    }

    // Extract location-like patterns (addresses, cities)
    const locationPatterns = [
      /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/g,
      /\b[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}\b/g, // City, STATE ZIP
    ];

    locationPatterns.forEach(pattern => {
      const matches = fullText.match(pattern);
      if (matches) {
        metadata.locations.push(...matches);
      }
    });

    // Remove duplicates
    metadata.dates = [...new Set(metadata.dates)];
    metadata.locations = [...new Set(metadata.locations)];
    metadata.links = [...new Set(metadata.links)];

    return metadata;
  }

  /**
   * Generate multiple email variations for testing.
   */
  async generateEmailVariations(
    baseRequest: EmailGenerationRequest,
    variations: { tone?: string; details?: Record<string, any> }[],
  ): Promise<Array<{ variation: any; email: GeneratedEmail; usage: any }>> {
    const results = [];

    for (const variation of variations) {
      const modifiedRequest = {
        ...baseRequest,
        options: {
          ...baseRequest.options,
          tone: variation.tone as any || baseRequest.options?.tone,
        },
        context: {
          ...baseRequest.context,
          details: {
            ...baseRequest.context.details,
            ...variation.details,
          },
        },
      };

      try {
        const result = await this.generateEmail(modifiedRequest);
        results.push({
          variation,
          email: result.email,
          usage: result.usage,
        });
      } catch (error) {
        console.warn('Failed to generate email variation:', variation, error);
      }
    }

    return results;
  }

  /**
   * Batch process multiple emails for task extraction.
   */
  async parseMultipleEmails(
    requests: EmailParsingRequest[]
  ): Promise<Array<{ request: EmailParsingRequest; tasks?: ParsedEmailTasks; error?: string; usage?: any }>> {
    const results = [];

    for (const request of requests) {
      try {
        const result = await this.parseEmailTasks(request);
        results.push({
          request,
          tasks: result.tasks,
          usage: result.usage,
        });
      } catch (error) {
        results.push({
          request,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get processing statistics and usage metrics.
   */
  getUsageStats(): {
    totalTokens: number;
    totalCost: number;
    emailsGenerated: number;
    emailsParsed: number;
  } {
    // In a production system, this would track actual usage
    return {
      totalTokens: 0,
      totalCost: 0,
      emailsGenerated: 0,
      emailsParsed: 0,
    };
  }
}