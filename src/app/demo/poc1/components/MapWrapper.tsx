/**
 * MapWrapper - Dynamic wrapper for map components
 * 
 * WHY: SSR-safe map loading because:
 * - Leaflet requires browser APIs that aren't available during SSR
 * - Next.js dynamic imports prevent server-side execution
 * - Provides loading state during client-side hydration
 * - Prevents hydration mismatches between server and client
 */

'use client';

import dynamic from 'next/dynamic';
import type { FamilyProfile, Recommendation } from '@/types/ai';

interface MapWrapperProps {
  familyProfile: FamilyProfile;
  recommendations: Recommendation[];
  selectedIds: Set<string>;
  onSelectionChange: (providerId: string, selected: boolean) => void;
  className?: string;
}

// Dynamically import the map component with no SSR
const RecommendationsMapInner = dynamic(
  () => import('./RecommendationsMapInner'),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 bg-neutral-10 rounded-xl flex items-center justify-center border border-neutral-20">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
          <div className="text-neutral-60 text-sm">Loading map...</div>
        </div>
      </div>
    ),
  }
);

export default function MapWrapper(props: MapWrapperProps) {
  return <RecommendationsMapInner {...props} />;
}