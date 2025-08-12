import { pgTable, integer, varchar, numeric, serial, timestamp, text, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Market table schema definition.
 *
 * WHY: Markets represent geographic service areas because:
 * - Different cities/regions have different provider ecosystems
 * - Enables market-specific features and content
 * - Supports future multi-market expansion
 *
 * DESIGN DECISIONS:
 * - Municipality/Administrative Area: Location identification using standard geographic boundaries
 * - Country code: ISO 3166-1 alpha-2 country codes for international support
 * - Timestamps: Track when markets were added and last modified
 *
 * NOTE: The database schema differs from the original design. This reflects the actual
 * production database structure which uses municipality/administrative_area/country
 * instead of coordinates and URL slugs.
 */
export const marketTable = pgTable('market', {
  id: varchar('id').primaryKey(),
  name: varchar('name').notNull(),
  slug: varchar('slug').notNull(),
  description: text('description'),
  city: varchar('city'),
  state: varchar('state'),
  latitude: numeric('latitude', { precision: 10, scale: 8 }),
  longitude: numeric('longitude', { precision: 11, scale: 8 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  active: boolean('active').default(true),
});

/**
 * Market relations definition.
 *
 * WHY: Markets organize geographic data:
 * - One-to-many with providers: Providers operate in specific markets
 * - One-to-many with neighborhoods: Markets contain neighborhoods
 */
export const marketRelations = relations(marketTable, ({ many }) => ({
  providers: many(providerTable),
  neighborhoods: many(neighborhoodTable),
}));

/**
 * Neighborhood table schema definition.
 *
 * WHY: Neighborhoods provide granular location filtering because:
 * - Parents often search for activities near home/work
 * - Neighborhood names are more familiar than coordinates
 * - Enables "nearby" recommendations
 *
 * DESIGN DECISIONS:
 * - Market ID reference: Neighborhoods belong to markets
 * - Simple name field: Used for both display and identification
 * - Timestamps: Track when neighborhoods were added and modified
 *
 * NOTE: The actual database schema is simpler than the original design.
 * It only includes basic fields without bounds or display name separation.
 */
export const neighborhoodTable = pgTable('neighborhood', {
  id: serial('id').primaryKey(),
  marketId: integer('market_id').notNull(),
  name: varchar('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Neighborhood relations definition.
 */
export const neighborhoodRelations = relations(neighborhoodTable, ({ one, many }) => ({
  market: one(marketTable, {
    fields: [neighborhoodTable.marketId],
    references: [marketTable.id],
  }),
  providers: many(providerTable),
}));

// Import for relations
import { providerTable } from './providers';

// Type exports
export type Market = typeof marketTable.$inferSelect;
export type NewMarket = typeof marketTable.$inferInsert;
export type Neighborhood = typeof neighborhoodTable.$inferSelect;
export type NewNeighborhood = typeof neighborhoodTable.$inferInsert;
