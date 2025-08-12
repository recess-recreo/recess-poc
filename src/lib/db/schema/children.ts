import { pgTable, integer, varchar, timestamp, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Child table schema definition.
 *
 * WHY: Child table stores children information because:
 * - Parents need to manage multiple children with different ages/interests
 * - Age-based filtering is crucial for finding appropriate activities
 * - Tags enable personalized recommendations based on interests
 *
 * DESIGN DECISIONS:
 * - Birth year only: Provides enough info for age filtering without storing sensitive full birthdate
 * - Parent ID reference: Links children to their parent/guardian account
 * - Minimal required fields: Only essential info to reduce friction during onboarding
 */
export const childTable = pgTable('child', {
  id: serial('id').primaryKey(),
  parentId: varchar('parent_id').notNull(),
  firstName: varchar('first_name').notNull(),
  birthYear: integer('birth_year').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Child relations definition.
 *
 * WHY: Relations provide type-safe data access:
 * - Many-to-one with user: Each child belongs to one parent
 * - Many-to-many with tags: Children can have multiple interests
 */
export const childRelations = relations(childTable, ({ one, many }) => ({
  parent: one(userTable, {
    fields: [childTable.parentId],
    references: [userTable.id],
  }),
  tags: many(childTagTable),
}));

/**
 * Child-Tag junction table for interests/preferences.
 *
 * WHY: Separate junction table because:
 * - Children can have multiple interests (many-to-many relationship)
 * - Tags can be shared across children
 * - Enables interest-based provider recommendations
 *
 * DESIGN DECISION: Simple junction table without additional metadata
 * keeps the schema clean and queries efficient.
 */
export const childTagTable = pgTable('child_tag', {
  childId: integer('child_id').notNull(),
  tagId: integer('tag_id').notNull(),
});

// Import from users to avoid circular dependency
import { userTable } from './users';

// Type exports for use throughout the application
export type Child = typeof childTable.$inferSelect;
export type NewChild = typeof childTable.$inferInsert;
export type ChildTag = typeof childTagTable.$inferSelect;
