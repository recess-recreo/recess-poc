import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * PostgreSQL connection pool for the unified webapp.
 *
 * WHY: We use a connection pool instead of individual connections because:
 * - Pools reuse connections, reducing overhead of creating new connections
 * - Automatically handles connection lifecycle (creation, reuse, termination)
 * - Provides better performance under load with concurrent requests
 *
 * DESIGN DECISION: Using Drizzle ORM with PostgreSQL because:
 * - Provides type-safe database queries with TypeScript integration
 * - Offers a thin abstraction layer while maintaining SQL flexibility
 * - Supports database migrations and schema management
 * - Reduces boilerplate while keeping queries performant
 *
 * CONNECTION STRATEGY: Prioritizes DATABASE_URL if available, falls back to individual variables
 * This ensures compatibility with both deployment platforms and local development
 *
 * @singleton Pool and Drizzle instances are shared across the application
 */
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // Increased from 2s to 10s for vector search operations
        ssl:
          process.env.DATABASE_URL.includes("amazonaws.com") ||
          process.env.NODE_ENV === "production"
            ? {
                rejectUnauthorized: false,
              }
            : undefined,
      }
    : {
        host: process.env.PG_HOST || "localhost",
        port: parseInt(process.env.PG_PORT || "5432"),
        user: process.env.PG_USER || "postgres",
        password: process.env.PG_PASSWORD || "postgres",
        database: process.env.PG_DATABASE || "recess",
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // Increased from 2s to 10s for vector search operations
        ssl:
          process.env.PG_HOST?.includes("amazonaws.com") ||
          process.env.NODE_ENV === "production"
            ? {
                rejectUnauthorized: false,
              }
            : undefined,
      }
);

// Handle pool errors globally to prevent unhandled promise rejections
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
});

// Create Drizzle ORM instance with the pool
export const db = drizzle(pool);

// Export pool for direct access if needed
export { pool };
