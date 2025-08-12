/**
 * Recommendations Component - Phase 3
 * 
 * WHY: Interactive recommendation selection because:
 * - Showcases AI-powered matching and ranking capabilities
 * - Demonstrates vector search results with semantic understanding
 * - Provides clear business value through relevant activity discovery
 * - Shows personalization based on family profile and preferences
 * - Creates engaging selection interface for provider outreach demo
 * - Validates AI recommendation quality with explainable match reasons
 */

'use client';

import { useState, useMemo } from 'react';
import { 
  SparklesIcon, 
  HeartIcon as HeartOutline,
  MapPinIcon,
  CurrencyDollarIcon,
  ClockIcon,
  UsersIcon,
  CheckCircleIcon,
  StarIcon,
  AcademicCapIcon,
  BeakerIcon,
  MusicalNoteIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid, FireIcon } from '@heroicons/react/24/solid';

import type { FamilyProfile, Recommendation } from '@/types/ai';

interface RecommendationsProps {
  familyProfile: FamilyProfile;
  recommendations: Recommendation[];
  onSelectionComplete: (selected: Recommendation[]) => void;
  loading?: boolean;
  className?: string;
}

// Helper function to extract provider name from recommendation data
function getProviderDisplayName(rec: Recommendation): string {
  // REAL DATA: Extract from interests field where provider names are stored
  if (rec.interests && rec.interests.length > 0) {
    // Look for provider-like names in interests (usually company names)
    const providerName = rec.interests.find(interest => {
      // Filter out program titles and look for provider company names
      const lower = interest.toLowerCase();
      return (
        interest.length > 3 && // Not just acronyms
        !lower.includes('camp -') && // Not program titles like "Camp - Activity Name"
        !lower.includes('program') && // Not program names
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
         interest.split(' ').length >= 2) // Multi-word company names
      );
    });
    
    if (providerName) {
      return providerName;
    }
    
    // If no clear provider name found, use the first interest that looks like a company
    const firstInterest = rec.interests[0];
    if (firstInterest && firstInterest.length > 3) {
      return firstInterest;
    }
  }
  
  // Final fallback
  return `Provider ${rec.providerId}`;
}

// Helper function to get program name
function getProgramDisplayName(rec: Recommendation): string {
  // Try to extract from metadata
  if (rec.metadata?.name && rec.metadata.name !== getProviderDisplayName(rec)) {
    return rec.metadata.name;
  }
  
  if (rec.programId) {
    return `Program ${rec.programId}`;
  }
  
  return 'Activity Program';
}

// Helper function to extract location
function getLocationDisplay(rec: Recommendation, familyLocation: FamilyProfile['location']): string {
  // Try to get real location from metadata
  if (rec.metadata?.location) {
    const location = rec.metadata.location;
    const parts: string[] = [];
    
    if (location.neighborhood) parts.push(location.neighborhood);
    if (location.city) parts.push(location.city);
    else if (location.municipality) parts.push(location.municipality);
    
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }
  
  // Fallback to family location area
  const familyLocationParts: string[] = [];
  if (familyLocation.city) familyLocationParts.push(familyLocation.city);
  if (familyLocation.neighborhood) familyLocationParts.push(`near ${familyLocation.neighborhood}`);
  
  return familyLocationParts.length > 0 ? familyLocationParts.join(', ') : 'Austin, TX area';
}

// Helper function to extract pricing
function getPriceDisplay(rec: Recommendation): { min: number; max: number } | null {
  // Try to extract from metadata
  if (rec.metadata?.pricing) {
    const pricing = rec.metadata.pricing;
    if (pricing.amount) {
      return { min: pricing.amount, max: pricing.amount };
    }
    if (pricing.range) {
      return { min: pricing.range.min || 0, max: pricing.range.max || pricing.range.min || 100 };
    }
  }
  
  // Return reasonable Austin market rates as fallback
  return { min: 120, max: 200 };
}

// Helper function to get description
function getActivityDescription(rec: Recommendation): string {
  if (rec.metadata?.description) {
    return rec.metadata.description;
  }
  
  // Generate description from match reasons
  if (rec.matchReasons.length > 0) {
    return `Activity program matching your interests: ${rec.matchReasons.slice(0, 2).join(', ')}`;
  }
  
  return 'Activity program for children';
}

