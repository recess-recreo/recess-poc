import {
  pgTable,
  integer,
  varchar,
  boolean,
  numeric,
  timestamp,
  date,
  serial,
  text,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Provider table schema definition.
 *
 * WHY: Provider table stores childcare/activity provider information because:
 * - Central repository for all provider data displayed to parents
 * - Location data enables geographic search and filtering
 * - Rich metadata supports advanced filtering and categorization
 *
 * DESIGN DECISIONS:
 * - Separate address fields: Follows standard address format for consistency
 * - Lat/long storage: Enables radius searches and map display
 * - NAICS code: Industry standard classification for business types
 * - Active flag: Soft delete pattern for data integrity
 * - Not-a-fit tracking: Helps filter out inappropriate providers
 */
export const providerTable = pgTable('provider', {
  id: serial('id').primaryKey(),
  marketId: integer('market_id').notNull(),
  neighborhoodId: integer('neighborhood_id'),
  active: boolean('active').notNull(),
  companyName: varchar('company_name').notNull(),
  streetLine1: varchar('street_line_1'),
  streetLine2: varchar('street_line_2'),
  municipality: varchar('municipality'),
  administrativeArea: varchar('administrative_area', { length: 2 }),
  subAdministrativeArea: varchar('sub_administrative_area'),
  postalCode: varchar('postal_code'),
  country: varchar('country').notNull(),
  latitude: numeric('latitude', { precision: 8, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  placeId: varchar('place_id'),
  website: varchar('website'),
  phone: varchar('phone'),
  email: varchar('email'),
  description: varchar('description'),
  blurb: varchar('blurb'),
  price: varchar('price'),
  primaryNaics: varchar('primary_naics'),
  notAFit: boolean('not_a_fit'),
  notAFitReason: varchar('not_a_fit_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  summerCampRegistrationDate: date('summer_camp_registration_date'),
  metadata: text('metadata'),
  instantBooking: boolean('instant_booking'),
});

/**
 * Provider relations definition.
 *
 * WHY: Relations enable efficient data loading and type safety:
 * - Market/neighborhood: Geographic categorization
 * - Images: Multiple photos per provider
 * - Tags: Flexible categorization system
 * - Camps: Specific program offerings
 */
export const providerRelations = relations(providerTable, ({ one, many }) => ({
  market: one(marketTable, {
    fields: [providerTable.marketId],
    references: [marketTable.id],
  }),
  neighborhood: one(neighborhoodTable, {
    fields: [providerTable.neighborhoodId],
    references: [neighborhoodTable.id],
  }),
  images: many(providerImageTable),
  tags: many(providerTagTable),
  camps: many(providerCampsTable),
  claims: many(providerClaimTable),
  ownerAssignments: many(providerOwnerAssignmentsTable),
}));

/**
 * Provider image table for storing multiple images per provider.
 *
 * WHY: Separate image table because:
 * - Providers can have multiple images (gallery)
 * - Order matters for display purposes
 * - Captions provide context for each image
 */
export const providerImageTable = pgTable('provider_image', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id').notNull(),
  url: varchar('url').notNull(),
  description: varchar('description'),
  alt: varchar('alt'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Provider camps table for summer camp offerings.
 *
 * WHY: Separate camps table because:
 * - Camps have specific date ranges and age groups
 * - Each camp session needs individual tracking
 * - Supports filtering by camp availability
 */
export const providerCampsTable = pgTable('provider_camps', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id'),
  title: text('title').notNull(),
  description: text('description'),
  date: date('date'),
  dateRange: text('date_range'),
  time: text('time'),
  location: text('location'),
  link: text('link'),
  price: text('price'),
  registerUrl: text('register_url'),
  spotsLeft: text('spots_left'),
  spotsTotal: text('spots_total'),
  grades: text('grades'),
  status: text('status'),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow(),
  metadata: text('metadata'),
  scraperName: varchar('scraper_name'),
});

/**
 * Provider claim table for business ownership verification.
 *
 * WHY: Claims system allows:
 * - Business owners to manage their listings
 * - Verification of legitimate ownership
 * - Direct communication with providers
 */
export const providerClaimTable = pgTable('provider_claim', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id').notNull(),
  claimantName: varchar('claimant_name').notNull(),
  claimantEmail: varchar('claimant_email').notNull(),
  claimantPhone: varchar('claimant_phone'),
  relationship: varchar('relationship'),
  status: varchar('status').default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Provider owners table for managing provider accounts.
 */
export const providerOwnersTable = pgTable('provider_owners', {
  id: serial('id').primaryKey(),
  email: varchar('email').notNull(),
  firstName: varchar('first_name'),
  lastName: varchar('last_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Provider owner assignments junction table.
 */
export const providerOwnerAssignmentsTable = pgTable('provider_owner_assignments', {
  providerId: integer('provider_id').notNull(),
  ownerId: integer('owner_id').notNull(),
  role: varchar('role').default('owner'),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Provider tag junction table for many-to-many relationship.
 */
export const providerTagTable = pgTable('provider_tag', {
  providerId: integer('provider_id').notNull(),
  tagId: integer('tag_id').notNull(),
});

// Import these from their respective files to avoid circular dependencies
import { marketTable } from './markets';
import { neighborhoodTable } from './markets';

// Type exports for use throughout the application
export type Provider = typeof providerTable.$inferSelect;
export type NewProvider = typeof providerTable.$inferInsert;
export type ProviderImage = typeof providerImageTable.$inferSelect;
export type ProviderCamp = typeof providerCampsTable.$inferSelect;
export type ProviderClaim = typeof providerClaimTable.$inferSelect;
