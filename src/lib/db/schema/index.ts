/**
 * Central export point for all database schema definitions.
 *
 * WHY: Single source of truth for all table schemas ensures:
 * - Consistent type definitions across the application
 * - Easy discovery of available tables
 * - Simplified imports with barrel exports
 *
 * DESIGN DECISION: Separate schema files by domain because:
 * - Improves code organization and maintainability
 * - Allows team members to work on different domains without conflicts
 * - Makes it easier to understand relationships within a domain
 */

export * from './users';
export * from './providers';
export * from './children';
export * from './events';
export * from './tags';
export * from './markets';
export * from './contact';
