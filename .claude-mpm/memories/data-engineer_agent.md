# Data-Engineer Agent Memory - poc

<!-- MEMORY LIMITS: 8KB max | 10 sections max | 15 items per section -->
<!-- Last Updated: 2025-08-12 13:48:23 | Auto-updated by: data-engineer -->

## Project Context
poc: node_js (with javascript, typescript) single page application
- Main modules: types, app, app/demo, app/api
- Uses: @heroicons/react, react, react-dom
- Key patterns: Async Programming

## Project Architecture
- Single Page Application with node_js implementation
- Main directories: src, docs
- Core modules: types, app, app/demo, app/api

## Coding Patterns Learned
- Node.js project: use async/await, ES6+ features
- React patterns: component composition, hooks usage
- React patterns: component composition, hooks usage
- React patterns: component composition, hooks usage
- Project uses: Async Programming

## Implementation Guidelines
- Use npm for dependency management
- Key config files: package.json

## Domain-Specific Knowledge
<!-- Agent-specific knowledge for poc domain -->
- Key project terms: types, demo, components, redis
- Focus on implementation patterns, coding standards, and best practices

## Effective Strategies
<!-- Successful approaches discovered through experience -->

## Common Mistakes to Avoid
- Avoid callback hell - use async/await consistently
- Don't commit node_modules - ensure .gitignore is correct
- Don't ignore database transactions in multi-step operations
- Avoid N+1 queries - use proper joins or prefetching

## Integration Points
- Redis database integration
- redis integration

## Performance Considerations
- Leverage event loop - avoid blocking operations
- Use streams for large data processing
- Index frequently queried columns
- Use connection pooling for database connections
- Use React.memo for expensive component renders

## Current Technical Context
- Tech stack: node_js, @heroicons/react, react
- Data storage: redis
- Key dependencies: @heroicons/react, @types/leaflet, @xenova/transformers, bcrypt
- Documentation: README.md, docs/railway-auth-guide.md, docs/MANUAL_RAILWAY_DEPLOYMENT.md

## Recent Learnings
<!-- Most recent discoveries and insights -->
