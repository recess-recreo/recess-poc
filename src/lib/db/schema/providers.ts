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
  id: varchar('id').primaryKey(),
  name: varchar('name').notNull(),
  description: text('description'),
  email: varchar('email'),
  phone: varchar('phone'),
  website: varchar('website'),
  address: text('address'),
  city: varchar('city'),
  state: varchar('state'),
  zipCode: varchar('zip_code'),
  latitude: numeric('latitude', { precision: 10, scale: 8 }),
  longitude: numeric('longitude', { precision: 11, scale: 8 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  logoFileName: varchar('logo_file_name'),
  coverImageFileName: varchar('cover_image_file_name'),
  active: boolean('active').default(true),
  verified: boolean('verified').default(false),
});

/**
 * Provider relations definition.
 *
 * WHY: Relations enable efficient data loading and type safety:
 * - Events: Provider's activity offerings
 */
/**
 * Event table for provider activities and programs.
 *
 * WHY: Events represent actual activities that families can book:
 * - Each event has specific dates, age ranges, and capacity
 * - Supports both one-time and recurring activities
 * - Includes practical information for matching and booking
 */
export const eventTable = pgTable('event', {
  id: varchar('id').primaryKey(),
  providerId: varchar('provider_id').notNull(),
  title: varchar('title').notNull(),
  description: text('description'),
  category: varchar('category'),
  minAge: integer('min_age'),
  maxAge: integer('max_age'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  recurring: boolean('recurring').default(false),
  price: numeric('price', { precision: 10, scale: 2 }),
  capacity: integer('capacity'),
  enrolled: integer('enrolled').default(0),
  address: text('address'),
  city: varchar('city'),
  state: varchar('state'),
  zipCode: varchar('zip_code'),
  latitude: numeric('latitude', { precision: 10, scale: 8 }),
  longitude: numeric('longitude', { precision: 11, scale: 8 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  imageFileName: varchar('image_file_name'),
  active: boolean('active').default(true),
});

export const providerRelations = relations(providerTable, ({ many }) => ({
  events: many(eventTable),
}));

export const eventRelations = relations(eventTable, ({ one }) => ({
  provider: one(providerTable, {
    fields: [eventTable.providerId],
    references: [providerTable.id],
  }),
}));

// Type exports for use throughout the application
export type Provider = typeof providerTable.$inferSelect;
export type NewProvider = typeof providerTable.$inferInsert;
export type Event = typeof eventTable.$inferSelect;
export type NewEvent = typeof eventTable.$inferInsert;
