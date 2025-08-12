import { db } from '../client';
import {
  providerTable,
  providerImageTable,
  providerTagTable,
  type Provider,
} from '../schema/providers';
import { marketTable, neighborhoodTable } from '../schema/markets';
import { tagTable } from '../schema/tags';
import { eq, and, or, ilike, sql } from 'drizzle-orm';

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
      .orderBy(providerTable.companyName);

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
export async function getProviderById(id: number): Promise<Provider | null> {
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
            ilike(providerTable.companyName, searchPattern),
            ilike(providerTable.description, searchPattern)
          )
        )
      )
      .orderBy(providerTable.companyName)
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
 * - Market and neighborhood information for location context
 * - Images for visual presentation
 * - Tags for categorization and filtering display
 */
export interface ProviderDetail {
  id: number;
  companyName: string;
  streetLine1?: string | null;
  streetLine2?: string | null;
  municipality?: string | null;
  administrativeArea?: string | null;
  subAdministrativeArea?: string | null;
  postalCode?: string | null;
  country: string;
  latitude?: string | null;
  longitude?: string | null;
  placeId?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  price?: string | null;
  market: {
    id: number;
    name: string;
    municipality: string;
    administrativeArea: string;
    country: string;
  };
  neighborhood?: {
    id: number;
    name: string;
  } | null;
  images: Array<{
    id: number;
    url: string;
    alt?: string | null;
  }>;
  tags: Array<{
    id: number;
    type: string;
    label: string;
  }>;
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
export async function getProviderDetailById(id: number): Promise<ProviderDetail | null> {
  try {
    // First get the provider with market and neighborhood
    const providerResult = await db
      .select({
        id: providerTable.id,
        companyName: providerTable.companyName,
        streetLine1: providerTable.streetLine1,
        streetLine2: providerTable.streetLine2,
        municipality: providerTable.municipality,
        administrativeArea: providerTable.administrativeArea,
        subAdministrativeArea: providerTable.subAdministrativeArea,
        postalCode: providerTable.postalCode,
        country: providerTable.country,
        latitude: providerTable.latitude,
        longitude: providerTable.longitude,
        placeId: providerTable.placeId,
        website: providerTable.website,
        phone: providerTable.phone,
        email: providerTable.email,
        description: providerTable.description,
        price: providerTable.price,
        market: {
          id: marketTable.id,
          name: marketTable.name,
          municipality: marketTable.municipality,
          administrativeArea: marketTable.administrativeArea,
          country: marketTable.country,
        },
        neighborhood: {
          id: neighborhoodTable.id,
          name: neighborhoodTable.name,
        },
      })
      .from(providerTable)
      .innerJoin(marketTable, eq(providerTable.marketId, marketTable.id))
      .leftJoin(neighborhoodTable, eq(providerTable.neighborhoodId, neighborhoodTable.id))
      .where(eq(providerTable.id, id))
      .limit(1);

    if (!providerResult.length) {
      return null;
    }

    const provider = providerResult[0];

    // Get images
    const images = await db
      .select({
        id: providerImageTable.id,
        url: providerImageTable.url,
        alt: providerImageTable.alt,
      })
      .from(providerImageTable)
      .where(eq(providerImageTable.providerId, id));

    // Get tags
    const tags = await db
      .select({
        id: tagTable.id,
        type: tagTable.type,
        label: tagTable.label,
      })
      .from(tagTable)
      .innerJoin(providerTagTable, eq(tagTable.id, providerTagTable.tagId))
      .where(eq(providerTagTable.providerId, id));

    return {
      ...provider,
      neighborhood: provider.neighborhood?.id ? provider.neighborhood : null,
      images,
      tags,
    };
  } catch (error) {
    console.error('Error fetching provider detail:', error);
    throw new Error('Failed to fetch provider detail');
  }
}
