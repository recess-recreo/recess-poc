/**
 * RecommendationsMap Component - Interactive Map View
 * 
 * WHY: Map-based visualization of recommendations because:
 * - Provides spatial context for location-based decision making
 * - Enables users to see geographic distribution of activities
 * - Shows proximity relationships between recommendations and family location
 * - Improves understanding of commute times and accessibility
 * - Enhances user experience with interactive marker clustering
 * - Displays location-specific details in popups for quick comparison
 * 
 * DESIGN DECISIONS:
 * - Uses React Leaflet for performance and flexibility
 * - Implements marker clustering to handle dense recommendation areas
 * - Centers map on Austin, TX with zoom level optimized for city viewing
 * - Shows different marker colors based on recommendation match type
 * - Includes popups with key recommendation details for quick reference
 */

'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import { 
  SparklesIcon, 
  HeartIcon as HeartOutline,
  MapPinIcon,
  CurrencyDollarIcon,
  ClockIcon,
  UsersIcon,
  StarIcon,
  FireIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';

import type { FamilyProfile, Recommendation } from '@/types/ai';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

interface RecommendationsMapProps {
  familyProfile: FamilyProfile;
  recommendations: Recommendation[];
  selectedIds: Set<string>;
  onSelectionChange: (providerId: string, selected: boolean) => void;
  className?: string;
}

// Map center for Austin, TX
const AUSTIN_CENTER: LatLngExpression = [30.2672, -97.7431];
const DEFAULT_ZOOM = 11;