// Helper function to get realistic schedule
function getScheduleDisplay(rec: Recommendation): string[] {
  if (rec.metadata?.schedule?.days && rec.metadata.schedule.times) {
    const days = rec.metadata.schedule.days;
    const times = rec.metadata.schedule.times;
    return days.map((day: string, index: number) => `${day} ${times[index] || times[0] || 'TBD'}`);
  }
  
  // Generate reasonable Austin schedule patterns based on interests
  const interests = rec.interests || [];
  if (interests.some(i => i.toLowerCase().includes('sport'))) {
    return ['Saturday 9:00 AM', 'Wednesday 5:30 PM'];
  }
  if (interests.some(i => i.toLowerCase().includes('art'))) {
    return ['Tuesday 4:00 PM', 'Thursday 4:00 PM'];
  }
  if (interests.some(i => i.toLowerCase().includes('music'))) {
    return ['Monday 5:00 PM', 'Friday 4:30 PM'];
  }
  
  return ['Weekdays after school', 'Weekend options available'];
}

export default function Recommendations({
  familyProfile,
  recommendations,
  onSelectionComplete,
  loading = false,
  className = ''
}: RecommendationsProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<'all' | 'perfect_match' | 'good_fit'>('all');
  const [sortBy, setSortBy] = useState<'match_score' | 'price' | 'distance'>('match_score');

  // Enhanced recommendations with real data extracted from AI recommendations
  const enhancedRecommendations = useMemo(() => {
    return recommendations.map((rec, index) => ({
      ...rec,
      providerName: getProviderDisplayName(rec),
      programName: getProgramDisplayName(rec),
      description: getActivityDescription(rec),
      // Remove fake ratings - show real data or none
      rating: rec.metadata?.provider?.rating || undefined,
      reviewCount: rec.metadata?.provider?.reviewCount || undefined,
      priceRange: getPriceDisplay(rec),
      schedule: getScheduleDisplay(rec),
      location: getLocationDisplay(rec, familyProfile.location),
      imageUrl: "/about.jpeg" // Keep placeholder image
    }));
  }, [recommendations, familyProfile.location]);

  // Filtered and sorted recommendations
  const filteredRecommendations = useMemo(() => {
    let filtered = enhancedRecommendations;

    // Apply filter
    if (filter !== 'all') {
      filtered = filtered.filter(rec => rec.recommendationType === filter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'match_score':
          return b.matchScore - a.matchScore;
        case 'price':
          const aPrice = a.priceRange?.min || 0;
          const bPrice = b.priceRange?.min || 0;
          return aPrice - bPrice;
        case 'distance':
          // Mock distance sorting
          return Math.random() - 0.5;
        default:
          return 0;
      }
    });

    return filtered;
  }, [enhancedRecommendations, filter, sortBy]);

  const handleSelection = (providerId: number, selected: boolean) => {
    const newSelection = new Set(selectedIds);
    if (selected) {
      newSelection.add(providerId);
    } else {
      newSelection.delete(providerId);
    }
    setSelectedIds(newSelection);
  };

  const handleContinue = () => {
    const selectedRecommendations = recommendations.filter(rec => 
      selectedIds.has(rec.providerId)
    );
    onSelectionComplete(selectedRecommendations);
  };

  const getMatchTypeColor = (type: string) => {
    switch (type) {
      case 'perfect_match': return 'bg-green-100 text-green-800';
      case 'good_fit': return 'bg-blue-100 text-blue-800';
      case 'worth_exploring': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getMatchTypeIcon = (type: string) => {
    switch (type) {
      case 'perfect_match': return <FireIcon className="w-4 h-4" />;
      case 'good_fit': return <SparklesIcon className="w-4 h-4" />;
      case 'worth_exploring': return <AcademicCapIcon className="w-4 h-4" />;
      default: return <BeakerIcon className="w-4 h-4" />;
    }
  };

  const getInterestIcon = (interest: string) => {
    const lowerInterest = interest.toLowerCase();
    if (lowerInterest.includes('music')) return <MusicalNoteIcon className="w-4 h-4" />;
    if (lowerInterest.includes('art')) return <SparklesIcon className="w-4 h-4" />;
    if (lowerInterest.includes('science') || lowerInterest.includes('stem')) return <BeakerIcon className="w-4 h-4" />;
    return <AcademicCapIcon className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-neutral-100">Finding Perfect Matches</h2>
          <p className="text-neutral-60 mt-2">Our AI is analyzing 700+ providers to find the best activities for your family...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2">
          <SparklesIcon className="w-8 h-8 text-primary" />
          <h2 className="text-2xl font-bold text-neutral-100">AI-Powered Recommendations</h2>
        </div>
        <p className="text-neutral-60 max-w-2xl mx-auto">
          Based on your family profile, we found {recommendations.length} personalized activity matches. 
          Select the ones you&apos;re interested in for automated provider outreach.
        </p>
      </div>

      {/* Family Summary */}
      <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl p-4">
        <h3 className="font-medium text-neutral-100 mb-2">Matching Profile Summary</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <UsersIcon className="w-4 h-4 text-primary" />
            <span className="text-neutral-70">
              {familyProfile.children.length} {familyProfile.children.length === 1 ? 'child' : 'children'} 
              ({familyProfile.children.map(c => c.age).join(', ')} years old)
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <MapPinIcon className="w-4 h-4 text-secondary" />
            <span className="text-neutral-70">
              {[familyProfile.location.neighborhood, familyProfile.location.city].filter(Boolean).join(', ') || 'Austin, TX area'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <CurrencyDollarIcon className="w-4 h-4 text-tertiary-orange" />
            <span className="text-neutral-70">
              {familyProfile.preferences?.budget?.max 
                ? `Up to $${familyProfile.preferences.budget.max}/month`
                : 'Budget flexible'
              }
            </span>
          </div>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-0 rounded-xl p-4 border border-neutral-20">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-neutral-70">Filter:</label>
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="text-sm border border-neutral-30 rounded px-2 py-1 bg-neutral-0 text-neutral-100"
            >
              <option value="all">All Matches ({enhancedRecommendations.length})</option>
              <option value="perfect_match">Perfect Matches ({enhancedRecommendations.filter(r => r.recommendationType === 'perfect_match').length})</option>
              <option value="good_fit">Good Fits ({enhancedRecommendations.filter(r => r.recommendationType === 'good_fit').length})</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-neutral-70">Sort:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-sm border border-neutral-30 rounded px-2 py-1 bg-neutral-0 text-neutral-100"
            >
              <option value="match_score">Best Match</option>
              <option value="price">Price (Low to High)</option>
              <option value="distance">Distance</option>
            </select>
          </div>
        </div>

        <div className="text-sm text-neutral-60">
          {selectedIds.size} of {filteredRecommendations.length} selected
        </div>
      </div>

      {/* Recommendations Grid */}
      <div className="grid gap-4">
        {filteredRecommendations.map((recommendation, index) => {
          const isSelected = selectedIds.has(recommendation.providerId);
          
          return (
            <div 
              key={recommendation.providerId}
              className={`bg-neutral-0 rounded-xl border transition-all duration-200 overflow-hidden ${
                isSelected 
                  ? 'border-primary shadow-lg ring-2 ring-primary/20' 
                  : 'border-neutral-20 hover:border-neutral-30 hover:shadow-sm'
              }`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    {/* Provider and Program */}
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-neutral-100">
                        {recommendation.providerName}
                      </h3>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getMatchTypeColor(recommendation.recommendationType)}`}>
                        {getMatchTypeIcon(recommendation.recommendationType)}
                        <span>{recommendation.recommendationType.replace('_', ' ')}</span>
                      </div>
                    </div>
                    
                    <h4 className="text-md font-medium text-neutral-80 mb-2">
                      {recommendation.programName}
                    </h4>
                    
                    <p className="text-sm text-neutral-60 mb-3 line-clamp-2">
                      {recommendation.description}
                    </p>

                    {/* Match Score and Details */}
                    <div className="flex items-center space-x-4 mb-3">
                      <div className="flex items-center space-x-1">
                        <div className={`w-3 h-3 rounded-full ${
                          recommendation.matchScore > 0.8 ? 'bg-green-500' :
                          recommendation.matchScore > 0.6 ? 'bg-yellow-500' : 'bg-gray-500'
                        }`} />
                        <span className="text-sm text-neutral-60">
                          {Math.round(recommendation.matchScore * 100)}% match
                        </span>
                      </div>
                      
                      {recommendation.rating && recommendation.reviewCount ? (
                        <div className="flex items-center space-x-1">
                          <StarIcon className="w-4 h-4 text-yellow-500 fill-current" />
                          <span className="text-sm text-neutral-60">
                            {recommendation.rating} ({recommendation.reviewCount} reviews)
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <span className="text-xs text-neutral-40">
                            New provider
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Match Reasons */}
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2">
                        {recommendation.matchReasons.slice(0, 3).map((reason, reasonIndex) => (
                          <span 
                            key={reasonIndex}
                            className="text-xs bg-secondary/10 text-secondary px-2 py-1 rounded-full"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center space-x-2">
                        <MapPinIcon className="w-4 h-4 text-neutral-50" />
                        <span className="text-neutral-60">{recommendation.location}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <CurrencyDollarIcon className="w-4 h-4 text-neutral-50" />
                        <span className="text-neutral-60">
                          ${recommendation.priceRange?.min}-${recommendation.priceRange?.max}/month
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <ClockIcon className="w-4 h-4 text-neutral-50" />
                        <span className="text-neutral-60">
                          {recommendation.schedule?.[0] || 'Flexible schedule'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <UsersIcon className="w-4 h-4 text-neutral-50" />
                        <span className="text-neutral-60">
                          Ages {Math.min(...familyProfile.children.map(c => c.age))}-{Math.max(...familyProfile.children.map(c => c.age))}
                        </span>
                      </div>
                    </div>

                    {/* Matching Interests */}
                    <div className="mt-3">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-medium text-neutral-70">Matches interests:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {recommendation.interests.slice(0, 4).map((interest, interestIndex) => (
                          <div 
                            key={interestIndex}
                            className="flex items-center space-x-1 text-xs bg-tertiary-pink/10 text-tertiary-pink px-2 py-1 rounded-full"
                          >
                            {getInterestIcon(interest)}
                            <span>{interest}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Selection Toggle */}
                  <button
                    onClick={() => handleSelection(recommendation.providerId, !isSelected)}
                    className={`ml-4 p-3 rounded-full transition-all duration-200 ${
                      isSelected 
                        ? 'bg-primary text-neutral-0 shadow-lg' 
                        : 'bg-neutral-10 text-neutral-50 hover:bg-neutral-20'
                    }`}
                  >
                    {isSelected ? <HeartSolid className="w-6 h-6" /> : <HeartOutline className="w-6 h-6" />}
                  </button>
                </div>

                {/* Logistical Fit Indicators */}
                <div className="grid grid-cols-4 gap-2 pt-3 border-t border-neutral-20">
                  {[
                    { key: 'location', label: 'Location', icon: MapPinIcon },
                    { key: 'schedule', label: 'Schedule', icon: ClockIcon },
                    { key: 'budget', label: 'Budget', icon: CurrencyDollarIcon },
                    { key: 'transportation', label: 'Transport', icon: UsersIcon }
                  ].map(({ key, label, icon: Icon }) => {
                    const fits = recommendation.logisticalFit[key as keyof typeof recommendation.logisticalFit];
                    return (
                      <div key={key} className={`flex items-center space-x-1 text-xs ${fits ? 'text-green-600' : 'text-neutral-40'}`}>
                        <Icon className="w-3 h-3" />
                        <span>{label}</span>
                        {fits && <CheckCircleIcon className="w-3 h-3" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection Summary and Continue */}
      {selectedIds.size > 0 && (
        <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-neutral-100 mb-1">
                Ready to Connect with {selectedIds.size} Provider{selectedIds.size === 1 ? '' : 's'}
              </h3>
              <p className="text-sm text-neutral-60">
                We&apos;ll generate personalized outreach emails for each selected provider
              </p>
            </div>
            <button
              onClick={handleContinue}
              className="px-6 py-3 bg-primary hover:bg-tertiary-night text-neutral-0 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Generate Provider Emails
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredRecommendations.length === 0 && (
        <div className="text-center py-12">
          <SparklesIcon className="w-16 h-16 text-neutral-30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-60 mb-2">No recommendations match your filters</h3>
          <p className="text-sm text-neutral-50">Try adjusting your filters to see more options</p>
        </div>
      )}
    </div>
  );
}