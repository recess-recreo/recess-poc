/**
 * Mock Coordinates Utility
 * 
 * WHY: Testing map functionality with realistic Austin coordinates because:
 * - Provides realistic coordinate data for testing map features
 * - Simulates actual provider locations around Austin, TX
 * - Enables testing of marker clustering and zoom functionality
 * - Validates map bounds calculation and user experience
 * - Supports demo scenarios with geographically distributed providers
 */

import type { Recommendation } from '@/types/ai';

// Austin-area coordinates for testing
const AUSTIN_COORDINATES = [
  { lat: 30.2672, lng: -97.7431, name: 'Downtown Austin' },
  { lat: 30.2849, lng: -97.7341, name: 'University of Texas' },
  { lat: 30.3015, lng: -97.7522, name: 'Hyde Park' },
  { lat: 30.2500, lng: -97.7500, name: 'South Austin' },
  { lat: 30.3500, lng: -97.7000, name: 'North Austin' },
  { lat: 30.2200, lng: -97.8500, name: 'West Austin' },
  { lat: 30.2900, lng: -97.6800, name: 'East Austin' },
  { lat: 30.4000, lng: -97.7500, name: 'Cedar Park' },
  { lat: 30.1500, lng: -97.8000, name: 'South West Austin' },
  { lat: 30.3300, lng: -97.6500, name: 'Mueller' },
  { lat: 30.2400, lng: -97.7200, name: 'Zilker' },
  { lat: 30.2700, lng: -97.7700, name: 'Central Austin' },
  { lat: 30.3100, lng: -97.7100, name: 'North Central' },
  { lat: 30.2100, lng: -97.7800, name: 'Barton Hills' },
  { lat: 30.3600, lng: -97.7200, name: 'Far North Austin' }
];

/**
 * Add mock coordinates to recommendations for testing
 * 
 * @param recommendations Array of recommendations to enhance
 * @returns Enhanced recommendations with coordinate data
 */
export function addMockCoordinates(recommendations: Recommendation[]): Recommendation[] {
  return recommendations.map((rec, index) => {
    // Use index to consistently assign coordinates
    const coordIndex = index % AUSTIN_COORDINATES.length;
    const coords = AUSTIN_COORDINATES[coordIndex];
    
    // Add some random variance to make markers not overlap exactly
    const latVariance = (Math.random() - 0.5) * 0.01; // ~0.5 mile variance
    const lngVariance = (Math.random() - 0.5) * 0.01;
    
    return {
      ...rec,
      metadata: {
        ...rec.metadata,
        location: {
          ...rec.metadata?.location,
          coordinates: {
            lat: coords.lat + latVariance,
            lng: coords.lng + lngVariance,
          },
          neighborhood: rec.metadata?.location?.neighborhood || coords.name,
          city: rec.metadata?.location?.city || 'Austin',
          zipCode: rec.metadata?.location?.zipCode || '78701',
        },
      },
    };
  });
}

/**
 * Check if a recommendation has valid coordinates
 */
export function hasValidCoordinates(rec: Recommendation): boolean {
  const coords = rec.metadata?.location?.coordinates;
  return !!(
    coords &&
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

/**
 * Get Austin center coordinates
 */
export function getAustinCenter(): { lat: number; lng: number } {
  return { lat: 30.2672, lng: -97.7431 };
}