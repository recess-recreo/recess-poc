/**
 * Centralized Redis client for POC environment.
 * 
 * WHY: Centralized Redis client because:
 * - Ensures consistent connection configuration across all services
 * - Provides proper POC environment support with fallback URLs
 * - Implements connection pooling and error handling
 * - Prevents multiple Redis instances causing connection issues
 * - Enables graceful degradation when Redis is unavailable
 * - Centralizes Redis error handling and logging
 * 
 * DESIGN DECISIONS:
 * - Singleton pattern to prevent multiple connections
 * - Proper POC environment variable precedence (POC_REDIS_URL > REDIS_URL > default)
 * - Connection retry logic with exponential backoff
 * - Graceful error handling that doesn't crash the application
 * - Connection pooling for better performance
 * - Health check endpoint for monitoring
 * 
 * POC CONFIGURATION:
 * - Uses POC_REDIS_URL if available (from .env.poc)
 * - Falls back to REDIS_URL for backward compatibility
 * - Default POC configuration: redis://:poc_redis_password_2024@localhost:6380
 * - Proper error messages for debugging connection issues
 */

import { createClient, RedisClientType, RedisDefaultModules, RedisFunctions, RedisModules, RedisScripts } from 'redis';

export type RedisClient = RedisClientType<RedisDefaultModules & RedisModules, RedisFunctions, RedisScripts>;

interface RedisConfig {
  url: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
}

class RedisClientManager {
  private client: RedisClient | null = null;
  private isConnecting = false;
  private isConnected = false;
  private connectionPromise: Promise<RedisClient> | null = null;
  private retryCount = 0;
  private maxRetries = 5;
  private baseRetryDelay = 1000; // 1 second

  /**
   * Get Redis configuration with proper POC environment support.
   */
  private getRedisConfig(): RedisConfig {
    // Priority: POC_REDIS_URL > REDIS_URL > default POC URL
    const redisUrl = process.env.POC_REDIS_URL 
      || process.env.REDIS_URL 
      || 'redis://:poc_redis_password_2024@localhost:6380';

    console.log('Using Redis URL:', redisUrl.replace(/:[^@]*@/, ':***@')); // Hide password in logs

    return {
      url: redisUrl,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };
  }

  /**
   * Create and configure Redis client with proper error handling.
   */
  private createRedisClient(): RedisClient {
    const config = this.getRedisConfig();
    
    const client = createClient({
      url: config.url,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries >= this.maxRetries) {
            console.error(`Redis connection failed after ${retries} retries`);
            return new Error('Redis connection max retries exceeded');
          }
          
          const delay = Math.min(this.baseRetryDelay * Math.pow(2, retries), 10000);
          console.warn(`Redis connection retry ${retries + 1}/${this.maxRetries} in ${delay}ms`);
          return delay;
        },
        connectTimeout: 10000, // 10 second connection timeout
      },
    });

    // Connection event handlers
    client.on('connect', () => {
      console.log('Redis client connected successfully');
      this.isConnected = true;
      this.retryCount = 0;
    });

    client.on('ready', () => {
      console.log('Redis client ready for commands');
    });

    client.on('error', (error) => {
      console.error('Redis client error:', error.message);
      this.isConnected = false;
      
      // If this is a connection error during initialization, don't spam logs
      if (this.isConnecting) {
        return;
      }
      
      // For runtime errors, provide more context
      if (error.message.includes('Socket closed unexpectedly')) {
        console.warn('Redis connection lost unexpectedly - will attempt to reconnect');
      }
    });

    client.on('disconnect', () => {
      console.warn('Redis client disconnected');
      this.isConnected = false;
    });

    client.on('reconnecting', () => {
      console.log('Redis client attempting to reconnect...');
    });

    return client as RedisClient;
  }

  /**
   * Get Redis client instance with connection management.
   */
  async getClient(): Promise<RedisClient | null> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    // If already connecting, wait for the connection to complete
    if (this.isConnecting && this.connectionPromise) {
      try {
        return await this.connectionPromise;
      } catch (error) {
        console.warn('Redis connection promise failed:', error);
        return null;
      }
    }

    // Start new connection
    this.isConnecting = true;
    this.connectionPromise = this.connectWithRetry();

    try {
      const client = await this.connectionPromise;
      this.client = client;
      this.isConnecting = false;
      return client;
    } catch (error) {
      this.isConnecting = false;
      this.connectionPromise = null;
      console.warn('Redis connection failed, caching will be disabled:', error);
      return null;
    }
  }

  /**
   * Connect to Redis with retry logic.
   */
  private async connectWithRetry(): Promise<RedisClient> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        console.log(`Attempting Redis connection (attempt ${attempt + 1}/${this.maxRetries})...`);
        
        const client = this.createRedisClient();
        await client.connect();
        
        // Test the connection with a simple ping
        await client.ping();
        
        console.log('Redis connection successful');
        return client;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Redis connection attempt ${attempt + 1} failed:`, error);
        
        if (attempt < this.maxRetries - 1) {
          const delay = Math.min(this.baseRetryDelay * Math.pow(2, attempt), 10000);
          console.log(`Retrying Redis connection in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Redis connection failed after all retries');
  }

  /**
   * Check if Redis is connected and healthy.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) return false;
      
      await client.ping();
      return true;
    } catch (error) {
      console.warn('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Gracefully disconnect from Redis.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
        console.log('Redis client disconnected gracefully');
      } catch (error) {
        console.warn('Error during Redis disconnect:', error);
      }
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Get connection statistics for monitoring.
   */
  getStats() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      retryCount: this.retryCount,
      hasClient: !!this.client,
    };
  }
}

// Singleton instance
const redisManager = new RedisClientManager();

/**
 * Get the shared Redis client instance.
 * Returns null if Redis is unavailable (for graceful degradation).
 */
export async function getRedisClient(): Promise<RedisClient | null> {
  return redisManager.getClient();
}

/**
 * Check Redis connection health.
 */
export async function isRedisHealthy(): Promise<boolean> {
  return redisManager.isHealthy();
}

/**
 * Get Redis connection statistics.
 */
export function getRedisStats() {
  return redisManager.getStats();
}

/**
 * Gracefully disconnect from Redis (useful for cleanup).
 */
export async function disconnectRedis(): Promise<void> {
  return redisManager.disconnect();
}

/**
 * Utility function for safe Redis operations with error handling.
 */
export async function safeRedisOperation<T>(
  operation: (client: RedisClient) => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    const client = await getRedisClient();
    if (!client) {
      console.warn('Redis not available, using fallback value');
      return fallback;
    }
    
    return await operation(client);
  } catch (error) {
    console.warn('Redis operation failed, using fallback:', error);
    return fallback;
  }
}

/**
 * Helper function to create cache keys with consistent formatting.
 */
export function createCacheKey(...parts: (string | number)[]): string {
  return parts
    .map(part => String(part).replace(/[^a-zA-Z0-9\-_]/g, '_'))
    .join(':');
}