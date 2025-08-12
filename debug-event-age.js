#!/usr/bin/env node

/**
 * Debug script to investigate age extraction for "Dance Discovery - Evolution: Teens"
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eventsTable } from "./src/lib/db/schema/events.js";
import { ilike, or } from "drizzle-orm";

// Create database connection (using same logic as client.ts)
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl:
          process.env.DATABASE_URL.includes("amazonaws.com") ||
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : undefined,
      }
    : {
        host: process.env.PG_HOST || "localhost",
        port: parseInt(process.env.PG_PORT || "5432"),
        user: process.env.PG_USER || "postgres",
        password: process.env.PG_PASSWORD || "postgres",
        database: process.env.PG_DATABASE || "recess",
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
);

const db = drizzle(pool);

async function debugEventAge() {
  try {
    console.log("🔍 Searching for 'Dance Discovery - Evolution: Teens' event...\n");

    // Search for events containing "Dance Discovery" and "Teens"
    const events = await db.select()
      .from(eventsTable)
      .where(
        or(
          ilike(eventsTable.name, '%Dance Discovery%'),
          ilike(eventsTable.name, '%Evolution%'),
          ilike(eventsTable.name, '%Teens%')
        )
      );

    if (events.length === 0) {
      console.log("❌ No events found matching the search criteria");
      
      // Let's try a broader search for any event with "teen" in the name
      const teenEvents = await db.select()
        .from(eventsTable)
        .where(ilike(eventsTable.name, '%teen%'));
        
      console.log(`\n🔍 Found ${teenEvents.length} events with 'teen' in the name:`);
      teenEvents.slice(0, 5).forEach((event, i) => {
        console.log(`  ${i + 1}. "${event.name}" - ages: ${event.ages || 'null'}`);
      });
      
    } else {
      console.log(`✅ Found ${events.length} matching events:\n`);
      
      events.forEach((event, i) => {
        console.log(`Event ${i + 1}:`);
        console.log(`  ID: ${event.id}`);
        console.log(`  Name: "${event.name}"`);
        console.log(`  Ages field: ${event.ages || 'null'}`);
        console.log(`  Location: ${event.location || 'null'}`);
        console.log(`  Address: ${event.address || 'null'}`);
        console.log(`  Start Date: ${event.startDateTime}`);
        console.log(`  Price: ${event.price || 'null'}`);
        console.log(`  Free: ${event.isFree}`);
        console.log(`  Created: ${event.createdAt}`);
        console.log("");
      });
    }

    // Also show a sample of all events to understand the data structure
    console.log("\n📊 Sample of all events (first 3):");
    const sampleEvents = await db.select()
      .from(eventsTable)
      .limit(3);
      
    sampleEvents.forEach((event, i) => {
      console.log(`\nSample ${i + 1}:`);
      console.log(`  Name: "${event.name}"`);
      console.log(`  Ages: ${event.ages || 'null'}`);
    });

  } catch (error) {
    console.error("❌ Database query failed:", error);
  } finally {
    await pool.end();
  }
}

debugEventAge();