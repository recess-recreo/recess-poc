# Research Agent Memory - poc

<!-- MEMORY LIMITS: 16KB max | 10 sections max | 15 items per section -->
<!-- Last Updated: 2025-08-11 17:09:51 | Auto-updated by: research -->

## Project Context
poc: node_js (with react, typescript) single page application
- Main modules: types, app, app/demo, app/api
- Uses: @heroicons/react, react, react-dom
- Key patterns: Async Programming

## Project Architecture
- Single Page Application with node_js implementation
- Main directories: src
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
- Key project terms: embeddings, demo, components, redis
- Focus on code analysis, pattern discovery, and architectural insights
- Prioritize documentation analysis for comprehensive understanding

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
- Key dependencies: @heroicons/react, @xenova/transformers, bcrypt, classnames
- Documentation: README.md

## Recent Learnings
<!-- Most recent discoveries and insights -->
