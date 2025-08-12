import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';

/**
 * Simple debug API to check event data
 */
export async function GET(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    // Get all table names first
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    console.log("Available tables:", tables);

    // Check for events table and search for teen-related events
    let searchResults = null;
    let tableSchema = null;
    
    if (tables.includes('events')) {
      // Get table schema
      const schemaResult = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'events' AND table_schema = 'public'
        ORDER BY ordinal_position;
      `);
      tableSchema = schemaResult.rows;
      
      // Search for teen-related events
      const searchResult = await client.query(`
        SELECT id, name, ages, location, start_date_time, price, is_free
        FROM events 
        WHERE LOWER(name) LIKE '%teen%' OR LOWER(name) LIKE '%dance%' 
        LIMIT 10;
      `);
      
      searchResults = searchResult.rows;
    } else if (tables.includes('event')) {
      // Try the event table from providers schema
      const schemaResult = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'event' AND table_schema = 'public'
        ORDER BY ordinal_position;
      `);
      tableSchema = schemaResult.rows;
      
      const searchResult = await client.query(`
        SELECT id, title, min_age, max_age, start_date, price, category
        FROM event 
        WHERE LOWER(title) LIKE '%teen%' OR LOWER(title) LIKE '%dance%' 
        LIMIT 10;
      `);
      
      searchResults = searchResult.rows;
    }

    return NextResponse.json({
      tables,
      searchResults,
      tableSchema,
      searchQuery: 'teen% OR dance%'
    });

  } catch (error) {
    console.error("Database query failed:", error);
    return NextResponse.json(
      { error: 'Database query failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}