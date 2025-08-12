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
 * 
 * NOTE: Junction tables need to be created for many-to-many relationships
 */
// TODO: Define junction tables and uncomment when ready
// export const tagRelations = relations(tagTable, ({ many }) => ({
//   providers: many(providerTagTable),
//   children: many(childTagTable),
// }));

// Type exports
export type Tag = typeof tagTable.$inferSelect;
export type NewTag = typeof tagTable.$inferInsert;