// Custom marker icons with cleaner, professional style
const createMarkerIcon = (type: string, isSelected: boolean) => {
  const getColor = () => {
    if (isSelected) return '#E11D48'; // Rose-600 for selected
    switch (type) {
      case 'perfect_match': return '#059669'; // Emerald-600
      case 'good_fit': return '#2563EB'; // Blue-600  
      case 'worth_exploring': return '#D97706'; // Amber-600
      default: return '#6B7280'; // Gray-500
    }
  };

  const color = getColor();
  const size = isSelected ? 32 : 28;
  const innerSize = isSelected ? 12 : 10;
  
  return L.divIcon({
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background-color: ${color};
        border: 2px solid white;
        box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      ">
        <div style="
          width: ${innerSize}px;
          height: ${innerSize}px;
          border-radius: 50%;
          background-color: white;
          opacity: 0.9;
        "></div>
      </div>
    `,
    className: 'custom-marker',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2],
  });
};

// Family location marker with home icon
const createFamilyIcon = () => {
  return L.divIcon({
    html: `
      <div style="
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
        border: 3px solid white;
        box-shadow: 0 4px 8px rgba(0,0,0,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="20" height="20" fill="white" viewBox="0 0 24 24">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
        </svg>
      </div>
    `,
    className: 'family-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
};

// Helper function to get coordinates from recommendation
function getRecommendationCoordinates(rec: Recommendation): LatLngExpression | null {
  if (rec.metadata?.location?.coordinates) {
    const { lat, lng } = rec.metadata.location.coordinates;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return [lat, lng];
    }
  }
  return null;
}

// Helper function to get family coordinates
function getFamilyCoordinates(familyProfile: FamilyProfile): LatLngExpression | null {
  // For now, return null - could implement geocoding based on neighborhood/zipcode
  // This would require a geocoding service integration
  return null;
}

// Helper functions from Recommendations component
function getProviderDisplayName(rec: Recommendation): string {
  if (rec.metadata?.provider?.name) {
    return rec.metadata.provider.name;
  }
  
  if (rec.interests && rec.interests.length > 0) {
    const providerName = rec.interests.find(interest => {
      const lower = interest.toLowerCase();
      return (
        interest.length > 3 && 
        !lower.includes('camp -') && 
        !lower.includes('program') &&
        !lower.includes('class') &&
        !lower.includes('session') &&
        (lower.includes('academy') || 
         lower.includes('school') || 
         lower.includes('center') || 
         lower.includes('studio') || 
         lower.includes('gym') ||
         lower.includes('discovery') ||
         lower.includes('thinkery') ||
         lower.includes('parks') ||
         interest.split(' ').length >= 2)
      );
    });
    
    if (providerName) {
      return providerName;
    }
  }
  
  return `Provider ${rec.providerId}`;
}

function getProgramDisplayName(rec: Recommendation): string {
  if (rec.metadata?.name) {
    return rec.metadata.name;
  }
  
  if (rec.programId) {
    return `Program ${rec.programId}`;
  }
  
  return 'Activity Program';
}

function getPriceDisplay(rec: Recommendation): string {
  if (rec.metadata?.pricing) {
    const pricing = rec.metadata.pricing;
    
    if (pricing.type === 'free') {
      return 'Free';
    }
    
    if (pricing.amount) {
      const period = pricing.type?.replace('per_', '').replace('_', ' ') || 'month';
      return `$${pricing.amount}/${period}`;
    }
    
    if (pricing.range) {
      const min = pricing.range.min || 0;
      const max = pricing.range.max || pricing.range.min || 0;
      if (min === max) {
        return `$${min}/month`;
      }
      return `$${min}-${max}/month`;
    }
  }
  
  return 'Contact for pricing';
}

function getLocationDisplay(rec: Recommendation): string {
  if (rec.metadata?.location) {
    const location = rec.metadata.location;
    const parts: string[] = [];
    
    if (location.neighborhood) {
      parts.push(location.neighborhood);
    }
    if (location.city) {
      parts.push(location.city);
    }
    
    if (parts.length === 0 && location.zipCode) {
      parts.push(`Austin, TX ${location.zipCode}`);
    }
    
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }
  
  return 'Austin, TX area';
}

function getMatchTypeColor(type: string): string {
  switch (type) {
    case 'perfect_match': return 'bg-green-100 text-green-800';
    case 'good_fit': return 'bg-blue-100 text-blue-800';
    case 'worth_exploring': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function getMatchTypeIcon(type: string) {
  switch (type) {
    case 'perfect_match': return <FireIcon className="w-3 h-3" />;
    case 'good_fit': return <SparklesIcon className="w-3 h-3" />;
    default: return <SparklesIcon className="w-3 h-3" />;
  }
}

// Component to fit map bounds to show all markers
function MapBounds({ recommendations }: { recommendations: Recommendation[] }) {
  const map = useMap();

  useEffect(() => {
    const validCoords = recommendations
      .map(getRecommendationCoordinates)
      .filter(coords => coords !== null) as LatLngExpression[];

    if (validCoords.length > 0) {
      if (validCoords.length === 1) {
        map.setView(validCoords[0], 13);
      } else {
        const bounds = L.latLngBounds(validCoords);
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    } else {
      // Fallback to Austin center if no coordinates
      map.setView(AUSTIN_CENTER, DEFAULT_ZOOM);
    }
  }, [map, recommendations]);

  return null;
}

export default function RecommendationsMapInner({
  familyProfile,
  recommendations,
  selectedIds,
  onSelectionChange,
  className = ''
}: RecommendationsMapProps) {
  const [isClient, setIsClient] = useState(false);

  // Ensure we're on the client side before rendering the map
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className={`h-96 bg-neutral-10 rounded-xl flex items-center justify-center ${className}`}>
        <div className="text-neutral-60">Loading map...</div>
      </div>
    );
  }

  // Filter recommendations that have coordinates
  const mappableRecommendations = recommendations.filter(rec => 
    getRecommendationCoordinates(rec) !== null
  );

  const familyCoords = getFamilyCoordinates(familyProfile);

  return (
    <div className={`h-96 rounded-xl overflow-hidden border border-neutral-20 ${className}`}>
      <MapContainer
        center={AUSTIN_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <MapBounds recommendations={mappableRecommendations} />

        {/* Family location marker */}
        {familyCoords && (
          <Marker
            position={familyCoords}
            icon={createFamilyIcon()}
          >
            <Popup>
              <div className="p-2">
                <div className="font-semibold text-purple-800 mb-1">Your Family</div>
                <div className="text-sm text-neutral-60">
                  {[familyProfile.location.neighborhood, familyProfile.location.city]
                    .filter(Boolean).join(', ') || 'Austin, TX area'}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Recommendation markers */}
        {mappableRecommendations.map((recommendation) => {
          const coords = getRecommendationCoordinates(recommendation);
          if (!coords) return null;

          const isSelected = selectedIds.has(recommendation.providerId);
          const providerName = getProviderDisplayName(recommendation);
          const programName = getProgramDisplayName(recommendation);
          const price = getPriceDisplay(recommendation);
          const location = getLocationDisplay(recommendation);

          return (
            <Marker
              key={recommendation.providerId}
              position={coords}
              icon={createMarkerIcon(recommendation.recommendationType, isSelected)}
            >
              <Popup>
                <div className="p-3 min-w-[250px]">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-semibold text-neutral-100 text-sm mb-1">
                        {providerName}
                      </div>
                      <div className="text-xs text-neutral-60 mb-1">
                        {programName}
                      </div>
                      <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getMatchTypeColor(recommendation.recommendationType)}`}>
                        {getMatchTypeIcon(recommendation.recommendationType)}
                        <span>{recommendation.recommendationType.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onSelectionChange(recommendation.providerId, !isSelected)}
                      className={`ml-2 p-1 rounded-full transition-all duration-200 ${
                        isSelected 
                          ? 'bg-primary text-neutral-0' 
                          : 'bg-neutral-10 text-neutral-50 hover:bg-neutral-20'
                      }`}
                    >
                      {isSelected ? <HeartSolid className="w-4 h-4" /> : <HeartOutline className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Match Score */}
                  <div className="flex items-center space-x-1 mb-2">
                    <div className={`w-2 h-2 rounded-full ${
                      recommendation.matchScore > 0.8 ? 'bg-green-500' :
                      recommendation.matchScore > 0.6 ? 'bg-yellow-500' : 'bg-gray-500'
                    }`} />
                    <span className="text-xs text-neutral-60">
                      {Math.round(recommendation.matchScore * 100)}% match
                    </span>
                    {recommendation.metadata?.provider?.rating && (
                      <>
                        <span className="text-neutral-30">•</span>
                        <div className="flex items-center space-x-1">
                          <StarIcon className="w-3 h-3 text-yellow-500 fill-current" />
                          <span className="text-xs text-neutral-60">
                            {recommendation.metadata.provider.rating}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center space-x-1 text-neutral-60">
                      <MapPinIcon className="w-3 h-3" />
                      <span>{location}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-neutral-60">
                      <CurrencyDollarIcon className="w-3 h-3" />
                      <span>{price}</span>
                    </div>
                    {recommendation.metadata?.ageRange && (
                      <div className="flex items-center space-x-1 text-neutral-60">
                        <UsersIcon className="w-3 h-3" />
                        <span>Ages {recommendation.metadata.ageRange.min}-{recommendation.metadata.ageRange.max}</span>
                      </div>
                    )}
                  </div>

                  {/* Match Reasons */}
                  {recommendation.matchReasons.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-neutral-20">
                      <div className="text-xs text-neutral-50 mb-1">Why it matches:</div>
                      <div className="flex flex-wrap gap-1">
                        {recommendation.matchReasons.slice(0, 2).map((reason, index) => (
                          <span 
                            key={index}
                            className="text-xs bg-secondary/10 text-secondary px-1 py-0.5 rounded"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs">
        <div className="font-semibold text-neutral-900 mb-2">Legend</div>
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-emerald-600 border-2 border-white shadow-sm"></div>
            <span className="text-neutral-700">Perfect Match</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow-sm"></div>
            <span className="text-neutral-700">Good Fit</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-amber-600 border-2 border-white shadow-sm"></div>
            <span className="text-neutral-700">Worth Exploring</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-rose-600 border-2 border-white shadow-sm"></div>
            <span className="text-neutral-700">Selected</span>
          </div>
          {familyCoords && (
            <div className="flex items-center space-x-2 pt-1 border-t border-neutral-200 mt-1">
              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border-2 border-white shadow-sm"></div>
              <span className="text-neutral-700">Your Location</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3">
        <div className="text-sm font-semibold text-neutral-900 mb-1">Map View</div>
        <div className="text-xs text-neutral-600">
          {mappableRecommendations.length} of {recommendations.length} locations
        </div>
        {selectedIds.size > 0 && (
          <div className="text-xs text-rose-600 font-semibold mt-1">
            {selectedIds.size} selected
          </div>
        )}
        {recommendations.length > mappableRecommendations.length && (
          <div className="text-xs text-amber-600 mt-1 italic">
            {recommendations.length - mappableRecommendations.length} missing coordinates
          </div>
        )}
      </div>
    </div>
  );
}