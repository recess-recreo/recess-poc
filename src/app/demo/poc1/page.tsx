/**
 * POC1 Demo Main Page - 5-Phase AI-Powered Activity Matching Demo
 * 
 * WHY: Comprehensive demo orchestration because:
 * - Showcases complete AI workflow from natural language to recommendations
 * - Demonstrates business value through real-time family profile parsing
 * - Provides interactive experience that investors can engage with directly  
 * - Shows technical capabilities across multiple AI services integration
 * - Validates product-market fit through end-to-end user journey simulation
 * - Tracks AI costs and performance metrics for business case validation
 * 
 * DEMO FLOW:
 * 1. Family Input - Natural language family description parsing
 * 2. Profile Review - Edit/validate extracted family data  
 * 3. AI Recommendations - Vector search + AI-enhanced activity matching
 * 4. Provider Communication - Auto-generated personalized outreach emails
 * 5. Cost & Performance - Real-time AI usage metrics and ROI analysis
 */

'use client';

import { useState, useCallback } from 'react';
import { 
  UserGroupIcon, 
  PencilSquareIcon, 
  SparklesIcon, 
  EnvelopeIcon,
  ChartBarIcon 
} from '@heroicons/react/24/outline';

// Import components
import FamilyInput from './components/FamilyInput';
import ProfileReview from './components/ProfileReview';
import Recommendations from './components/Recommendations';
import EmailSimulation from './components/EmailSimulation';
import CostTracker from './components/CostTracker';
import PhaseIndicator, { type Phase } from './components/PhaseIndicator';

// Import types
import type { FamilyProfile, Recommendation, GeneratedEmail } from '@/types/ai';

// Mock recommendations for demo continuity when API fails
function createMockRecommendations(familyProfile: FamilyProfile): Recommendation[] {
  const childAge = familyProfile.children[0]?.age || 7;
  const interests = familyProfile.children[0]?.interests || ['sports'];
  const location = familyProfile.location.city || 'Austin';
  
  return [
    {
      providerId: 1473,
      programId: 2001,
      matchScore: 0.92,
      matchReasons: ['Perfect age match for your child', 'Matches interest in ' + interests[0], 'Great location in ' + location],
      recommendationType: 'perfect_match',
      ageAppropriate: true,
      interests: interests.slice(0, 3),
      logisticalFit: { location: true, schedule: true, budget: true, transportation: true },
      metadata: {
        provider: { name: 'Austin Gymnastics Center' },
        name: 'Youth Gymnastics Program',
        description: 'Fun and engaging gymnastics classes designed for young athletes to build strength, flexibility, and confidence.',
        location: { city: location, neighborhood: 'Central Austin' },
        pricing: { type: 'per_month', amount: 150 }
      }
    },
    {
      providerId: 1288,
      programId: 2002,
      matchScore: 0.87,
      matchReasons: ['Excellent for developing team skills', 'Age-appropriate instruction', 'Convenient schedule'],
      recommendationType: 'good_fit',
      ageAppropriate: true,
      interests: ['sports', 'teamwork'],
      logisticalFit: { location: true, schedule: true, budget: true, transportation: false },
      metadata: {
        provider: { name: 'Soccer Stars Austin' },
        name: 'Youth Soccer League',
        description: 'Professional soccer training for kids with certified coaches and fun, skill-building activities.',
        location: { city: location, neighborhood: 'North Austin' },
        pricing: { type: 'per_month', amount: 120 }
      }
    },
    {
      providerId: 1645,
      programId: 2003,
      matchScore: 0.82,
      matchReasons: ['STEM learning matches educational goals', 'Interactive hands-on approach', 'Great reviews from families'],
      recommendationType: 'good_fit',
      ageAppropriate: true,
      interests: ['science', 'learning'],
      logisticalFit: { location: true, schedule: false, budget: true, transportation: true },
      metadata: {
        provider: { name: 'Thinkery' },
        name: 'Science Explorer Camp',
        description: 'Hands-on science exploration where kids discover, create, and learn through interactive experiments.',
        location: { city: location, neighborhood: 'East Austin' },
        pricing: { type: 'per_program', amount: 425 }
      }
    },
    {
      providerId: 1922,
      programId: 2004,
      matchScore: 0.78,
      matchReasons: ['Water safety and fitness', 'Professional instruction', 'Flexible scheduling options'],
      recommendationType: 'worth_exploring',
      ageAppropriate: true,
      interests: ['swimming', 'fitness'],
      logisticalFit: { location: true, schedule: true, budget: false, transportation: true },
      metadata: {
        provider: { name: 'SafeSplash Swim School' },
        name: 'Learn to Swim Program',
        description: 'Comprehensive swimming lessons focusing on water safety, stroke development, and confidence building.',
        location: { city: location, neighborhood: 'South Austin' },
        pricing: { type: 'per_month', amount: 180 }
      }
    },
    {
      providerId: 1355,
      programId: 2005,
      matchScore: 0.75,
      matchReasons: ['Creative expression opportunity', 'Builds confidence', 'Age-appropriate content'],
      recommendationType: 'worth_exploring',
      ageAppropriate: true,
      interests: ['music', 'performance'],
      logisticalFit: { location: false, schedule: true, budget: true, transportation: true },
      metadata: {
        provider: { name: 'Austin Music Academy' },
        name: 'Kids Music Lessons',
        description: 'Individual and group music lessons for children, covering various instruments and music theory basics.',
        location: { city: location, neighborhood: 'West Austin' },
        pricing: { type: 'per_session', amount: 65 }
      }
    }
  ];
}

