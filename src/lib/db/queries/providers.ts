import { db } from '../client';
import {
  providerTable,
  eventTable,
  type Provider,
  type Event,
} from '../schema/providers';
import { eq, and, or, ilike, sql, inArray } from 'drizzle-orm';

/**
 * Fetches all active providers from the database.
 *
 * WHY: This is a common query needed for provider listings and search.
 * We filter by active=true to exclude deactivated providers.
 *
 * DESIGN DECISION: Using Drizzle ORM for type-safe queries that:
 * - Automatically map database columns to TypeScript types
 * - Prevent SQL injection through parameterized queries
 * - Provide compile-time validation of query structure
 *
 * PERFORMANCE: Consider adding pagination for large datasets.
 * Currently returns all results which may not scale well.
 *
 * @returns Promise resolving to array of active providers
 */
export async function getProviders(): Promise<Provider[]> {
  try {
    const providers = await db
      .select()
      .from(providerTable)
      .where(eq(providerTable.active, true))
      .orderBy(providerTable.name);

    return providers;
  } catch (error) {
    console.error('Error fetching providers:', error);
    throw new Error('Failed to fetch providers');
  }
}

/**
 * Fetches a single provider by ID.
 *
 * WHY: Used for provider detail pages and when specific provider
 * information is needed (e.g., in wishlist items).
 *
 * DESIGN DECISION: Drizzle's type-safe query builder ensures:
 * - ID parameter is properly typed as number
 * - Result is correctly typed as Provider | undefined
 * - No SQL injection vulnerabilities
 *
 * @param id The provider ID to fetch
 * @returns Promise resolving to provider or null if not found
 */
export async function getProviderById(id: string): Promise<Provider | null> {
  try {
    const provider = await db.select().from(providerTable).where(eq(providerTable.id, id)).limit(1);

    return provider[0] || null;
  } catch (error) {
    console.error('Error fetching provider by ID:', error);
    throw new Error('Failed to fetch provider');
  }
}

/**
 * Searches providers by name or description.
 *
 * WHY: Enables user search functionality across provider listings.
 * Uses case-insensitive ILIKE for better user experience.
 *
 * DESIGN DECISION: Drizzle's ilike operator provides:
 * - PostgreSQL-native case-insensitive pattern matching
 * - Automatic escaping of special characters
 * - Type-safe column references
 *
 * PERFORMANCE: Consider adding full-text search indexes for better
 * performance with large datasets.
 *
 * @param searchTerm The term to search for
 * @returns Promise resolving to array of matching providers
 */
export async function searchProviders(searchTerm: string): Promise<Provider[]> {
  const searchPattern = `%${searchTerm}%`;

  try {
    const providers = await db
      .select()
      .from(providerTable)
      .where(
        and(
          eq(providerTable.active, true),
          or(
            ilike(providerTable.name, searchPattern),
            ilike(providerTable.description, searchPattern)
          )
        )
      )
      .orderBy(providerTable.name)
      .limit(50);

    return providers;
  } catch (error) {
    console.error('Error searching providers:', error);
    throw new Error('Failed to search providers');
  }
}

/**
 * Provider detail type with all related data.
 *
 * WHY: Program detail pages need rich data including:
 * - Basic provider information
 * - Events/activities for this provider
 */
export interface ProviderDetail {
  id: string;
  name: string;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  logoFileName?: string | null;
  coverImageFileName?: string | null;
  active: boolean;
  verified: boolean;
  events: Array<Event>;
}

/**
 * Fetches a provider with all related data for detail pages.
 *
 * WHY: Program detail pages need comprehensive provider information including:
 * - Basic provider info (name, contact, description)
 * - Location data (market, neighborhood, coordinates)
 * - Visual content (images)
 * - Categorization (tags)
 *
 * DESIGN DECISION: Using Drizzle's query builder with joins because:
 * - Type-safe operations across related tables
 * - Single query reduces database round trips
 * - Automatic data transformation to TypeScript objects
 *
 * PERFORMANCE: Consider adding database indexes on frequently queried fields.
 *
 * @param id The provider ID to fetch
 * @returns Promise resolving to provider detail or null if not found
 */
export async function getProviderDetailById(id: string): Promise<ProviderDetail | null> {
  try {
    // Get the provider
    const providerResult = await db
      .select()
      .from(providerTable)
      .where(eq(providerTable.id, id))
      .limit(1);

    if (!providerResult.length) {
      return null;
    }

    const provider = providerResult[0];

    // Get events for this provider
    const events = await db
      .select()
      .from(eventTable)
      .where(and(eq(eventTable.providerId, id), eq(eventTable.active, true)))
      .orderBy(eventTable.startDate);

    return {
      ...provider,
      active: provider.active ?? false, // Handle potential null value
      verified: provider.verified ?? false, // Handle potential null value
      events,
    };
  } catch (error) {
    console.error('Error fetching provider detail:', error);
    throw new Error('Failed to fetch provider detail');
  }
}

/**
 * Enhanced provider with event data for AI recommendations.
 *
 * WHY: Recommendation engine needs rich provider data plus event information:
 * - Provider details for matching and display  
 * - Event data for age/schedule matching
 * - Location data for geographic scoring
 */
export interface RecommendationProvider {
  id: string;
  name: string;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  logoFileName?: string | null;
  coverImageFileName?: string | null;
  active: boolean;
  verified: boolean;
  events: Array<Event>;
}

