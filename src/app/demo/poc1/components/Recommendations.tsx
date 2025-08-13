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

import { useState, useMemo, useCallback } from 'react';
import { getProviderImageUrl } from '../utils/imageUtils';
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
  MusicalNoteIcon,
  Squares2X2Icon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid, FireIcon } from '@heroicons/react/24/solid';
import Image from 'next/image';

import type { FamilyProfile, Recommendation } from '@/types/ai';
import RecommendationsMap from './MapWrapper';
import { addMockCoordinates } from '@/utils/mockCoordinates';

interface RecommendationsProps {
  familyProfile: FamilyProfile;
  recommendations: Recommendation[];
  onSelectionComplete: (selected: Recommendation[]) => void;
  loading?: boolean;
  className?: string;
  recommendationType?: string;
}

// Helper function to extract provider name from recommendation data
function getProviderDisplayName(rec: Recommendation): string {
  // Primary: Use provider name from metadata if available
  if (rec.metadata?.provider?.name) {
    return rec.metadata.provider.name;
  }
  
  // Secondary: Try to extract from interests field (legacy data)
  if (rec.interests && rec.interests.length > 0) {
    // Look for provider-like names in interests
    const providerName = rec.interests.find(interest => {
      const lower = interest.toLowerCase();
      return (
        interest.length > 3 && // Not just acronyms
        !lower.includes('camp -') && // Not program titles
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
         interest.split(' ').length >= 2) // Multi-word company names
      );
    });
    
    if (providerName) {
      return providerName;
    }
  }
  
  // Final fallback
  return `Provider ${rec.providerId}`;
}

// Helper function to get program/activity name
function getProgramDisplayName(rec: Recommendation): string {
  // Primary: Use activity/program name from metadata
  if (rec.metadata?.name) {
    return rec.metadata.name;
  }
  
  // Secondary: Use programId if available
  if (rec.programId) {
    return `Program ${rec.programId}`;
  }
  
  // Fallback
  return 'Activity Program';
}