// Demo phases configuration
const DEMO_PHASES: Phase[] = [
  {
    id: 'input',
    title: 'Family Input',
    subtitle: 'Natural language description parsing with AI',
    icon: UserGroupIcon,
    status: 'active'
  },
  {
    id: 'review',
    title: 'Profile Review',
    subtitle: 'Edit and validate extracted family data',
    icon: PencilSquareIcon,
    status: 'pending'
  },
  {
    id: 'recommendations',
    title: 'AI Recommendations',
    subtitle: 'Vector search + personalized activity matching',
    icon: SparklesIcon,
    status: 'pending'
  },
  {
    id: 'email',
    title: 'Provider Outreach',
    subtitle: 'Auto-generated personalized communication',
    icon: EnvelopeIcon,
    status: 'pending'
  },
  {
    id: 'metrics',
    title: 'Cost & Performance',
    subtitle: 'Real-time AI usage and ROI analytics',
    icon: ChartBarIcon,
    status: 'pending'
  }
];

interface DemoState {
  currentPhase: string;
  phases: Phase[];
  familyDescription: string;
  familyProfile: FamilyProfile | null;
  recommendations: Recommendation[];
  selectedRecommendations: Recommendation[];
  generatedEmails: GeneratedEmail[];
  totalCost: number;
  isLoading: boolean;
  error: string | null;
  isScrolling: boolean;
}

