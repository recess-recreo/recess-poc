/**
 * Family Input Component - Phase 1
 * 
 * WHY: Natural language family input because:
 * - Demonstrates the power of AI to parse unstructured user input
 * - Shows how parents naturally describe their families and needs
 * - Eliminates complex forms in favor of conversational interface
 * - Creates engaging demo experience that feels magical to investors
 * - Validates the core value proposition of AI-powered simplification
 */

'use client';

import { useState } from 'react';
import { PaperAirplaneIcon, MicrophoneIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { ClockIcon, UserGroupIcon } from '@heroicons/react/24/outline';

interface FamilyInputProps {
  onSubmit: (description: string) => void;
  loading?: boolean;
  className?: string;
}

// Sample family descriptions for quick testing - diverse examples
const SAMPLE_INPUTS = [
  {
    title: "Three Kids with Different Interests",
    description: "We're looking for activities for our three kids: Emma (8) who loves art and reading, Jake (10) who's into soccer and video games, and Lily (6) who enjoys dancing and animals. We'd prefer weekend programs within 15 minutes of downtown, with a budget of $200/month per child. Emma is shy and does better in small groups, while Jake and Lily are very social.",
    category: "Multiple Children"
  },
  {
    title: "Westlake Family with Two Kids",
    description: "Hi! I'm Sarah with two kids - Emma (7) loves art and drawing, and Jake (10) plays soccer and is really into robotics. We live in Westlake Hills and I'm looking for after-school activities. Budget is around $200-300/month per kid. We can only do activities on weekday afternoons after 3pm because of school - no mornings or evenings on weekdays due to homework time.",
    category: "Weekday Afternoon Only"
  },
  {
    title: "Single Parent in Hyde Park", 
    description: "I'm David, single dad to Maya who just turned 6. She's super energetic and loves dancing and gymnastics. We're in Hyde Park near UT campus. Weekend mornings work best for us, ideally before 11am - I work weekdays and Saturday afternoons/Sundays after lunch are family time. Budget is flexible for quality programs that fit our Saturday morning schedule.",
    category: "Weekend Mornings Only"
  },
  {
    title: "Summer Camp Planning in Zilker",
    description: "Jennifer here! My twins Alex and Sam (both 9) need summer camp. Alex is into science experiments and building things, Sam loves theater and music. We live in the Zilker neighborhood. Looking for half-day programs in July, budget around $500/week per child. They have different interests but would prefer same location.",
    category: "Summer Camps"
  }
];

export default function FamilyInput({ 
  onSubmit, 
  loading = false, 
  className = '' 
}: FamilyInputProps) {
  const [input, setInput] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [selectedSample, setSelectedSample] = useState<number | null>(null);
  const [showSamples, setShowSamples] = useState(true);

  const maxChars = 2000;

  const handleInputChange = (value: string) => {
    if (value.length <= maxChars) {
      setInput(value);
      setCharCount(value.length);
      setSelectedSample(null);
      setShowSamples(false);
    }
  };

  const handleSampleSelect = (sample: typeof SAMPLE_INPUTS[0], index: number) => {
    setInput(sample.description);
    setCharCount(sample.description.length);
    setSelectedSample(index);
    setShowSamples(false);
  };

  const handleSubmit = () => {
    if (input.trim() && !loading) {
      onSubmit(input.trim());
    }
  };

  const canSubmit = input.trim().length >= 50 && !loading;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2">
          <UserGroupIcon className="w-8 h-8 text-primary" />
          <h2 className="text-2xl font-bold text-neutral-100">Describe Your Family</h2>
        </div>
        <p className="text-neutral-60 max-w-2xl mx-auto">
          Tell us about your family in your own words. Our AI will understand your needs and preferences 
          to find the perfect activities for your children.
        </p>
      </div>

      {/* Sample Inputs */}
      {showSamples && (
        <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <SparklesIcon className="w-5 h-5 text-accent-orange" />
            <h3 className="font-medium text-neutral-100">Quick Start Examples</h3>
            <span className="text-xs bg-accent-orange/10 text-accent-orange px-2 py-1 rounded-full">
              Click to use
            </span>
          </div>
          
          <div className="grid md:grid-cols-2 gap-3">
            {SAMPLE_INPUTS.map((sample, index) => (
              <div
                key={index}
                className={`p-4 border border-neutral-20 rounded-lg cursor-pointer transition-all duration-200 hover:border-primary hover:shadow-sm ${
                  selectedSample === index ? 'border-primary bg-primary/5' : 'hover:bg-neutral-5'
                }`}
                onClick={() => handleSampleSelect(sample, index)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-neutral-100 text-sm">
                    {sample.title}
                  </h4>
                  <span className="text-xs bg-secondary/10 text-secondary/80 px-2 py-1 rounded-full ml-2 flex-shrink-0">
                    {sample.category}
                  </span>
                </div>
                <p className="text-sm text-neutral-60 leading-relaxed line-clamp-3">
                  {sample.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-neutral-20 text-center">
            <button
              onClick={() => setShowSamples(false)}
              className="text-sm text-neutral-50 hover:text-neutral-70 transition-colors"
            >
              Or write your own description below ↓
            </button>
          </div>
        </div>
      )}

      {/* Main Input */}
      <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6 space-y-4">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Tell us about your family! Include details like: 
• Your children's names and ages
• Their interests and hobbies  
• Your location/neighborhood
• Schedule preferences
• Budget considerations
• Any special needs or requirements

Example: 'Hi! I'm Maria with two kids - Sofia (8) loves dance and art, and Carlos (11) plays basketball. We live in Astoria, Queens. Looking for after-school programs, budget around $250/month per child...'"
            className="w-full h-48 p-4 border border-neutral-30 rounded-lg resize-none text-neutral-100 placeholder-neutral-50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
            disabled={loading}
          />
          
          {/* Character Counter */}
          <div className="absolute bottom-3 right-3 flex items-center space-x-2">
            <span className={`text-xs transition-colors ${
              charCount > maxChars * 0.9 
                ? 'text-accent-pink' 
                : charCount > maxChars * 0.7 
                ? 'text-accent-orange' 
                : 'text-neutral-50'
            }`}>
              {charCount}/{maxChars}
            </span>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-20">
          <div className="flex items-center space-x-4">
            {!showSamples && (
              <button
                onClick={() => setShowSamples(true)}
                className="text-sm text-secondary hover:text-secondary/80 transition-colors"
                disabled={loading}
              >
                ← Back to examples
              </button>
            )}
            
            <div className="flex items-center space-x-2 text-xs text-neutral-50">
              <ClockIcon className="w-4 h-4" />
              <span>Takes ~30 seconds to process</span>
            </div>
          </div>

          {/* Voice Input Button (placeholder) */}
          <button
            className="flex items-center space-x-2 px-3 py-2 text-sm text-neutral-60 hover:text-neutral-80 transition-colors"
            disabled={loading}
            title="Voice input (coming soon)"
          >
            <MicrophoneIcon className="w-4 h-4" />
            <span className="hidden sm:block">Voice</span>
          </button>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full flex items-center justify-center space-x-2 py-4 px-6 rounded-lg font-medium transition-all duration-200 ${
            canSubmit
              ? 'bg-primary hover:bg-primary/90 text-neutral-0 shadow-lg hover:shadow-xl'
              : 'bg-neutral-30 text-neutral-50 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-neutral-0/30 border-t-neutral-0 rounded-full animate-spin" />
              <span>Processing with AI...</span>
            </>
          ) : (
            <>
              <PaperAirplaneIcon className="w-5 h-5" />
              <span>Parse Family Profile with AI</span>
            </>
          )}
        </button>

        {/* Requirements */}
        {charCount > 0 && charCount < 50 && (
          <div className="text-sm text-accent-orange bg-accent-orange/10 p-3 rounded-lg">
            Please add more details (minimum 50 characters). Include information about your children, 
            their interests, your location, and what kind of activities you&apos;re looking for.
          </div>
        )}
      </div>

      {/* Benefits Section */}
      <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl p-6">
        <h3 className="font-medium text-neutral-100 mb-3">What our AI will extract:</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start space-x-2">
            <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
            <div>
              <div className="font-medium text-neutral-80">Family Details</div>
              <div className="text-neutral-60">Names, ages, roles</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0" />
            <div>
              <div className="font-medium text-neutral-80">Interests & Needs</div>
              <div className="text-neutral-60">Hobbies, preferences, requirements</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-2 h-2 bg-accent-teal rounded-full mt-2 flex-shrink-0" />
            <div>
              <div className="font-medium text-neutral-80">Logistics</div>
              <div className="text-neutral-60">Location, budget, schedule</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}