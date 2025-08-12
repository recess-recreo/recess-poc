/**
 * TypeScript types for the embedding generation system.
 *
 * WHY: These types provide type safety and clarity for the embedding system:
 * - Defines structures for OpenAI API interactions
 * - Ensures consistent data format for Qdrant storage
 * - Provides type safety for metadata filtering
 *
 * DESIGN DECISIONS:
 * - Separate provider and camp types: Different data structures and use cases
 * - Metadata includes searchable fields: Enables efficient filtering in Qdrant
 * - Cost tracking built-in: Essential for budget monitoring
 * - Status tracking: Enables resumable embedding generation
 */

export interface OpenAIEmbeddingRequest {
  input: string;
  model: 'text-embedding-3-small';
  dimensions?: number; // Optional, defaults to 1536 for text-embedding-3-small
}

export interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface ProviderEmbeddingData {
  id: number;
  type: 'provider';
  text: string; // Combined text representation for embedding
  embedding: number[];
  metadata: {
    provider_id: number;
    company_name: string;
    market_id: number;
    neighborhood_id?: number;
    active: boolean;
    location: {
      municipality?: string;
      administrative_area?: string;
      postal_code?: string;
      latitude?: string;
      longitude?: string;
    };
    contact: {
      website?: string;
      phone?: string;
      email?: string;
    };
    business: {
      primary_naics?: string;
      instant_booking?: boolean;
      not_a_fit?: boolean;
    };
    pricing?: string;
    created_at: string;
    updated_at: string;
  };
}

export interface CampEmbeddingData {
  id: number;
  type: 'camp';
  text: string; // Combined text representation for embedding
  embedding: number[];
  metadata: {
    camp_id: number;
    provider_id: number;
    title: string;
    date?: string;
    date_range?: string;
    location?: string;
    price?: string;
    grades?: string;
    status?: string;
    spots_left?: string;
    spots_total?: string;
    scraper_name?: string;
    created_at: string;
  };
}

export interface SessionEmbeddingData {
  id: number;
  type: 'session';
  text: string; // Combined text representation for embedding
  embedding: number[];
  metadata: {
    session_id: number;
    provider_id: number;
    provider_name: string;
    title: string;
    description?: string;
    location?: string;
    provider_location?: string;
    grades?: string;
    time?: string;
    date_range?: string;
    price?: string;
    spots_left?: string;
    spots_total?: string;
    status?: string;
    metadata?: string;
    created_at: string;
  };
}

export type EmbeddingData = ProviderEmbeddingData | CampEmbeddingData | SessionEmbeddingData;

export interface QdrantPoint {
  id: number;
  vector: number[];
  payload: Record<string, any>;
}

export interface EmbeddingGenerationStats {
  total_items: number;
  providers_processed: number;
  camps_processed: number;
  sessions_processed: number;
  total_tokens: number;
  estimated_cost: number; // in USD
  actual_cost: number; // in USD
  failed_items: number;
  start_time: Date;
  end_time?: Date;
  duration_seconds?: number;
}

export interface EmbeddingGenerationConfig {
  batch_size: number;
  max_retries: number;
  retry_delay_ms: number;
  openai_model: 'text-embedding-3-small';
  qdrant_collection: string;
  cost_per_1k_tokens: number; // Current pricing for text-embedding-3-small
}

export interface EmbeddingCacheEntry {
  provider_id?: number;
  camp_id?: number;
  session_id?: number;
  text_hash: string; // SHA-256 hash of the text content
  embedding: number[];
  created_at: Date;
}

export interface ProviderWithRelations {
  id: number;
  marketId: number;
  neighborhoodId?: number;
  active: boolean;
  companyName: string;
  streetLine1?: string;
  streetLine2?: string;
  municipality?: string;
  administrativeArea?: string;
  subAdministrativeArea?: string;
  postalCode?: string;
  country: string;
  latitude?: string;
  longitude?: string;
  placeId?: string;
  website?: string;
  phone?: string;
  email?: string;
  description?: string;
  blurb?: string;
  price?: string;
  primaryNaics?: string;
  notAFit?: boolean;
  notAFitReason?: string;
  createdAt: Date;
  updatedAt: Date;
  summerCampRegistrationDate?: Date;
  metadata?: string;
  instantBooking?: boolean;
  camps?: Array<{
    id: number;
    title: string;
    description?: string;
    date?: Date;
    dateRange?: string;
    time?: string;
    location?: string;
    price?: string;
    grades?: string;
    status?: string;
    spotsLeft?: string;
    spotsTotal?: string;
  }>;
}

export interface EmbeddingError {
  item_id: number;
  item_type: 'provider' | 'camp' | 'session';
  error_message: string;
  timestamp: Date;
  retry_count: number;
}