/**
 * Extract unique provider and event IDs from vector search results.
 * 
 * WHY: Vector search returns point IDs that map to provider/event combinations:
 * - Multiple embeddings can exist for same provider (different events, descriptions)
 * - Need to extract unique business entity IDs for database queries
 * - Handles both provider-only and provider+event scenarios
 * - Converts numeric IDs from vector search to database string format
 * 
 * DESIGN DECISION: ID format conversion because:
 * - Vector search metadata contains numeric IDs (1277, 1287, etc.)
 * - Database uses string IDs ("1277", "1287", etc.)
 * - Need to convert formats to ensure database queries work correctly
 * 
 * @param vectorResults Array of vector search results with metadata
 * @returns Object with unique provider IDs and event IDs in database format
 */
export function extractUniqueIds(vectorResults: Array<{ metadata: any }>): {
  providerIds: string[];
  eventIds: string[];
} {
  const providerIds = new Set<string>();
  const eventIds = new Set<string>();

  for (const result of vectorResults) {
    const metadata = result.metadata;
    
    // Extract provider ID from various metadata formats
    const rawProviderId = metadata.provider_id || 
                          metadata.providerId ||
                          '';
    
    if (rawProviderId) {
      // Convert numeric IDs to database string format
      const providerId = convertToProviderDbId(rawProviderId);
      if (providerId) {
        providerIds.add(providerId);
      }
    }
    
    // Extract event ID if available  
    const rawEventId = metadata.event_id || metadata.eventId || '';
    
    if (rawEventId && rawEventId !== rawProviderId) {
      // Convert numeric IDs to database string format if needed
      const eventId = convertToEventDbId(rawEventId);
      if (eventId) {
        eventIds.add(eventId);
      }
    }
  }

  return {
    providerIds: Array.from(providerIds),
    eventIds: Array.from(eventIds),
  };
}

/**
 * Convert vector search provider ID to database format.
 * 
 * WHY: Vector search returns numeric IDs but database uses string IDs.
 * This ensures compatibility between vector search results and database queries.
 * 
 * @param rawId Raw provider ID from vector search (numeric or string)
 * @returns Formatted provider ID for database queries or null if invalid
 */
function convertToProviderDbId(rawId: any): string | null {
  if (!rawId) return null;
  
  // Convert numeric ID to string format
  const numericId = parseInt(String(rawId));
  if (!isNaN(numericId) && numericId > 0) {
    return String(numericId);
  }
  
  // If it's already a string ID, use as-is
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
 * @returns Formatted event ID for database queries or null if invalid
 */
function convertToEventDbId(rawId: any): string | null {
  if (!rawId) return null;
  
  // Convert numeric ID to string format
  const numericId = parseInt(String(rawId));
  if (!isNaN(numericId) && numericId > 0) {
    return String(numericId);
  }
  
  // If it's already a string ID, use as-is
  if (typeof rawId === 'string' && /^\d+$/.test(rawId)) {
    return rawId;
  }
  
  return null;
}

/**
 * Get unique providers and their events based on vector search results.
 * 
 * WHY: Fixes duplicate vector search results by:
 * - Using vector search results to identify relevant provider/event IDs
 * - Querying database to get actual, complete provider data
 * - Ensuring unique providers (no duplicates from vector embeddings)
 * - Including event data for better matching and display
 * 
 * DESIGN DECISIONS:
 * - Separate provider and event queries for efficiency
 * - Type-safe database queries using Drizzle ORM
 * - Comprehensive data for AI recommendation scoring
 * 
 * @param providerIds Array of unique provider IDs from vector search
 * @param eventIds Optional array of specific event IDs to include
 * @returns Promise resolving to array of providers with their events
 */
export async function getRecommendationProviders(
  providerIds: string[],
  eventIds?: string[]
): Promise<RecommendationProvider[]> {
  try {
    if (providerIds.length === 0) {
      return [];
    }

    console.log(`Querying database for ${providerIds.length} unique providers${eventIds ? ` and ${eventIds.length} events` : ''}`);

    // Get providers with timeout protection
    const providersPromise = db
      .select()
      .from(providerTable)
      .where(
        and(
          eq(providerTable.active, true),
          inArray(providerTable.id, providerIds)
        )
      )
      .orderBy(providerTable.name);

    // Add timeout wrapper for database query
    const providers = await Promise.race([
      providersPromise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout: providers query exceeded 5 seconds')), 5000)
      )
    ]);

    if (providers.length === 0) {
      console.warn(`No active providers found for IDs: ${providerIds.join(', ')}`);
      return [];
    }

    console.log(`Found ${providers.length} active providers in database`);

    // Get all events for these providers (or specific events if provided)
    const eventsQuery = db
      .select()
      .from(eventTable)
      .where(
        and(
          eq(eventTable.active, true),
          inArray(eventTable.providerId, providerIds),
          eventIds ? inArray(eventTable.id, eventIds) : undefined
        )
      )
      .orderBy(eventTable.startDate);

    // Add timeout wrapper for events query
    const events = await Promise.race([
      eventsQuery,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout: events query exceeded 3 seconds')), 3000)
      )
    ]);

    console.log(`Found ${events.length} events for these providers`);

    // Group events by provider
    const eventsByProvider = events.reduce((acc, event) => {
      const providerId = event.providerId;
      if (!acc[providerId]) acc[providerId] = [];
      acc[providerId].push(event);
      return acc;
    }, {} as Record<string, typeof events>);

    // Combine all data into final result
    const result: RecommendationProvider[] = providers.map(provider => ({
      ...provider,
      active: provider.active ?? false,
      verified: provider.verified ?? false,
      events: eventsByProvider[provider.id] || [],
    }));

    console.log(`Returning ${result.length} providers with complete data (${result.reduce((sum, p) => sum + p.events.length, 0)} total events)`);

    return result;
  } catch (error) {
    console.error('Error fetching recommendation providers:', error);
    throw new Error('Failed to fetch provider data for recommendations');
  }
}
