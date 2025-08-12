import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';

/**
 * Debug API endpoint to check database schema and available tables
 */
export async function GET(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    console.log("🔍 Checking database schema...");

    // Get list of all tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    console.log("📊 Available tables:", tables);

    // Check if events table exists and get its structure
    let eventsSchema = null;
    let sampleEvents = null;
    
    if (tables.includes('events')) {
      const schemaResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'events' AND table_schema = 'public'
        ORDER BY ordinal_position;
      `);
      
      eventsSchema = schemaResult.rows;
      console.log("📋 Events table schema:", eventsSchema);

      // Get sample events data
      const samplesResult = await client.query(`
        SELECT * FROM events 
        WHERE name ILIKE '%teen%' OR name ILIKE '%dance%'
        LIMIT 5;
      `);
      
      sampleEvents = samplesResult.rows;
      console.log("📖 Sample events with 'teen' or 'dance':", sampleEvents);
    }

    // Also check provider_events or similar tables
    const eventRelatedTables = tables.filter(table => 
      table.includes('event') || table.includes('program') || table.includes('activity')
    );
    
    console.log("🎯 Event-related tables:", eventRelatedTables);

    return NextResponse.json({
      allTables: tables,
      eventRelatedTables,
      eventsTableExists: tables.includes('events'),
      eventsSchema,
      sampleEvents
    }, { status: 200 });

  } catch (error) {
    console.error("❌ Database schema query failed:", error);
    return NextResponse.json(
      { error: 'Failed to query database schema', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}