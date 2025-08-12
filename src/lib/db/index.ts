/**
 * Database module exports for the unified webapp.
 *
 * WHY: Centralized database exports provide:
 * - Single import point for all database-related functionality
 * - Consistent interface across the application
 * - Easy refactoring if database implementation changes
 *
 * USAGE:
 * import { db } from '@/lib/db';
 * const users = await db.select().from(userTable);
 */

export { db, pool } from './client';

// Re-export all schema tables
export * from './schema';
