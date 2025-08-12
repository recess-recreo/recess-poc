import { pgTable, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * User table schema definition.
 *
 * WHY: User table stores parent/guardian information because:
 * - Parents are the primary users who register and manage children
 * - Email verification ensures account security
 * - Onboarding tracking helps guide new users through setup
 *
 * DESIGN DECISIONS:
 * - ID as varchar: Allows flexibility for different ID generation strategies (UUID, Auth0, etc.)
 * - Separate first/last name: Better for personalization and formal communications
 * - Optional phone: Not required for registration but useful for provider contact
 * - Avatar storage: Only filename stored, actual files in S3/CDN
 */
export const userTable = pgTable('user', {
  id: varchar('id').primaryKey(),
  firstName: varchar('first_name').notNull(),
  lastName: varchar('last_name').notNull(),
  email: varchar('email').notNull(),
  password: varchar('password'), // Bcrypt hash - added for session auth
  phone: varchar('phone'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  emailVerified: boolean('email_verified').default(false),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  avatarFileName: varchar('avatar_file_name'),
});

/**
 * User relations definition.
 *
 * WHY: Relations provide type-safe joins and eager loading:
 * - One-to-many with children: Parents can have multiple children
 * - One-to-many with saved providers: Users can bookmark multiple providers
 */
export const userRelations = relations(userTable, ({ many }) => ({
  children: many(childTable),
  savedProviders: many(userProviderSaveTable),
}));

/**
 * User-Provider save/bookmark junction table.
 *
 * WHY: Tracks which providers users have saved/bookmarked because:
 * - Users need quick access to their favorite providers
 * - Helps with personalized recommendations
 * - Provides analytics on provider popularity
 */
export const userProviderSaveTable = pgTable('user_provider_save', {
  userId: varchar('user_id').notNull(),
  providerId: varchar('provider_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Import these from their respective files to avoid circular dependencies
import { childTable } from './children';

// Type exports for use throughout the application
export type User = typeof userTable.$inferSelect;
export type NewUser = typeof userTable.$inferInsert;
export type UserProviderSave = typeof userProviderSaveTable.$inferSelect;
