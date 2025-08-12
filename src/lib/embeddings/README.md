# Recess Embedding Generation System

This directory contains the complete embedding generation system for Recess providers and camps using OpenAI's `text-embedding-3-small` model.

## Overview

The system generates semantic embeddings for:
- **717 Providers**: Childcare centers, activity providers, etc.
- **579 Camps**: Summer camps, after-school programs, etc.

**Total Cost**: ~$0.02 (based on estimated token usage)

## Architecture

### Core Components

1. **`types.ts`** - TypeScript type definitions
2. **`qdrant-client.ts`** - Qdrant vector database client
3. **`generator.ts`** - Main embedding generation logic
4. **`../scripts/generate-embeddings.ts`** - Command-line script

### Data Flow

```
PostgreSQL → Text Generation → OpenAI API → Qdrant Storage
(Providers/Camps)  (Combine fields)   (Embeddings)    (Vector DB)
```

## Setup

### 1. Install Dependencies

The system uses existing dependencies plus `tsx` for TypeScript execution:

```bash
npm install --save-dev tsx --legacy-peer-deps
```

### 2. Environment Variables

Copy `.env.embeddings.example` and configure:

```bash
cp .env.embeddings.example .env.embeddings
```

Required variables:
```bash
# OpenAI API Key (required)
OPENAI_API_KEY=your-openai-api-key-here

# PostgreSQL Configuration (POC containers)
PG_HOST=localhost
PG_PORT=5433
PG_USER=postgres
PG_PASSWORD=postgres
PG_DATABASE=recess

# Qdrant Configuration (POC containers)
QDRANT_HOST=localhost
QDRANT_PORT=6335
```

### 3. Start POC Containers

Ensure your PostgreSQL and Qdrant containers are running:

```bash
# PostgreSQL on port 5433
# Qdrant on port 6335
```

## Usage

### Command Line Interface

```bash
# Generate all embeddings
npm run embeddings:generate

# Generate only provider embeddings
npm run embeddings:providers

# Generate only camp embeddings
npm run embeddings:camps

# Custom options
npm run embeddings:generate -- --batch-size=100 --no-skip-existing
```

### Available Options

- `--providers-only` - Process only providers
- `--camps-only` - Process only camps  
- `--batch-size=N` - Process N items at a time (default: 50)
- `--no-skip-existing` - Regenerate existing embeddings
- `--help` - Show help information

### Programmatic Usage

```typescript
import { EmbeddingGenerator } from './lib/embeddings/generator';

const generator = new EmbeddingGenerator({
  batch_size: 100,
  openai_model: 'text-embedding-3-small',
});

await generator.initialize();
const stats = await generator.generateAllEmbeddings();
console.log(`Generated embeddings for ${stats.total_items} items`);
console.log(`Cost: $${stats.actual_cost.toFixed(4)}`);
```

## Text Generation Strategy

### Providers
Combines key fields to create rich text representations:
- Company name and description
- Location information (city, state, postal code)
- Business details (pricing, NAICS category)
- Features (instant booking, contact methods)
- Associated camp programs (up to 5)

Example:
```
Company: Kids Adventure Zone. Description: Indoor playground and party venue. 
Location: San Francisco, CA, 94103. Pricing: $15-25 per child. 
Features: instant booking available, website, phone contact available.
Programs: Summer Day Camp - outdoor activities grades K-5 price $200/week
```

### Camps
Focuses on program-specific information:
- Program title and description
- Dates, times, and location
- Age groups and pricing
- Availability status

Example:
```
Program: Summer Science Camp. Description: STEM activities and experiments. 
Dates: June 15 - August 30, 2024. Time: 9:00 AM - 3:00 PM. 
Location: Main Campus. Ages/Grades: grades 3-8. Price: $250/week. 
Status: Active
```

## Performance

### Batch Processing
- Default batch size: 50 items
- Rate limiting: 100ms delay between API calls
- Retry logic: 3 attempts with exponential backoff

### Caching
- In-memory caching using SHA-256 text hashing
- Avoids duplicate API calls for identical content
- Cache persists for the duration of the generation session

### Cost Tracking
- Real-time token usage monitoring
- Accurate cost calculation based on OpenAI pricing
- Expected total cost: ~$0.02 for all 1,296 items

## Qdrant Storage

### Collection Configuration
- **Collection**: `recess_embeddings`
- **Vector Size**: 1536 (text-embedding-3-small default)
- **Distance**: Cosine similarity
- **Index**: HNSW for fast approximate search

### Metadata Structure
Each embedding includes rich metadata for filtering:

**Provider Metadata:**
```typescript
{
  type: 'provider',
  provider_id: number,
  company_name: string,
  market_id: number,
  active: boolean,
  location: { municipality, administrative_area, postal_code, lat, lng },
  contact: { website, phone, email },
  business: { primary_naics, instant_booking, not_a_fit },
  pricing: string
}
```

**Camp Metadata:**
```typescript
{
  type: 'camp',
  camp_id: number,
  provider_id: number,
  title: string,
  date_range: string,
  location: string,
  price: string,
  grades: string,
  status: string
}
```

## Monitoring and Debugging

### Progress Tracking
The system provides detailed progress information:
- Batch processing status
- Token usage and cost tracking  
- Error reporting with retry counts
- Final statistics summary

### Error Handling
- Database connection errors
- OpenAI API failures
- Qdrant storage issues
- Individual item processing errors

### Logging Output
```bash
🎯 Recess Embedding Generator

📋 Configuration:
├── Database: localhost:5433/recess
├── Qdrant: localhost:6335
└── OpenAI API Key: ✓ Set

Initializing embedding generation system...
✓ Qdrant connection established  
✓ Created Qdrant collection: recess_embeddings
✓ OpenAI API key found

Found 717 providers to process
Processing provider batch 1/15 (50 items)
...

🎉 Embedding generation complete!

📊 Final Statistics:
├── Total items processed: 1,296
├── Providers: 717
├── Camps: 579  
├── Failed items: 0
├── Total tokens: 847,392
├── Actual cost: $0.0169
└── Duration: 423s
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```
   Error: Failed to connect to PostgreSQL
   ```
   - Verify POC containers are running
   - Check PG_PORT=5433 for POC environment

2. **Qdrant Connection Failed**
   ```
   Error: Failed to connect to Qdrant
   ```
   - Verify Qdrant container is running on port 6335
   - Check QDRANT_HOST and QDRANT_PORT settings

3. **OpenAI API Errors**
   ```
   Error: OpenAI API error (401): Invalid API key
   ```
   - Verify OPENAI_API_KEY is set correctly
   - Check API key has sufficient credits

4. **Type Compilation Errors**
   ```
   Error: Module declares 'X' locally, but it is not exported
   ```
   - Run `npx tsc --noEmit --skipLibCheck` to check types
   - Ensure all imports are correctly specified

### Recovery
- The system skips existing embeddings by default
- Use `--no-skip-existing` to regenerate all embeddings
- Individual batch failures don't stop the entire process

## Future Enhancements

1. **Persistent Caching**: Store cache in Redis for cross-session reuse
2. **Incremental Updates**: Only process new/updated items since last run  
3. **Search Interface**: Add similarity search API endpoints
4. **Monitoring Dashboard**: Real-time progress and cost tracking
5. **Multiple Models**: Support for different embedding models