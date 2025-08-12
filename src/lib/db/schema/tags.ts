import { pgTable, integer, varchar, serial, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Tag table schema definition.
 *
 * WHY: Tags provide flexible categorization because:
 * - Activities and interests don't fit into rigid categories
 * - Enables multi-faceted search and filtering
 * - Supports both provider services and child interests
 *
 * DESIGN DECISIONS:
 * - Simple structure: Just ID and name for maximum flexibility
 * - Shared across entities: Same tags used for providers and children
 * - Category field: Groups related tags for better organization
 */
export const tagTable = pgTable('tag', {
  id: serial('id').primaryKey(),
  type: varchar('type').notNull(), // programType, interest, ageGroup, other
  label: varchar('label').notNull(), // Display label (frontend uses this)
  description: varchar('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Tag relations definition.
 *
 * WHY: Tags have many-to-many relationships with:
 * - Providers: To categorize services offered
 * - Children: To track interests and preferences
 */
export const tagRelations = relations(tagTable, ({ many }) => ({
  providers: many(providerTagTable),
  children: many(childTagTable),
}));

// Import junction tables
import { providerTagTable } from './providers';
import { childTagTable } from './children';

// Type exports
export type Tag = typeof tagTable.$inferSelect;
export type NewTag = typeof tagTable.$inferInsert;
