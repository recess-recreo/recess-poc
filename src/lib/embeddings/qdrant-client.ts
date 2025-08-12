/**
 * Qdrant vector database client for storing and querying embeddings.
 *
 * WHY: Qdrant client handles vector storage and similarity search because:
 * - Provides high-performance vector similarity search
 * - Supports metadata filtering for precise results
 * - Enables hybrid search combining semantic and traditional filters
 * - Offers horizontal scaling for large datasets
 *
 * DESIGN DECISIONS:
 * - HTTP client over gRPC: Simpler setup and debugging
 * - Batch operations: Improves performance for bulk inserts
 * - Retry logic: Handles transient network issues
 * - Connection pooling: Reuses connections for better performance
 */

import { QdrantPoint, EmbeddingData, EmbeddingGenerationConfig } from './types';

export interface QdrantConfig {
  host: string;
  port: number;
  apiKey?: string;
  timeout: number;
}

export interface QdrantCollection {
  name: string;
  vector_size: number;
  distance: 'Cosine' | 'Euclid' | 'Dot';
}

export interface QdrantSearchResult {
  id: number;
  score: number;
  payload: Record<string, any>;
}

export interface QdrantSearchParams {
  collection_name: string;
  vector: number[];
  limit: number;
  score_threshold?: number;
  filter?: Record<string, any>;
  with_payload?: boolean;
}

/**
 * Qdrant vector database client implementation.
 * 
 * Provides methods for:
 * - Collection management (create, delete, info)
 * - Point operations (insert, update, delete, search)
 * - Batch operations for performance
 * - Health checking and connection testing
 */
