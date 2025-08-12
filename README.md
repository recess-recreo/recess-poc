# Recess POC Demo

A minimal standalone POC repository demonstrating AI-powered activity recommendations.

## Overview

This POC showcases the core Recess Concierge functionality:
- Natural language family profile parsing
- AI-powered activity recommendations  
- Automated email generation
- Real-time cost tracking

## Demo Flow

1. **Family Input** - Natural language family description parsing with AI
2. **Profile Review** - Edit and validate extracted family data
3. **AI Recommendations** - Vector search + personalized activity matching
4. **Provider Outreach** - Auto-generated personalized communication
5. **Cost & Performance** - Real-time AI usage and ROI analytics

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (POC database on port 5433)
- Qdrant (POC instance on port 6334)
- Redis (POC instance on port 6380)
- OpenAI API key

### Installation

1. Clone and install dependencies:
```bash
cd /path/to/poc
npm install
```

2. Configure environment:
```bash
cp .env.example .env.local
# Edit .env.local with your API keys and database URLs
```

3. Start the development server:
```bash
npm run dev
```

4. Access the demo:
- Open http://localhost:3000
- Enter demo password: `recess2024`
- Experience the 5-phase AI workflow

## Architecture

### Directory Structure
```
src/
├── app/
│   ├── api/v1/ai/           # AI API endpoints
│   ├── demo/poc1/           # Main demo page
│   └── page.tsx             # Authentication landing
├── lib/
│   ├── ai/                  # OpenAI integration
│   ├── embeddings/          # Vector search
│   ├── db/                  # Database client
│   └── redis/               # Caching
└── types/
    └── ai.ts                # TypeScript definitions
```

### Key Components

- **FamilyInput**: Natural language input with sample data
- **ProfileReview**: Editable structured family profile
- **Recommendations**: AI-powered activity matching
- **EmailSimulation**: Automated email generation
- **CostTracker**: Real-time metrics and ROI analysis

### API Endpoints

- `POST /api/v1/ai/parse-family` - Parse natural language to structured profile
- `POST /api/v1/ai/recommendations` - Generate personalized recommendations

## Configuration

### Database Setup (POC Instance - Port 5433)
```bash
# Ensure POC database is running on port 5433
# Database: recess_poc
# User: recess / Password: recess123
```

### Qdrant Setup (POC Instance - Port 6334)  
```bash
# Ensure POC Qdrant instance is running on port 6334
# Contains embedded provider/program data
```

### Redis Setup (POC Instance - Port 6380)
```bash  
# Ensure POC Redis instance is running on port 6380
# Used for caching API responses
```

## Authentication

Simple password-based authentication:
- Default password: `recess2024`
- Stored in session storage
- Change via `DEMO_PASSWORD` env var

## Deployment

### Independent Deployment
The POC is designed for standalone deployment:

```bash
# Build for production
npm run build

# Start production server  
npm start
```

### Docker Deployment
```bash
# Build container
docker build -t recess-poc .

# Run container
docker run -p 3000:3000 recess-poc
```

## Integration with Main Codebase

The POC maintains the same structure as the main webapp:
- Same API endpoint patterns
- Identical component architecture  
- Shared TypeScript types
- Compatible database schema

This ensures easy re-integration when moving from POC to production.

## Demo Script

For presentations, follow this flow:

1. **Landing Page** - Show password protection and demo overview
2. **Family Input** - Use sample inputs or custom family descriptions
3. **Profile Review** - Demonstrate AI extraction accuracy
4. **Recommendations** - Show personalized matching with explanations
5. **Email Generation** - Display automated provider outreach
6. **Metrics Dashboard** - Review cost efficiency and performance

## Troubleshooting

### Common Issues

**Database Connection**
```bash
# Check POC database is running on port 5433
psql -h localhost -p 5433 -U recess -d recess_poc
```

**Qdrant Connection**
```bash
# Check POC Qdrant is running on port 6334
curl http://localhost:6334/health
```

**OpenAI API**
```bash
# Verify API key is set
echo $OPENAI_API_KEY
```

### Performance

- Typical family parsing: ~2-3 seconds
- Recommendation generation: ~3-5 seconds  
- Email generation: ~2-4 seconds
- Total demo flow: ~10-15 seconds

## Development

### Adding Features
Follow the main webapp patterns:
- Add API endpoints in `/api/v1/`
- Create components in `/components/`
- Update types in `/types/ai.ts`

### Testing
```bash
# Run type checking
npx tsc --noEmit

# Test API endpoints
curl -X POST http://localhost:3000/api/v1/ai/parse-family
```

## Security Notes

- POC uses simple password authentication
- Session storage for demo purposes only
- Not suitable for production without proper auth
- API keys should be secured in production deployment# Force Railway redeploy Tue Aug 12 15:45:11 EDT 2025
