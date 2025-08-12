/**
 * Email Simulation Component - Phase 4
 * 
 * WHY: Automated provider outreach simulation because:
 * - Demonstrates AI's ability to generate personalized, professional communication
 * - Shows time-saving value proposition for busy parents
 * - Validates the quality and relevance of AI-generated content
 * - Provides tangible business outcome (reduced manual work)
 * - Creates compelling demo moment showing end-to-end automation
 * - Illustrates how AI maintains family context across communications
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  EnvelopeIcon,
  SparklesIcon, 
  ClockIcon,
  UserIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/solid';

import type { FamilyProfile, Recommendation, GeneratedEmail } from '@/types/ai';

interface EmailSimulationProps {
  familyProfile: FamilyProfile;
  selectedRecommendations: Recommendation[];
  onComplete: (emails: GeneratedEmail[], totalCost: number) => void;
  className?: string;
}

interface EmailGeneration {
  recommendation: Recommendation;
  status: 'pending' | 'generating' | 'completed' | 'error';
  email?: GeneratedEmail;
  progress?: number;
  error?: string;
}

// Mock provider details for email generation
const providerDetails = {
  1: { 
    contactName: "Sarah Mitchell", 
    email: "sarah@brooklynartsacademy.com",
    programName: "Young Artists Workshop"
  },
  2: { 
    contactName: "Coach Mike Rodriguez", 
    email: "mike@nycsoccerstars.com",
    programName: "Youth Soccer Development"
  },
  3: { 
    contactName: "Dr. Jennifer Chen", 
    email: "jennifer@stemkidsbrooklyn.com",
    programName: "Robotics & Engineering"
  },
  4: { 
    contactName: "Ms. Ashley Thompson", 
    email: "ashley@dancedynamics.com",
    programName: "Kids Hip Hop & Jazz"
  },
  5: { 
    contactName: "Coach Lisa Park", 
    email: "lisa@littlegymnasts.com",
    programName: "Beginner Gymnastics"
  }
};

export default function EmailSimulation({
  familyProfile,
  selectedRecommendations,
  onComplete,
  className = ''
}: EmailSimulationProps) {
  const [emailGenerations, setEmailGenerations] = useState<EmailGeneration[]>([]);
  const [currentGenerating, setCurrentGenerating] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [showEmailDetails, setShowEmailDetails] = useState<{ [key: number]: boolean }>({});
  const [allCompleted, setAllCompleted] = useState(false);

  // Initialize email generations
  useEffect(() => {
    const initialGenerations: EmailGeneration[] = selectedRecommendations.map(rec => ({
      recommendation: rec,
      status: 'pending',
      progress: 0
    }));
    setEmailGenerations(initialGenerations);
    
    // Start generating emails
    if (initialGenerations.length > 0) {
      generateNextEmail(initialGenerations, 0);
    }
  }, [selectedRecommendations]);

  const generateNextEmail = async (generations: EmailGeneration[], index: number) => {
    if (index >= generations.length) {
      setAllCompleted(true);
      const completedEmails = generations
        .filter(g => g.email)
        .map(g => g.email as GeneratedEmail);
      onComplete(completedEmails, totalCost);
      return;
    }

    const currentGen = generations[index];
    setCurrentGenerating(index);
    
    // Update status to generating
    setEmailGenerations(prev => prev.map((g, i) => 
      i === index ? { ...g, status: 'generating' as const, progress: 0 } : g
    ));

    try {
      // Simulate email generation progress
      for (let progress = 0; progress <= 100; progress += 20) {
        await new Promise(resolve => setTimeout(resolve, 300));
        setEmailGenerations(prev => prev.map((g, i) => 
          i === index ? { ...g, progress } : g
        ));
      }

      // Generate the email
      const generatedEmail = await generateEmail(currentGen.recommendation);
      const emailCost = 0.02; // Simulated cost
      
      setTotalCost(prev => prev + emailCost);
      
      setEmailGenerations(prev => prev.map((g, i) => 
        i === index ? { 
          ...g, 
          status: 'completed' as const, 
          email: generatedEmail,
          progress: 100 
        } : g
      ));

      // Wait a moment then generate next
      setTimeout(() => {
        generateNextEmail(generations, index + 1);
      }, 1000);

    } catch (error) {
      setEmailGenerations(prev => prev.map((g, i) => 
        i === index ? { 
          ...g, 
          status: 'error' as const, 
          error: error instanceof Error ? error.message : 'Generation failed'
        } : g
      ));
    }
  };

  const generateEmail = async (recommendation: Recommendation): Promise<GeneratedEmail> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const provider = providerDetails[recommendation.providerId as keyof typeof providerDetails];
    const parentName = familyProfile.adults[0]?.name || 'Parent';
    const childName = familyProfile.children[0]?.name || 'Child';
    const childAge = familyProfile.children[0]?.age || 5;
    const interests = familyProfile.children[0]?.interests?.join(', ') || 'various activities';

    const subject = `Inquiry about ${provider?.programName || 'Program'} for ${childName}`;
    
    const body = `Dear ${provider?.contactName || 'Program Director'},

I hope this message finds you well. I'm ${parentName}, and I'm reaching out regarding your ${provider?.programName || 'program'} for my ${childAge}-year-old ${childName}.

Based on our family's needs and ${childName}'s interests in ${interests}, your program appears to be an excellent fit. I'm particularly drawn to your program because:

${recommendation.matchReasons.slice(0, 2).map(reason => `• ${reason}`).join('\n')}

I'd love to learn more about:
- Available time slots and scheduling flexibility
- Program structure and curriculum
- Enrollment process and availability
- Tuition and any additional fees

${childName} is ${childAge} years old and has shown great enthusiasm for ${interests}. We're located in ${familyProfile.location.neighborhood || familyProfile.location.city || 'Brooklyn'}, and I believe your location would work well for our family.

Would it be possible to schedule a brief conversation or visit to discuss the program further? I'm happy to work around your schedule.

Thank you for your time and for creating such wonderful opportunities for children in our community. I look forward to hearing from you.

Best regards,
${parentName}
${familyProfile.adults[0]?.email ? `\n${familyProfile.adults[0].email}` : ''}
${familyProfile.adults[0]?.phone ? `\n${familyProfile.adults[0].phone}` : ''}`;

    return {
      subject,
      body,
      metadata: {
        tone: 'professional',
        priority: 'medium',
        expectedResponse: 'action_required',
        wordCount: body.split(' ').length,
        estimatedReadTime: Math.ceil(body.split(' ').length / 200)
      }
    };
  };

  const toggleEmailDetails = (index: number) => {
    setShowEmailDetails(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const getStatusColor = (status: EmailGeneration['status']) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'generating': return 'text-blue-600 bg-blue-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: EmailGeneration['status']) => {
    switch (status) {
      case 'completed': return <CheckCircleIcon className="w-5 h-5" />;
      case 'generating': return <ClockIcon className="w-5 h-5 animate-spin" />;
      case 'error': return <ExclamationTriangleIcon className="w-5 h-5" />;
      default: return <EnvelopeIcon className="w-5 h-5" />;
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2">
          <PaperAirplaneIcon className="w-8 h-8 text-secondary" />
          <h2 className="text-2xl font-bold text-neutral-100">AI Email Generation</h2>
        </div>
        <p className="text-neutral-60 max-w-2xl mx-auto">
          Our AI is crafting personalized outreach emails for each selected provider, 
          incorporating your family details and specific program matches.
        </p>
      </div>

      {/* Generation Progress */}
      <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-neutral-100">Email Generation Progress</h3>
          <div className="text-sm text-neutral-60">
            {emailGenerations.filter(g => g.status === 'completed').length} of {emailGenerations.length} completed
          </div>
        </div>
        
        <div className="space-y-4">
          {emailGenerations.map((generation, index) => {
            const provider = providerDetails[generation.recommendation.providerId as keyof typeof providerDetails];
            const isShowingDetails = showEmailDetails[index];
            
            return (
              <div key={index} className="border border-neutral-20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full ${getStatusColor(generation.status)}`}>
                      {getStatusIcon(generation.status)}
                    </div>
                    <div>
                      <h4 className="font-medium text-neutral-100">
                        {provider?.programName || `Program ${generation.recommendation.programId}`}
                      </h4>
                      <p className="text-sm text-neutral-60">
                        To: {provider?.contactName || 'Program Director'} • {provider?.email || 'contact@provider.com'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {generation.status === 'generating' && (
                      <div className="text-sm text-blue-600">
                        {generation.progress}%
                      </div>
                    )}
                    
                    {generation.email && (
                      <button
                        onClick={() => toggleEmailDetails(index)}
                        className="p-1 text-neutral-50 hover:text-neutral-70 transition-colors"
                        title={isShowingDetails ? 'Hide email' : 'Show email'}
                      >
                        {isShowingDetails ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {generation.status === 'generating' && (
                  <div className="w-full bg-neutral-20 rounded-full h-2 mb-3">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${generation.progress || 0}%` }}
                    />
                  </div>
                )}

                {/* Status Message */}
                <div className="text-sm text-neutral-60 mb-2">
                  {generation.status === 'pending' && 'Waiting to generate...'}
                  {generation.status === 'generating' && 'Crafting personalized email with AI...'}
                  {generation.status === 'completed' && `Email generated successfully • ${generation.email?.metadata.wordCount} words • ${generation.email?.metadata.estimatedReadTime} min read`}
                  {generation.status === 'error' && `Error: ${generation.error}`}
                </div>

                {/* Email Details */}
                {generation.email && isShowingDetails && (
                  <div className="mt-4 p-4 bg-neutral-5 rounded-lg border border-neutral-20">
                    {/* Email Metadata */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <DocumentTextIcon className="w-4 h-4 text-neutral-50" />
                        <span className="text-neutral-60">
                          Tone: {generation.email.metadata.tone}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <ClockIcon className="w-4 h-4 text-neutral-50" />
                        <span className="text-neutral-60">
                          {generation.email.metadata.estimatedReadTime} min read
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <UserIcon className="w-4 h-4 text-neutral-50" />
                        <span className="text-neutral-60">
                          Priority: {generation.email.metadata.priority}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <EnvelopeIcon className="w-4 h-4 text-neutral-50" />
                        <span className="text-neutral-60">
                          Response: {generation.email.metadata.expectedResponse.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Email Preview */}
                    <div className="border border-neutral-30 rounded-lg overflow-hidden">
                      {/* Email Header */}
                      <div className="bg-neutral-10 border-b border-neutral-30 p-3">
                        <div className="text-sm space-y-1">
                          <div><strong>Subject:</strong> {generation.email.subject}</div>
                          <div><strong>To:</strong> {provider?.email || 'contact@provider.com'}</div>
                          <div><strong>From:</strong> {familyProfile.adults[0]?.email || 'parent@example.com'}</div>
                        </div>
                      </div>
                      
                      {/* Email Body */}
                      <div className="p-4 bg-neutral-0 max-h-64 overflow-y-auto">
                        <pre className="text-sm text-neutral-80 whitespace-pre-wrap font-sans leading-relaxed">
                          {generation.email.body}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {/* Match Reasons Reference */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {generation.recommendation.matchReasons.slice(0, 3).map((reason, reasonIndex) => (
                    <span 
                      key={reasonIndex}
                      className="text-xs bg-secondary/10 text-secondary px-2 py-1 rounded-full"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generation Summary */}
      <div className="bg-gradient-to-r from-secondary/5 to-tertiary-orange/5 rounded-xl p-6">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-secondary mb-1">
              {emailGenerations.filter(g => g.status === 'completed').length}
            </div>
            <div className="text-sm text-neutral-60">Emails Generated</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-tertiary-orange mb-1">
              ${totalCost.toFixed(4)}
            </div>
            <div className="text-sm text-neutral-60">AI Generation Cost</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-primary mb-1">
              {emailGenerations.reduce((sum, g) => sum + (g.email?.metadata.wordCount || 0), 0)}
            </div>
            <div className="text-sm text-neutral-60">Total Words</div>
          </div>
        </div>
      </div>

      {/* AI Features Highlight */}
      <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <SparklesIcon className="w-5 h-5 text-tertiary-orange" />
          <h3 className="font-medium text-neutral-100">AI Personalization Features</h3>
        </div>
        
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-neutral-80">Family Context Integration</div>
                <div className="text-neutral-60">Child names, ages, interests, and family location</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-neutral-80">Match-Specific Messaging</div>
                <div className="text-neutral-60">References specific reasons why the program fits</div>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-tertiary-orange rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-neutral-80">Professional Tone</div>
                <div className="text-neutral-60">Maintains appropriate parent-to-provider communication</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-tertiary-pink rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-neutral-80">Call-to-Action</div>
                <div className="text-neutral-60">Clear next steps and contact information</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Continue Button */}
      {allCompleted && (
        <div className="text-center">
          <button
            onClick={() => onComplete(
              emailGenerations
                .filter(g => g.email)
                .map(g => g.email as GeneratedEmail),
              totalCost
            )}
            className="px-8 py-4 bg-secondary hover:bg-secondary/80 text-neutral-0 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            View Cost Analysis & Performance Metrics
          </button>
        </div>
      )}
    </div>
  );
}