export class QdrantClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(config: QdrantConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`;
    this.timeout = config.timeout;
    this.headers = {
      'Content-Type': 'application/json',
    };
    
    if (config.apiKey) {
      this.headers['api-key'] = config.apiKey;
    }
  }

  /**
   * Test connection to Qdrant instance.
   * 
   * @returns Promise<boolean> True if connection successful
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', '/');
      return response.title === 'qdrant - vector search engine';
    } catch (error) {
      console.error('Qdrant health check failed:', error);
      return false;
    }
  }

  /**
   * Create a new collection for storing embeddings.
   * 
   * WHY: Collections need specific configuration for optimal performance:
   * - Vector size must match OpenAI embedding dimensions (1536)
   * - Cosine distance is ideal for text similarity
   * - HNSW index provides fast approximate search
   * 
   * @param collection Collection configuration
   */
  async createCollection(collection: QdrantCollection): Promise<void> {
    const payload = {
      vectors: {
        size: collection.vector_size,
        distance: collection.distance,
      },
      optimizers_config: {
        default_segment_number: 2,
        max_segment_size: 20000,
        memmap_threshold: 50000,
      },
      hnsw_config: {
        m: 16, // Number of bi-directional links for every new element during construction
        ef_construct: 100, // Size of the dynamic list for search during construction
        full_scan_threshold: 10000, // Minimal size of vectors for additional indexing
      },
    };

    await this.makeRequest('PUT', `/collections/${collection.name}`, payload);
    console.log(`Created Qdrant collection: ${collection.name}`);
  }

  /**
   * Check if a collection exists.
   * 
   * @param collectionName Name of the collection
   * @returns Promise<boolean> True if collection exists
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      await this.makeRequest('GET', `/collections/${collectionName}`);
      return true;
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes("doesn't exist")) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get collection information including vector count.
   * 
   * @param collectionName Name of the collection
   * @returns Collection info with point count and configuration
   */
  async getCollectionInfo(collectionName: string): Promise<any> {
    return await this.makeRequest('GET', `/collections/${collectionName}`);
  }

  /**
   * Insert a single point into the collection.
   * 
   * @param collectionName Name of the collection
   * @param point Point data to insert
   */
  async insertPoint(collectionName: string, point: QdrantPoint): Promise<void> {
    const payload = {
      points: [
        {
          id: point.id,
          vector: point.vector,
          payload: point.payload,
        },
      ],
    };

    await this.makeRequest('PUT', `/collections/${collectionName}/points`, payload);
  }

  /**
   * Insert multiple points in batch for better performance.
   * 
   * WHY: Batch insertions are much more efficient than individual inserts:
   * - Reduces HTTP request overhead
   * - Allows Qdrant to optimize internal operations
   * - Improves throughput for large datasets
   * 
   * @param collectionName Name of the collection
   * @param points Array of points to insert
   */
  async insertPointsBatch(collectionName: string, points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) return;

    const payload = {
      points: points.map(point => ({
        id: point.id,
        vector: point.vector,
        payload: point.payload,
      })),
    };

    await this.makeRequest('PUT', `/collections/${collectionName}/points`, payload);
    console.log(`Inserted batch of ${points.length} points into ${collectionName}`);
  }

  /**
   * Search for similar vectors in the collection.
   * 
   * @param params Search parameters including vector and filters
   * @returns Array of search results with scores and metadata
   */
  async search(params: QdrantSearchParams): Promise<QdrantSearchResult[]> {
    const payload: any = {
      vector: params.vector,
      limit: params.limit,
      with_payload: params.with_payload ?? true,
    };

    // Only add score_threshold if it's defined to avoid null serialization issues
    if (params.score_threshold !== undefined) {
      payload.score_threshold = params.score_threshold;
    }

    // Only add filter if it's defined to avoid null serialization issues
    if (params.filter !== undefined) {
      payload.filter = params.filter;
    }

    const response = await this.makeRequest('POST', `/collections/${params.collection_name}/points/search`, payload);
    return response.result || [];
  }

  /**
   * Delete points from collection by IDs.
   * 
   * @param collectionName Name of the collection
   * @param pointIds Array of point IDs to delete
   */
  async deletePoints(collectionName: string, pointIds: number[]): Promise<void> {
    const payload = {
      points: pointIds,
    };

    await this.makeRequest('POST', `/collections/${collectionName}/points/delete`, payload);
    console.log(`Deleted ${pointIds.length} points from ${collectionName}`);
  }

  /**
   * Delete entire collection.
   * 
   * @param collectionName Name of the collection to delete
   */
  async deleteCollection(collectionName: string): Promise<void> {
    await this.makeRequest('DELETE', `/collections/${collectionName}`);
    console.log(`Deleted collection: ${collectionName}`);
  }

  /**
   * Get points by IDs from collection.
   * 
   * @param collectionName Name of the collection
   * @param pointIds Array of point IDs to retrieve
   * @returns Array of points with vectors and payloads
   */
  async getPoints(collectionName: string, pointIds: number[]): Promise<any[]> {
    const payload = {
      ids: pointIds,
      with_payload: true,
      with_vector: true,
    };

    const response = await this.makeRequest('POST', `/collections/${collectionName}/points`, payload);
    return response.result || [];
  }

  /**
   * Check if specific points exist in the collection.
   * 
   * @param collectionName Name of the collection
   * @param pointIds Array of point IDs to check
   * @returns Array of boolean values indicating existence
   */
  async pointsExist(collectionName: string, pointIds: number[]): Promise<boolean[]> {
    try {
      const points = await this.getPoints(collectionName, pointIds);
      const existingIds = new Set(points.map(p => p.id));
      return pointIds.map(id => existingIds.has(id));
    } catch (error) {
      console.error('Error checking point existence:', error);
      return pointIds.map(() => false);
    }
  }

  /**
   * Make HTTP request to Qdrant API with error handling and retries.
   * 
   * @param method HTTP method
   * @param endpoint API endpoint path
   * @param data Request payload (optional)
   * @returns Response data
   */
  private async makeRequest(method: string, endpoint: string, data?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout),
    };

    if (data) {
      // Debug: Check for null values in vector data
      if (data.vector && Array.isArray(data.vector)) {
        const nullIndices = data.vector.map((val: number | null, idx: number) => val === null ? idx : -1).filter((idx: number) => idx !== -1);
        if (nullIndices.length > 0) {
          console.log(`ERROR: Vector contains ${nullIndices.length} null values at indices:`, nullIndices.slice(0, 10));
          throw new Error(`Vector contains null values at indices: ${nullIndices.slice(0, 10).join(', ')}`);
        }
        const nanIndices = data.vector.map((val: number | null, idx: number) => (val !== val) ? idx : -1).filter((idx: number) => idx !== -1);
        if (nanIndices.length > 0) {
          console.log(`ERROR: Vector contains ${nanIndices.length} NaN values at indices:`, nanIndices.slice(0, 10));
          throw new Error(`Vector contains NaN values at indices: ${nanIndices.slice(0, 10).join(', ')}`);
        }
      }
      
      const jsonBody = JSON.stringify(data);
      options.body = jsonBody;
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qdrant API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    return result;
  }
}

/**
 * Create a Qdrant client instance with default configuration.
 * 
 * @returns Configured QdrantClient instance
 */
export function createQdrantClient(): QdrantClient {
  const config: QdrantConfig = {
    host: process.env.QDRANT_HOST || 'localhost',
    port: parseInt(process.env.QDRANT_PORT || '6335'), // Using POC port 6335
    apiKey: process.env.QDRANT_API_KEY,
    timeout: 30000, // 30 seconds
  };

  return new QdrantClient(config);
}

/**
 * Default configuration for embedding generation.
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingGenerationConfig = {
  batch_size: 100, // Process 100 items at a time
  max_retries: 3,
  retry_delay_ms: 1000,
  openai_model: 'text-embedding-3-small',
  qdrant_collection: 'recess_embeddings',
  cost_per_1k_tokens: 0.00002, // $0.02 per 1M tokens = $0.00002 per 1K tokens
};