// Helper function to get category display
function getCategoryDisplay(rec: Recommendation): string {
  if (rec.metadata?.category) {
    // Format category name nicely
    return rec.metadata.category
      .split('_')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  return 'General Activity';
}

// Helper function to get age range display
function getAgeRangeDisplay(rec: Recommendation): string {
  if (rec.metadata?.ageRange) {
    const { min, max } = rec.metadata.ageRange;
    
    // Special cases for common ranges
    if (min === 0 && max === 18) {
      return 'Ages 18 and under';
    }
    if (min === 5 && max === 99) {
      return 'All ages (5+)';
    }
    if (min === 8 && max === 99) {
      return 'Ages 8+';
    }
    if (min === 18 && max === 99) {
      return 'Adults (18+)';
    }
    if (min === 0 && max === 99) {
      return 'All ages';
    }
    
    // Standard age ranges
    if (min === max) {
      return `Age ${min}`;
    }
    return `Ages ${min}-${max}`;
  }
  return 'Age info not available';
}

// Helper function to extract location
function getLocationDisplay(rec: Recommendation): string {
  // Primary: Use location from metadata
  if (rec.metadata?.location) {
    const location = rec.metadata.location;
    const parts: string[] = [];
    
    // Build location string from available fields
    if (location.neighborhood) {
      parts.push(location.neighborhood);
    }
    if (location.city) {
      parts.push(location.city);
    }
    
    // Include zipCode if no other location info
    if (parts.length === 0 && location.zipCode) {
      parts.push(`Austin, TX ${location.zipCode}`);
    }
    
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }
  
  // Fallback
  return 'Austin, TX area';
}

// Helper function to extract pricing
function getPriceDisplay(rec: Recommendation): string {
  // Primary: Use pricing from metadata
  if (rec.metadata?.pricing) {
    const pricing = rec.metadata.pricing;
    
    // Free activities
    if (pricing.type === 'free') {
      return 'Free';
    }
    
    // Fixed amount
    if (pricing.amount) {
      const period = pricing.type?.replace('per_', '').replace('_', ' ') || 'month';
      return `$${pricing.amount}/${period}`;
    }
    
    // Price range
    if (pricing.range) {
      const min = pricing.range.min || 0;
      const max = pricing.range.max || pricing.range.min || 0;
      if (min === max) {
        return `$${min}/month`;
      }
      return `$${min}-${max}/month`;
    }
  }
  
  // Fallback
  return 'Contact for pricing';
}

// Helper function to get description
function getActivityDescription(rec: Recommendation): string {
  // Primary: Use description from metadata
  if (rec.metadata?.description) {
    return rec.metadata.description;
  }
  
  // Secondary: Generate description from match reasons
  if (rec.matchReasons.length > 0) {
    return `Activity program matching your interests: ${rec.matchReasons.slice(0, 2).join(', ')}`;
  }
  
  // Fallback
  return 'Activity program for children';
}

// Helper function to get realistic schedule
function getScheduleDisplay(rec: Recommendation): string {
  // Primary: Use schedule from metadata
  if (rec.metadata?.schedule) {
    const schedule = rec.metadata.schedule;
    
    // If we have specific days and times
    if (schedule.days && schedule.days.length > 0) {
      const days = schedule.days.slice(0, 2).join(', ');
      if (schedule.times && schedule.times.length > 0) {
        return `${days} at ${schedule.times[0]}`;
      }
      return days;
    }
    
    // Flexibility indicator
    if (schedule.flexibility === 'very_flexible') {
      return 'Very flexible schedule';
    } else if (schedule.flexibility === 'flexible') {
      return 'Flexible schedule';
    }
  }
  
  // Fallback
  return 'Schedule varies';
}

export default function Recommendations({
  familyProfile,
  recommendations,
  onSelectionComplete,
  loading = false,
  className = '',
  recommendationType
}: RecommendationsProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'perfect_match' | 'good_fit'>('all');
  const [sortBy, setSortBy] = useState<'match_score' | 'price' | 'distance'>('match_score');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  // Helper function to get filtered family profile based on recommendation type
  const getFilteredFamilyProfile = (profile: FamilyProfile, type?: string): FamilyProfile => {
    if (!type || type === 'family') {
      return profile; // Return full profile for family recommendations
    }
    
    if (type === 'all_kids') {
      // Return profile with only children, no adults
      return {
        ...profile,
        adults: [],
        children: profile.children
      };
    }
    
    // Check if it's a specific child name
    const specificChild = profile.children.find(c => 
      c.name.toLowerCase() === type.toLowerCase()
    );
    
    if (specificChild) {
      // Return profile with only this specific child
      return {
        ...profile,
        adults: [],
        children: [specificChild]
      };
    }
    
    // Default fallback to full profile
    return profile;
  };

  // Get the display profile based on recommendation type
  const displayProfile = getFilteredFamilyProfile(familyProfile, recommendationType);

  // Enhanced recommendations with real data extracted from AI recommendations
  const enhancedRecommendations = useMemo(() => {
    // Add mock coordinates for testing map functionality
    const recommendationsWithCoords = addMockCoordinates(recommendations);
    
    return recommendationsWithCoords.map((rec, index) => ({
      ...rec,
      providerName: getProviderDisplayName(rec),
      programName: getProgramDisplayName(rec),
      description: getActivityDescription(rec),
      // Use real ratings if available
      rating: rec.metadata?.provider?.rating || undefined,
      reviewCount: rec.metadata?.provider?.reviewCount || undefined,
      price: getPriceDisplay(rec),
      schedule: getScheduleDisplay(rec),
      location: getLocationDisplay(rec),
      category: getCategoryDisplay(rec),
      ageRange: getAgeRangeDisplay(rec),
      imageUrl: getProviderImageUrl(
        rec.metadata?.provider?.coverImageFileName,
        {
          providerId: rec.metadata?.provider?.id,
          providerName: getProviderDisplayName(rec),
          category: getCategoryDisplay(rec),
          imageType: 'cover'
        }
      ),
      logoUrl: rec.metadata?.provider?.logoFileName
    }));
  }, [recommendations]);

  // Filtered and sorted recommendations
  const filteredRecommendations = useMemo(() => {
    let filtered = enhancedRecommendations;

    // Apply match type filter
    if (filter !== 'all') {
      filtered = filtered.filter(rec => rec.recommendationType === filter);
    }


    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'match_score':
          return b.matchScore - a.matchScore;
        case 'price':
          const aPrice = a.metadata?.pricing?.amount || 0;
          const bPrice = b.metadata?.pricing?.amount || 0;
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

  const handleSelection = (providerId: string, selected: boolean) => {
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
      case 'perfect_match': return 'bg-accent-pink/10 text-accent-pink border border-accent-pink/20';
      case 'good_fit': return 'bg-primary/10 text-primary border border-primary/20';
      case 'worth_exploring': return 'bg-secondary/10 text-secondary border border-secondary/20';
      default: return 'bg-accent-teal/10 text-accent-teal border border-accent-teal/20';
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
        <div className="flex items-center justify-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl">
            <SparklesIcon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent-teal bg-clip-text text-transparent">
            AI-Powered Recommendations
          </h2>
        </div>
        <p className="text-neutral-60 max-w-2xl mx-auto leading-relaxed">
          Based on your family profile, we found <span className="font-semibold text-primary">{recommendations.length}</span> personalized activity matches. 
          Select the ones you&apos;re interested in for automated provider outreach.
        </p>
      </div>

      {/* Family Summary */}
      <div className="bg-gradient-to-r from-primary/5 via-secondary/5 to-accent-teal/5 rounded-2xl p-6 border border-primary/10">
        <h3 className="font-semibold text-neutral-100 mb-4 text-lg">
          {recommendationType === 'all_kids' ? 'Searching for All Children' :
           recommendationType && displayProfile.children.length === 1 ? `Searching for ${displayProfile.children[0].name}` :
           'Matching Profile Summary'}
        </h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center space-x-3 p-3 bg-neutral-0/50 rounded-lg">
            <UsersIcon className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="text-neutral-70 font-medium leading-relaxed">
              {displayProfile.children.length === 1 ? (
                <>
                  1 child: {displayProfile.children[0].name} ({displayProfile.children[0].age})
                  {displayProfile.children[0].interests && displayProfile.children[0].interests.length > 0 && (
                    <> - {displayProfile.children[0].interests.join(', ')}</>
                  )}
                </>
              ) : (
                <>
                  {displayProfile.children.length} children: {displayProfile.children.map(c => {
                    const interests = c.interests && c.interests.length > 0 
                      ? ` - ${c.interests.slice(0, 2).join(', ')}`
                      : '';
                    return `${c.name} (${c.age}${interests})`;
                  }).join(', ')}
                </>
              )}
            </span>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-neutral-0/50 rounded-lg">
            <MapPinIcon className="w-5 h-5 text-accent-teal flex-shrink-0" />
            <span className="text-neutral-70 font-medium">
              {[familyProfile.location.neighborhood, familyProfile.location.city].filter(Boolean).join(', ') || 'Austin, TX area'}
            </span>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-neutral-0/50 rounded-lg">
            <CurrencyDollarIcon className="w-5 h-5 text-accent-orange flex-shrink-0" />
            <span className="text-neutral-70 font-medium">
              {familyProfile.preferences?.budget?.max 
                ? `Up to $${familyProfile.preferences.budget.max}/month`
                : 'Budget flexible'
              }
            </span>
          </div>
        </div>
      </div>


      {/* View Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center bg-gradient-to-r from-neutral-10 to-neutral-20 rounded-xl p-1.5 border border-neutral-30">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
              viewMode === 'grid'
                ? 'bg-gradient-to-r from-primary to-accent-teal text-neutral-0 shadow-lg scale-105'
                : 'text-neutral-60 hover:text-primary hover:bg-neutral-0/50'
            }`}
          >
            <Squares2X2Icon className="w-4 h-4" />
            <span>Grid View</span>
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
              viewMode === 'map'
                ? 'bg-gradient-to-r from-primary to-accent-teal text-neutral-0 shadow-lg scale-105'
                : 'text-neutral-60 hover:text-primary hover:bg-neutral-0/50'
            }`}
          >
            <MapPinIcon className="w-4 h-4" />
            <span>Map View</span>
          </button>
        </div>

        <div className="text-sm font-medium">
          <span className="text-primary font-semibold">{selectedIds.size}</span> of <span className="text-neutral-70">{filteredRecommendations.length}</span> selected
        </div>
      </div>

      {/* Filters and Sort - Only show in grid view */}
      {viewMode === 'grid' && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-neutral-0 to-neutral-5 rounded-2xl p-6 border border-neutral-20 shadow-sm">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <label className="text-sm font-semibold text-neutral-80">Filter:</label>
              <select 
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="text-sm border border-primary/30 rounded-lg px-3 py-2 bg-neutral-0 text-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
              >
                <option value="all">All Matches ({enhancedRecommendations.length})</option>
                <option value="perfect_match">Perfect Matches ({enhancedRecommendations.filter(r => r.recommendationType === 'perfect_match').length})</option>
                <option value="good_fit">Good Fits ({enhancedRecommendations.filter(r => r.recommendationType === 'good_fit').length})</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-3">
              <label className="text-sm font-semibold text-neutral-80">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-sm border border-primary/30 rounded-lg px-3 py-2 bg-neutral-0 text-neutral-100 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
              >
                <option value="match_score">Best Match</option>
                <option value="price">Price (Low to High)</option>
                <option value="distance">Distance</option>
              </select>
            </div>
          </div>

          <div className="text-sm font-medium bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/20">
            Showing {filteredRecommendations.length} results
          </div>
        </div>
      )}

      {/* Content Area */}
      {viewMode === 'grid' ? (
        /* Recommendations Grid */
        <div className="grid gap-4 sm:gap-6 lg:gap-8">
          {filteredRecommendations.map((recommendation, index) => {
          const isSelected = selectedIds.has(recommendation.providerId);
          
          return (
            <div 
              key={recommendation.providerId}
              className={`bg-neutral-0 rounded-2xl border transition-all duration-300 overflow-hidden shadow-sm hover:shadow-lg ${
                isSelected 
                  ? 'border-primary shadow-xl ring-2 ring-primary/30 scale-[1.02]' 
                  : 'border-neutral-20 hover:border-primary/30'
              }`}
            >
              {/* Provider Image Section */}
              <div className="relative h-64 sm:h-52 md:h-48 lg:h-56 xl:h-52 overflow-hidden">
                {recommendation.imageUrl && !failedImages.has(recommendation.providerId) ? (
                  <Image
                    src={recommendation.imageUrl}
                    alt={`${recommendation.providerName} cover image`}
                    fill
                    className="object-cover transition-transform duration-300 hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                    priority={index < 3}
                    onError={() => {
                      setFailedImages(prev => new Set(prev).add(recommendation.providerId));
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 via-secondary/20 to-accent-teal/20 flex items-center justify-center">
                    <PhotoIcon className="w-16 h-16 text-neutral-40" />
                    <span className="absolute bottom-4 left-4 text-xs text-neutral-50 bg-neutral-0/80 px-2 py-1 rounded">
                      No image available
                    </span>
                  </div>
                )}
                
                {/* Overlay with provider logo if available */}
                {recommendation.logoUrl && (
                  <div className="absolute bottom-4 left-4 w-12 h-12 bg-neutral-0 rounded-lg shadow-lg p-1">
                    <Image
                      src={recommendation.logoUrl}
                      alt={`${recommendation.providerName} logo`}
                      fill
                      className="object-contain rounded-md"
                    />
                  </div>
                )}
                
                {/* Selection Toggle - moved to image overlay */}
                <button
                  onClick={() => handleSelection(recommendation.providerId, !isSelected)}
                  className={`absolute top-4 right-4 p-3 rounded-full transition-all duration-200 backdrop-blur-sm ${
                    isSelected 
                      ? 'bg-primary text-neutral-0 shadow-lg scale-110' 
                      : 'bg-neutral-0/90 text-neutral-50 hover:bg-neutral-0 hover:text-primary hover:scale-105'
                  }`}
                >
                  {isSelected ? <HeartSolid className="w-5 h-5" /> : <HeartOutline className="w-5 h-5" />}
                </button>
              </div>
              
              <div className="p-4 sm:p-6">
                {/* Header Section */}
                <div className="mb-4">
                  {/* Provider and Program */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-neutral-100 mb-1">
                        {recommendation.providerName}
                      </h3>
                      <h4 className="text-lg font-semibold text-neutral-70 mb-2">
                        {recommendation.programName}
                      </h4>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 ${getMatchTypeColor(recommendation.recommendationType)}`}>
                      {getMatchTypeIcon(recommendation.recommendationType)}
                      <span className="capitalize">{recommendation.recommendationType.replace('_', ' ')}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3 mb-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-accent-teal/10 text-accent-teal border border-accent-teal/20">
                      {recommendation.category}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-accent-orange/10 text-accent-orange border border-accent-orange/20">
                      {recommendation.ageRange}
                    </span>
                  </div>
                  
                  <p className="text-sm text-neutral-60 mb-4 line-clamp-2 leading-relaxed">
                    {recommendation.description}
                  </p>

                  {/* Match Score and Details */}
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="flex items-center space-x-2 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-full px-3 py-1.5">
                      <div className={`w-3 h-3 rounded-full ${
                        recommendation.matchScore > 0.8 ? 'bg-accent-pink shadow-lg shadow-accent-pink/30' :
                        recommendation.matchScore > 0.6 ? 'bg-secondary shadow-lg shadow-secondary/30' : 
                        'bg-accent-teal shadow-lg shadow-accent-teal/30'
                      }`} />
                      <span className="text-sm font-semibold text-primary">
                        {Math.round(recommendation.matchScore * 100)}% match
                      </span>
                    </div>
                    
                    {recommendation.rating && recommendation.reviewCount ? (
                      <div className="flex items-center space-x-1.5 bg-secondary/10 rounded-full px-3 py-1.5">
                        <StarIcon className="w-4 h-4 text-secondary fill-current" />
                        <span className="text-sm font-semibold text-secondary">
                          {recommendation.rating} ({recommendation.reviewCount})
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs px-2 py-1 bg-neutral-10 text-neutral-50 rounded-full">
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
                          className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full font-medium border border-primary/20"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center space-x-3 p-3 bg-neutral-5 rounded-lg">
                      <MapPinIcon className="w-5 h-5 text-accent-teal flex-shrink-0" />
                      <span className="text-neutral-70 font-medium">{recommendation.location}</span>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-neutral-5 rounded-lg">
                      <CurrencyDollarIcon className="w-5 h-5 text-accent-orange flex-shrink-0" />
                      <span className="text-neutral-70 font-medium">
                        {recommendation.price}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-neutral-5 rounded-lg">
                      <ClockIcon className="w-5 h-5 text-accent-pink flex-shrink-0" />
                      <span className="text-neutral-70 font-medium">
                        {recommendation.schedule}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 p-3 bg-neutral-5 rounded-lg">
                      <UsersIcon className="w-5 h-5 text-primary flex-shrink-0" />
                      <span className="text-neutral-70 font-medium">
                        {recommendation.ageRange}
                      </span>
                    </div>
                  </div>

                  {/* Matching Interests */}
                  <div className="mt-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm font-semibold text-neutral-80">Matching interests:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recommendation.interests.slice(0, 4).map((interest, interestIndex) => (
                        <div 
                          key={interestIndex}
                          className="flex items-center space-x-1.5 text-xs bg-gradient-to-r from-accent-pink/10 to-accent-teal/10 text-accent-pink px-3 py-1.5 rounded-full border border-accent-pink/20 font-medium"
                        >
                          {getInterestIcon(interest)}
                          <span>{interest}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Logistical Fit Indicators */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-neutral-10">
                  {[
                    { key: 'location', label: 'Location', icon: MapPinIcon, colorClass: (fits: boolean) => fits ? 'bg-accent-teal/10 text-accent-teal border-accent-teal/20' : 'bg-neutral-10 text-neutral-40 border-neutral-20' },
                    { key: 'schedule', label: 'Schedule', icon: ClockIcon, colorClass: (fits: boolean) => fits ? 'bg-accent-pink/10 text-accent-pink border-accent-pink/20' : 'bg-neutral-10 text-neutral-40 border-neutral-20' },
                    { key: 'budget', label: 'Budget', icon: CurrencyDollarIcon, colorClass: (fits: boolean) => fits ? 'bg-accent-orange/10 text-accent-orange border-accent-orange/20' : 'bg-neutral-10 text-neutral-40 border-neutral-20' },
                    { key: 'transportation', label: 'Transport', icon: UsersIcon, colorClass: (fits: boolean) => fits ? 'bg-primary/10 text-primary border-primary/20' : 'bg-neutral-10 text-neutral-40 border-neutral-20' }
                  ].map(({ key, label, icon: Icon, colorClass }) => {
                    const fits = recommendation.logisticalFit[key as keyof typeof recommendation.logisticalFit];
                    return (
                      <div key={key} className={`flex items-center justify-center space-x-1.5 text-xs p-2 rounded-lg transition-all duration-200 border ${colorClass(fits)}`}>
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{label}</span>
                        {fits && <CheckCircleIcon className="w-4 h-4" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      ) : (
        /* Map View */
        <RecommendationsMap
          familyProfile={displayProfile}
          recommendations={filteredRecommendations}
          selectedIds={selectedIds}
          onSelectionChange={handleSelection}
          className="w-full"
        />
      )}

      {/* Selection Summary and Continue */}
      {selectedIds.size > 0 && (
        <div className="bg-gradient-to-r from-primary/5 via-secondary/5 to-accent-teal/5 rounded-2xl border border-primary/20 p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-xl text-neutral-100 mb-2">
                Ready to Connect with <span className="text-primary">{selectedIds.size}</span> Provider{selectedIds.size === 1 ? '' : 's'}
              </h3>
              <p className="text-sm text-neutral-70 leading-relaxed">
                We&apos;ll generate personalized outreach emails for each selected provider
              </p>
            </div>
            <button
              onClick={handleContinue}
              className="px-6 py-3 bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-accent-teal text-neutral-0 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 transform"
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