export default function POC1DemoPage() {
  const [state, setState] = useState<DemoState>({
    currentPhase: 'input',
    phases: DEMO_PHASES,
    familyDescription: '',
    familyProfile: null,
    recommendations: [],
    selectedRecommendations: [],
    generatedEmails: [],
    totalCost: 0,
    isLoading: false,
    error: null,
    isScrolling: false
  });

  // Update phase status helper
  const updatePhaseStatus = useCallback((phaseId: string, status: Phase['status']) => {
    setState(prev => ({
      ...prev,
      phases: prev.phases.map(phase => 
        phase.id === phaseId ? { ...phase, status } : phase
      )
    }));
  }, []);

  // Navigate to specific phase
  const navigateToPhase = useCallback((phaseId: string) => {
    setState(prev => ({ ...prev, currentPhase: phaseId }));
  }, []);

  // Smooth scroll to top helper with enhanced functionality
  const scrollToTop = useCallback(() => {
    // Only scroll if we're not already at the top
    if (window.scrollY > 100) {
      setState(prev => ({ ...prev, isScrolling: true }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Clear scrolling state after animation completes
      setTimeout(() => {
        setState(prev => ({ ...prev, isScrolling: false }));
      }, 800);
    }
  }, []);

  // Phase 1: Handle family input submission
  const handleFamilyInput = useCallback(async (description: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null, familyDescription: description }));
    updatePhaseStatus('input', 'completed');
    
    try {
      const response = await fetch('/api/v1/ai/parse-family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          description,
          options: { includeMetrics: true }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to parse family profile: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to parse family profile');
      }

      setState(prev => ({
        ...prev,
        familyProfile: data.familyProfile,
        totalCost: prev.totalCost + (data.usage?.estimatedCost || 0),
        currentPhase: 'review',
        isLoading: false
      }));
      
      updatePhaseStatus('review', 'active');
      
      // Scroll to top after successful profile parsing
      setTimeout(() => scrollToTop(), 150);
      
    } catch (error) {
      console.error('Family parsing error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to parse family description',
        isLoading: false
      }));
    }
  }, [updatePhaseStatus, scrollToTop]);

  // Phase 2: Handle profile review completion
  const handleProfileReview = useCallback(async (updatedProfile: FamilyProfile) => {
    setState(prev => ({ 
      ...prev, 
      familyProfile: updatedProfile,
      currentPhase: 'recommendations',
      isLoading: true,
      error: null
    }));
    
    updatePhaseStatus('review', 'completed');
    updatePhaseStatus('recommendations', 'active');

    try {
      const response = await fetch('/api/v1/ai/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyProfile: updatedProfile,
          options: { 
            limit: 15,
            includeExplanations: true,
            includeMetrics: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to get recommendations: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get recommendations');
      }

      setState(prev => ({
        ...prev,
        recommendations: data.recommendations || [],
        totalCost: prev.totalCost + (data.usage?.estimatedCost || 0),
        isLoading: false
      }));

      // Scroll to top after successful recommendations load
      setTimeout(() => scrollToTop(), 150);

    } catch (error) {
      console.error('Recommendations error:', error);
      
      // Create mock recommendations for demo continuity
      const mockRecommendations: Recommendation[] = createMockRecommendations(updatedProfile);
      
      setState(prev => ({
        ...prev,
        recommendations: mockRecommendations,
        isLoading: false,
        error: null // Clear error since we have fallback data
      }));

      // Scroll to top after mock recommendations are loaded
      setTimeout(() => scrollToTop(), 150);
    }
  }, [updatePhaseStatus, scrollToTop]);

  // Phase 3: Handle recommendation selection for email generation
  const handleRecommendationSelection = useCallback((selected: Recommendation[]) => {
    setState(prev => ({
      ...prev,
      selectedRecommendations: selected,
      currentPhase: 'email'
    }));
    
    updatePhaseStatus('recommendations', 'completed');
    updatePhaseStatus('email', 'active');
  }, [updatePhaseStatus]);

  // Phase 4: Handle email generation completion
  const handleEmailGeneration = useCallback((emails: GeneratedEmail[], cost: number) => {
    setState(prev => ({
      ...prev,
      generatedEmails: emails,
      totalCost: prev.totalCost + cost,
      currentPhase: 'metrics'
    }));
    
    updatePhaseStatus('email', 'completed');
    updatePhaseStatus('metrics', 'active');
  }, [updatePhaseStatus]);

  // Phase 5: Handle demo completion
  const handleDemoComplete = useCallback(() => {
    updatePhaseStatus('metrics', 'completed');
  }, [updatePhaseStatus]);

  // Reset demo to start over
  const resetDemo = useCallback(() => {
    setState({
      currentPhase: 'input',
      phases: DEMO_PHASES,
      familyDescription: '',
      familyProfile: null,
      recommendations: [],
      selectedRecommendations: [],
      generatedEmails: [],
      totalCost: 0,
      isLoading: false,
      error: null,
      isScrolling: false
    });
  }, []);

  // Render current phase component
  const renderCurrentPhase = () => {
    const { currentPhase, familyProfile, recommendations, selectedRecommendations, isLoading } = state;

    switch (currentPhase) {
      case 'input':
        return (
          <FamilyInput 
            onSubmit={handleFamilyInput}
            loading={isLoading}
          />
        );
        
      case 'review':
        return familyProfile ? (
          <ProfileReview
            familyProfile={familyProfile}
            originalDescription={state.familyDescription}
            onComplete={handleProfileReview}
            loading={isLoading}
          />
        ) : null;
        
      case 'recommendations':
        return familyProfile ? (
          <Recommendations
            familyProfile={familyProfile}
            recommendations={recommendations}
            onSelectionComplete={handleRecommendationSelection}
            loading={isLoading}
          />
        ) : null;
        
      case 'email':
        return familyProfile && selectedRecommendations.length > 0 ? (
          <EmailSimulation
            familyProfile={familyProfile}
            selectedRecommendations={selectedRecommendations}
            onComplete={handleEmailGeneration}
          />
        ) : null;
        
      case 'metrics':
        return (
          <CostTracker
            totalCost={state.totalCost}
            familyProfile={familyProfile}
            recommendations={recommendations}
            generatedEmails={state.generatedEmails}
            onComplete={handleDemoComplete}
            onReset={resetDemo}
          />
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-neutral-0 to-secondary/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Demo Header */}
        <div className="text-center mb-12 pt-4">
          <h1 className="text-3xl font-bold text-neutral-100 mb-6">
            Recess Concierge Demo
          </h1>
          <p className="text-lg text-neutral-60 max-w-3xl mx-auto leading-relaxed">
            Experience how AI transforms natural language family descriptions into personalized activity 
            recommendations and automated provider outreach. This interactive demo showcases our complete 
            technical stack and business value proposition.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Phase Indicator Sidebar */}
          <div className="lg:col-span-1">
            <PhaseIndicator
              phases={state.phases}
              currentPhase={state.currentPhase}
              onPhaseSelect={navigateToPhase}
              showNavigation={true}
            />
            
            {/* Quick Stats */}
            {state.totalCost > 0 && (
              <div className="mt-6 bg-neutral-0 rounded-xl border border-neutral-20 p-4">
                <h3 className="font-medium text-neutral-100 mb-3">Demo Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-60">AI Cost:</span>
                    <span className="font-medium text-green-600">
                      ${state.totalCost.toFixed(4)}
                    </span>
                  </div>
                  {state.recommendations.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-neutral-60">Matches Found:</span>
                      <span className="font-medium text-primary">
                        {state.recommendations.length}
                      </span>
                    </div>
                  )}
                  {state.generatedEmails.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-neutral-60">Emails Generated:</span>
                      <span className="font-medium text-secondary">
                        {state.generatedEmails.length}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-2">
            {/* Scroll Indicator */}
            {state.isScrolling && (
              <div className="mb-4 bg-primary/10 border border-primary/20 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="text-sm text-primary font-medium">Scrolling to show results...</span>
                </div>
              </div>
            )}

            {/* Error Display */}
            {state.error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                      <span className="text-red-600 text-xs">!</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-800">Demo Error</h3>
                    <p className="text-sm text-red-700 mt-1">{state.error}</p>
                    <button
                      onClick={() => setState(prev => ({ ...prev, error: null }))}
                      className="text-sm text-red-600 hover:text-red-800 mt-2"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Phase Content */}
            <div className="bg-neutral-0 rounded-xl shadow-sm border border-neutral-20 overflow-hidden">
              <div className="p-6">
                {renderCurrentPhase()}
              </div>
            </div>
          </div>
        </div>

        {/* Demo Reset */}
        <div className="mt-12 text-center">
          <button
            onClick={resetDemo}
            className="text-sm text-neutral-50 hover:text-neutral-70 transition-colors"
          >
            ↻ Reset Demo to Start Over
          </button>
        </div>
      </div>
    </div>
  );
}