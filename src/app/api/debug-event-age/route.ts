import { NextRequest, NextResponse } from 'next/server';
import { db, eventsTable } from '@/lib/db';
import { ilike, or } from 'drizzle-orm';

/**
 * Debug API endpoint to investigate age extraction for "Dance Discovery - Evolution: Teens"
 */
export async function GET(request: NextRequest) {
  try {
    console.log("🔍 Searching for 'Dance Discovery - Evolution: Teens' event...");

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

    const results: any = {
      searchResults: events,
      totalFound: events.length,
      sampleEvents: []
    };

    if (events.length === 0) {
      console.log("❌ No events found matching the search criteria");
      
      // Let's try a broader search for any event with "teen" in the name
      const teenEvents = await db.select()
        .from(eventsTable)
        .where(ilike(eventsTable.name, '%teen%'));
        
      results.teenEvents = teenEvents.slice(0, 5);
      console.log(`🔍 Found ${teenEvents.length} events with 'teen' in the name`);
      
    } else {
      console.log(`✅ Found ${events.length} matching events`);
    }

    // Also show a sample of all events to understand the data structure
    console.log("📊 Getting sample of all events (first 3):");
    const sampleEvents = await db.select()
      .from(eventsTable)
      .limit(3);
      
    results.sampleEvents = sampleEvents;

    // Log detailed information about the matching events
    events.forEach((event, i) => {
      console.log(`\nEvent ${i + 1}:`);
      console.log(`  ID: ${event.id}`);
      console.log(`  Name: "${event.name}"`);
      console.log(`  Ages field: ${event.ages || 'null'}`);
      console.log(`  Location: ${event.location || 'null'}`);
      console.log(`  Address: ${event.address || 'null'}`);
      console.log(`  Start Date: ${event.startDateTime}`);
      console.log(`  Price: ${event.price || 'null'}`);
      console.log(`  Free: ${event.isFree}`);
    });

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    console.error("❌ Database query failed:", error);
    return NextResponse.json(
      { error: 'Failed to query events', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}