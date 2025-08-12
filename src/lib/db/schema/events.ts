import {
  pgTable,
  integer,
  varchar,
  timestamp,
  date,
  time,
  boolean,
  serial,
  text,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Events table schema definition.
 *
 * WHY: Events table stores one-time or recurring activities because:
 * - Parents need to find activities happening on specific dates
 * - Different from regular provider services that are always available
 * - Supports both single events and recurring series
 *
 * DESIGN DECISIONS:
 * - Separate date/time fields: Allows for complex scheduling queries
 * - Provider ID optional: Some events might be community-run
 * - Rich metadata: Title, description, location for comprehensive event info
 * - Published flag: Allows draft events before going live
 */
export const eventsTable = pgTable('events', {
  id: serial('id').primaryKey(),
  marketId: integer('market_id').notNull(),
  name: varchar('name').notNull(),
  startDateTime: timestamp('start_date_time').notNull(),
  endDateTime: timestamp('end_date_time').notNull(),
  isAllDay: boolean('is_all_day').notNull().default(false),
  location: varchar('location').notNull(),
  placeId: varchar('place_id'),
  address: varchar('address'),
  ages: varchar('ages'),
  price: varchar('price'),
  isFree: boolean('is_free').notNull().default(false),
  link: varchar('link'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Events relations definition.
 *
 * WHY: Relations enable:
 * - Linking events to their hosting provider
 * - Future expansion for event categories, attendees, etc.
 */
export const eventsRelations = relations(eventsTable, ({ one }) => ({
  // Events don't have a direct provider relation in the existing schema
  // They are linked to markets instead
}));

/**
 * Bookings table for event registrations.
 *
 * WHY: Track event bookings because:
 * - Users need to manage their event registrations
 * - Providers need attendee information
 * - Analytics on event popularity
 *
 * DESIGN DECISIONS:
 * - Status field: Tracks booking lifecycle (pending, confirmed, cancelled)
 * - Child ID: Links booking to specific child (age-appropriate activities)
 * - Contact info: Allows provider to reach attendee if needed
 */
export const bookingsTable = pgTable('bookings', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  userId: varchar('user_id').notNull(),
  childId: integer('child_id'),
  status: varchar('status').default('pending'),
  attendeeName: varchar('attendee_name'),
  attendeeEmail: varchar('attendee_email'),
  attendeePhone: varchar('attendee_phone'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Bookings relations definition.
 */
export const bookingsRelations = relations(bookingsTable, ({ one }) => ({
  event: one(eventsTable, {
    fields: [bookingsTable.eventId],
    references: [eventsTable.id],
  }),
  user: one(userTable, {
    fields: [bookingsTable.userId],
    references: [userTable.id],
  }),
  child: one(childTable, {
    fields: [bookingsTable.childId],
    references: [childTable.id],
  }),
}));

// Import dependencies
import { providerTable } from './providers';
import { userTable } from './users';
import { childTable } from './children';

// Type exports for use throughout the application
export type Event = typeof eventsTable.$inferSelect;
export type NewEvent = typeof eventsTable.$inferInsert;
export type Booking = typeof bookingsTable.$inferSelect;
export type NewBooking = typeof bookingsTable.$inferInsert;
