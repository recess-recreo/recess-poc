import { pgTable, serial, varchar, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Contact form table schema definition.
 *
 * WHY: Contact form submissions need persistent storage because:
 * - Async processing of inquiries (email notifications, CRM integration)
 * - Analytics on common questions and user needs
 * - Audit trail of all communications
 *
 * DESIGN DECISIONS:
 * - All fields stored: Complete record of user submissions
 * - Status tracking: Monitor response workflow
 * - Timestamps: Track response times and follow-up
 */
export const contactFormTable = pgTable('contact_form', {
  id: serial('id').primaryKey(),
  name: varchar('name'),
  email: varchar('email'),
  phone: varchar('phone'),
  subject: varchar('subject'),
  background: varchar('background'),
  message: text('message').notNull(),
  status: varchar('status').default('new'),
  createdAt: timestamp('created_at').defaultNow(),
  respondedAt: timestamp('responded_at'),
});

/**
 * Newsletter email table schema definition.
 *
 * WHY: Newsletter subscriptions stored separately because:
 * - Different consent and lifecycle from user accounts
 * - Integration with email marketing platforms
 * - Compliance with email regulations (CAN-SPAM, GDPR)
 *
 * DESIGN DECISIONS:
 * - Email as primary identifier: Simple subscription model
 * - Status field: Track active, unsubscribed, bounced states
 * - Source tracking: Understand where subscribers come from
 */
export const newsletterEmailTable = pgTable('newsletter_email', {
  id: serial('id').primaryKey(),
  email: varchar('email').notNull().unique(),
  status: varchar('status').default('active'),
  source: varchar('source'),
  subscribedAt: timestamp('subscribed_at').defaultNow(),
  unsubscribedAt: timestamp('unsubscribed_at'),
});

// Type exports
export type ContactForm = typeof contactFormTable.$inferSelect;
export type NewContactForm = typeof contactFormTable.$inferInsert;
export type NewsletterEmail = typeof newsletterEmailTable.$inferSelect;
export type NewNewsletterEmail = typeof newsletterEmailTable.$inferInsert;
