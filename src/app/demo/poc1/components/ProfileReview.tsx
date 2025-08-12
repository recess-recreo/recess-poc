/**
 * Profile Review Component - Phase 2
 * 
 * WHY: Editable structured profile with family member perspective filtering because:
 * - Shows the power of AI extraction from natural language
 * - Allows users to verify and refine AI-parsed information
 * - Demonstrates data quality and accuracy of AI processing
 * - Provides confidence that the system understands their needs
 * - Creates trust through transparency and control over their data
 * - Enables perspective switching to view profile from different family member viewpoints
 * - Highlights relevant sections based on selected family member (All, Family, All Kids, Individual)
 */

'use client';

import { useState } from 'react';
import { 
  PencilIcon, 
  CheckIcon, 
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  SparklesIcon,
  UserGroupIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  ClockIcon
} from '@heroicons/react/24/solid';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { FamilyProfile } from '@/types/ai';

export type RecommendationType = 'family' | 'all_kids' | string; // string for individual child names

interface ProfileReviewProps {
  familyProfile: FamilyProfile;
  originalDescription: string;
  onComplete: (profile: FamilyProfile, recommendationType: RecommendationType, requestData?: any) => void;
  loading?: boolean;
  className?: string;
}

export default function ProfileReview({
  familyProfile,
  originalDescription,
  onComplete,
  loading = false,
  className = ''
}: ProfileReviewProps) {
  const [editingProfile, setEditingProfile] = useState<FamilyProfile>(familyProfile);
  const [confidence] = useState(0.85); // Simulated confidence score
  const [warnings] = useState<string[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<any>(null);

  // Helper function to transform family profile to new request format
  const createNewFormatRequest = (profile: FamilyProfile, targetPeople: 'family' | 'all_kids' | string) => {
    const people = [];
    
    // Add adults for family recommendations
    if (targetPeople === 'family') {
      profile.adults.forEach(adult => {
        people.push({
          type: 'parent' as const,
          name: adult.name,
          age: 35, // Default adult age
          interests: []
        });
      });
    }
    
    // Add children based on target
    if (targetPeople === 'family' || targetPeople === 'all_kids') {
      // Add all children
      profile.children.forEach(child => {
        people.push({
          type: 'child' as const,
          name: child.name,
          age: child.age,
          interests: child.interests
        });
      });
    } else if (targetPeople !== 'family' && targetPeople !== 'all_kids') {
      // Add specific child
      const targetChild = profile.children.find(c => 
        c.name.toLowerCase() === targetPeople.toLowerCase()
      );
      if (targetChild) {
        people.push({
          type: 'child' as const,
          name: targetChild.name,
          age: targetChild.age,
          interests: targetChild.interests
        });
      }
    }
    
    return {
      people,
      location: {
        city: profile.location.city || 'Austin',
        neighborhood: profile.location.neighborhood,
        postalCode: profile.location.zipCode
      },
      budget: {
        amount: profile.preferences?.budget?.max || 200,
        period: 'month' as const
      },
      schedule: {
        preferences: profile.preferences?.schedule || []
      }
    };
  };

  const handleRecommendationClick = (recommendationType: RecommendationType) => {
    const newFormatData = createNewFormatRequest(editingProfile, recommendationType);
    onComplete(editingProfile, recommendationType, newFormatData);
  };

  const handleFieldEdit = (fieldPath: string, currentValue: any) => {
    setEditingField(fieldPath);
    setTempValue(currentValue);
  };

  const handleFieldSave = (fieldPath: string) => {
    const updatedProfile = { ...editingProfile };
    const pathArray = fieldPath.split('.');
    
    let current: any = updatedProfile;
    for (let i = 0; i < pathArray.length - 1; i++) {
      current = current[pathArray[i]];
    }
    current[pathArray[pathArray.length - 1]] = tempValue;
    
    setEditingProfile(updatedProfile);
    setEditingField(null);
    setTempValue(null);
  };

  const handleFieldCancel = () => {
    setEditingField(null);
    setTempValue(null);
  };

  const addChild = () => {
    const newChild = {
      name: 'New Child',
      age: 5,
      interests: [],
      allergies: [],
    };
    setEditingProfile(prev => ({
      ...prev,
      children: [...prev.children, newChild]
    }));
  };

  const removeChild = (index: number) => {
    setEditingProfile(prev => ({
      ...prev,
      children: prev.children.filter((_, i) => i !== index)
    }));
  };

  const addInterest = (childIndex: number) => {
    const newInterests = [...editingProfile.children[childIndex].interests, 'New Interest'];
    const updatedChildren = [...editingProfile.children];
    updatedChildren[childIndex].interests = newInterests;
    
    setEditingProfile(prev => ({
      ...prev,
      children: updatedChildren
    }));
  };

  const removeInterest = (childIndex: number, interestIndex: number) => {
    const updatedChildren = [...editingProfile.children];
    updatedChildren[childIndex].interests = updatedChildren[childIndex].interests.filter((_, i) => i !== interestIndex);
    
    setEditingProfile(prev => ({
      ...prev,
      children: updatedChildren
    }));
  };

  const EditableField = ({ 
    value, 
    fieldPath, 
    placeholder = 'Enter value',
    type = 'text' 
  }: { 
    value: any; 
    fieldPath: string; 
    placeholder?: string;
    type?: 'text' | 'number' | 'textarea';
  }) => {
    const isEditing = editingField === fieldPath;
    
    if (isEditing) {
      return (
        <div className="flex items-center space-x-2">
          {type === 'textarea' ? (
            <textarea
              value={tempValue || ''}
              onChange={(e) => setTempValue(e.target.value)}
              className="flex-1 px-2 py-1 border border-primary rounded text-sm"
              placeholder={placeholder}
              rows={3}
            />
          ) : (
            <input
              type={type}
              value={tempValue || ''}
              onChange={(e) => setTempValue(type === 'number' ? Number(e.target.value) : e.target.value)}
              className="flex-1 px-2 py-1 border border-primary rounded text-sm"
              placeholder={placeholder}
            />
          )}
          <button
            onClick={() => handleFieldSave(fieldPath)}
            className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200 transition-colors"
          >
            <CheckIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleFieldCancel}
            className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      );
    }

    return (
      <div className="group flex items-center space-x-2">
        <span className="flex-1 text-neutral-100">
          {value || <span className="text-neutral-40 italic">{placeholder}</span>}
        </span>
        <button
          onClick={() => handleFieldEdit(fieldPath, value)}
          className="opacity-0 group-hover:opacity-100 p-1 text-neutral-40 hover:text-primary transition-all duration-200"
        >
          <PencilIcon className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-100';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 0.8) return 'High Confidence';
    if (score >= 0.6) return 'Medium Confidence';
    return 'Low Confidence';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2">
          <SparklesIcon className="w-8 h-8 text-tertiary-orange" />
          <h2 className="text-2xl font-bold text-neutral-100">AI-Extracted Family Profile</h2>
        </div>
        <div className="flex items-center justify-center space-x-4">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(confidence)}`}>
            {getConfidenceLabel(confidence)} ({Math.round(confidence * 100)}%)
          </div>
          <p className="text-neutral-60">
            Review and edit your profile below
          </p>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-yellow-800 mb-2">Please Review</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="flex items-start space-x-1">
                    <span className="text-yellow-600">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}


      {/* Profile Sections */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Adults Section */}
        <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <UserGroupIcon className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-neutral-100">Adults</h3>
          </div>
          
          <div className="space-y-4">
            {editingProfile.adults.map((adult, index) => (
              <div key={index} className="p-4 bg-neutral-5 rounded-lg space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-70 block mb-1">Name</label>
                    <EditableField 
                      value={adult.name} 
                      fieldPath={`adults.${index}.name`}
                      placeholder="Enter name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-70 block mb-1">Role</label>
                    <EditableField 
                      value={adult.role} 
                      fieldPath={`adults.${index}.role`}
                      placeholder="parent, guardian, caregiver"
                    />
                  </div>
                </div>
                {adult.email && (
                  <div>
                    <label className="text-sm font-medium text-neutral-70 block mb-1">Email</label>
                    <EditableField 
                      value={adult.email} 
                      fieldPath={`adults.${index}.email`}
                      placeholder="Enter email"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Location Section */}
        <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <MapPinIcon className="w-5 h-5 text-secondary" />
            <h3 className="font-semibold text-neutral-100">Location</h3>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-neutral-70 block mb-1">Neighborhood</label>
              <EditableField 
                value={editingProfile.location.neighborhood} 
                fieldPath="location.neighborhood"
                placeholder="Enter neighborhood"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-neutral-70 block mb-1">City</label>
              <EditableField 
                value={editingProfile.location.city} 
                fieldPath="location.city"
                placeholder="Enter city"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-neutral-70 block mb-1">ZIP Code</label>
              <EditableField 
                value={editingProfile.location.zipCode} 
                fieldPath="location.zipCode"
                placeholder="Enter ZIP code"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Children Section */}
      <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <UserGroupIcon className="w-5 h-5 text-tertiary-pink" />
            <h3 className="font-semibold text-neutral-100">Children</h3>
          </div>
          <button
            onClick={addChild}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-tertiary-pink/10 text-tertiary-pink rounded-lg hover:bg-tertiary-pink/20 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Child</span>
          </button>
        </div>

        <div className="space-y-4">
          {editingProfile.children.map((child, index) => (
            <div 
              key={index} 
              className="p-4 bg-neutral-5 rounded-lg"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div>
                    <label className="text-sm font-medium text-neutral-70 block mb-1">Name</label>
                    <EditableField 
                      value={child.name} 
                      fieldPath={`children.${index}.name`}
                      placeholder="Enter name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-70 block mb-1">Age</label>
                    <EditableField 
                      value={child.age} 
                      fieldPath={`children.${index}.age`}
                      placeholder="Enter age"
                      type="number"
                    />
                  </div>
                </div>
                {editingProfile.children.length > 1 && (
                  <button
                    onClick={() => removeChild(index)}
                    className="p-1 text-red-400 hover:text-red-600 transition-colors ml-2"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-neutral-70">Interests</label>
                    <button
                      onClick={() => addInterest(index)}
                      className="text-xs text-secondary hover:text-secondary/80 transition-colors"
                    >
                      + Add Interest
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {child.interests.map((interest, interestIndex) => (
                      <div 
                        key={interestIndex}
                        className="group flex items-center space-x-1 bg-secondary/10 text-secondary px-2 py-1 rounded-full text-sm"
                      >
                        <span>{interest}</span>
                        <button
                          onClick={() => removeInterest(index, interestIndex)}
                          className="opacity-0 group-hover:opacity-100 text-secondary/70 hover:text-secondary transition-all duration-200"
                        >
                          <XMarkIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {child.interests.length === 0 && (
                      <span className="text-neutral-40 italic text-sm">No interests listed</span>
                    )}
                  </div>
                </div>

                {child.specialNeeds && (
                  <div>
                    <label className="text-sm font-medium text-neutral-70 block mb-1">Special Needs</label>
                    <EditableField 
                      value={child.specialNeeds} 
                      fieldPath={`children.${index}.specialNeeds`}
                      placeholder="Enter special needs or requirements"
                      type="textarea"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preferences Section */}
      <div className="bg-neutral-0 rounded-xl border border-neutral-20 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <ClockIcon className="w-5 h-5 text-tertiary-orange" />
          <h3 className="font-semibold text-neutral-100">Preferences</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Budget */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <CurrencyDollarIcon className="w-4 h-4 text-green-600" />
              <label className="text-sm font-medium text-neutral-70">Budget Range</label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-neutral-50 block mb-1">Min ($)</label>
                <EditableField 
                  value={editingProfile.preferences?.budget?.min} 
                  fieldPath="preferences.budget.min"
                  placeholder="Min budget"
                  type="number"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-50 block mb-1">Max ($)</label>
                <EditableField 
                  value={editingProfile.preferences?.budget?.max} 
                  fieldPath="preferences.budget.max"
                  placeholder="Max budget"
                  type="number"
                />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="text-sm font-medium text-neutral-70 block mb-3">Preferred Schedule</label>
            <div className="text-sm text-neutral-60">
              {editingProfile.preferences?.schedule?.length ? (
                <div className="flex flex-wrap gap-1">
                  {editingProfile.preferences.schedule.map((time, index) => (
                    <span key={index} className="bg-tertiary-orange/10 text-tertiary-orange px-2 py-1 rounded text-xs">
                      {time.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-neutral-40 italic">No schedule preferences specified</span>
              )}
            </div>
          </div>
        </div>

        {/* Activity Types */}
        {editingProfile.preferences?.activityTypes && editingProfile.preferences.activityTypes.length > 0 && (
          <div className="mt-4">
            <label className="text-sm font-medium text-neutral-70 block mb-2">Preferred Activity Types</label>
            <div className="flex flex-wrap gap-2">
              {editingProfile.preferences.activityTypes.map((type, index) => (
                <span key={index} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm">
                  {type}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Original Description Reference */}
      <div className="bg-gradient-to-r from-neutral-5 to-neutral-10 rounded-xl p-4 border border-neutral-20">
        <h4 className="font-medium text-neutral-80 mb-2">Original Description</h4>
        <p className="text-sm text-neutral-60 italic line-clamp-3">
          &quot;{originalDescription.length > 200 ? originalDescription.substring(0, 200) + '...' : originalDescription}&quot;
        </p>
      </div>

      {/* Recommendation Query Buttons */}
      <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl border border-primary/20 p-6">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <SparklesIcon className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-semibold text-neutral-100">Get AI Recommendations</h3>
          </div>
          <p className="text-neutral-60 text-sm">
            Choose what type of recommendations you'd like to receive:
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Family Recommendations */}
          <button
            onClick={() => handleRecommendationClick('family')}
            disabled={loading}
            className={`p-4 rounded-lg text-left transition-all duration-200 border-2 group ${
              loading 
                ? 'bg-neutral-10 text-neutral-50 cursor-not-allowed border-neutral-20'
                : 'bg-secondary/10 hover:bg-secondary/20 text-secondary border-secondary/30 hover:border-secondary/50 shadow-sm hover:shadow-md'
            }`}
          >
            <div className="flex items-center space-x-3 mb-2">
              <UserGroupIcon className={`w-6 h-6 flex-shrink-0 ${
                loading ? 'text-neutral-40' : 'text-secondary group-hover:text-secondary/80'
              }`} />
              <h4 className="font-semibold text-base">
                {loading ? 'Getting Recommendations...' : 'Family Activities'}
              </h4>
            </div>
            <p className={`text-sm ${
              loading ? 'text-neutral-40' : 'text-secondary/80'
            }`}>
              Activities that work for the whole family including adults and all children
            </p>
            {loading && (
              <div className="flex items-center space-x-2 mt-3">
                <div className="w-4 h-4 border-2 border-neutral-30 border-t-neutral-60 rounded-full animate-spin" />
                <span className="text-xs text-neutral-50">Processing...</span>
              </div>
            )}
          </button>

          {/* All Kids Recommendations - Only show if multiple children */}
          {editingProfile.children.length > 1 && (
            <button
              onClick={() => handleRecommendationClick('all_kids')}
              disabled={loading}
              className={`p-4 rounded-lg text-left transition-all duration-200 border-2 group ${
                loading 
                  ? 'bg-neutral-10 text-neutral-50 cursor-not-allowed border-neutral-20'
                  : 'bg-tertiary-orange/10 hover:bg-tertiary-orange/20 text-tertiary-orange border-tertiary-orange/30 hover:border-tertiary-orange/50 shadow-sm hover:shadow-md'
              }`}
            >
              <div className="flex items-center space-x-3 mb-2">
                <UserGroupIcon className={`w-6 h-6 flex-shrink-0 ${
                  loading ? 'text-neutral-40' : 'text-tertiary-orange group-hover:text-tertiary-orange/80'
                }`} />
                <h4 className="font-semibold text-base">
                  {loading ? 'Getting Recommendations...' : 'All Children Together'}
                </h4>
              </div>
              <p className={`text-sm ${
                loading ? 'text-neutral-40' : 'text-tertiary-orange/80'
              }`}>
                Activities that all children can participate in together
              </p>
              {loading && (
                <div className="flex items-center space-x-2 mt-3">
                  <div className="w-4 h-4 border-2 border-neutral-30 border-t-neutral-60 rounded-full animate-spin" />
                  <span className="text-xs text-neutral-50">Processing...</span>
                </div>
              )}
            </button>
          )}

          {/* Individual Child Recommendations */}
          {editingProfile.children.map((child, index) => (
            <button
              key={index}
              onClick={() => handleRecommendationClick(child.name.toLowerCase())}
              disabled={loading}
              className={`p-4 rounded-lg text-left transition-all duration-200 border-2 group ${
                loading 
                  ? 'bg-neutral-10 text-neutral-50 cursor-not-allowed border-neutral-20'
                  : 'bg-tertiary-pink/10 hover:bg-tertiary-pink/20 text-tertiary-pink border-tertiary-pink/30 hover:border-tertiary-pink/50 shadow-sm hover:shadow-md'
              }`}
            >
              <div className="flex items-center space-x-3 mb-2">
                <UserGroupIcon className={`w-6 h-6 flex-shrink-0 ${
                  loading ? 'text-neutral-40' : 'text-tertiary-pink group-hover:text-tertiary-pink/80'
                }`} />
                <h4 className="font-semibold text-base">
                  {loading ? 'Getting Recommendations...' : `${child.name}'s Activities`}
                </h4>
              </div>
              <p className={`text-sm mb-2 ${
                loading ? 'text-neutral-40' : 'text-tertiary-pink/80'
              }`}>
                Personalized activities for {child.name} (age {child.age})
              </p>
              {child.interests.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {child.interests.slice(0, 3).map((interest, idx) => (
                    <span 
                      key={idx} 
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        loading 
                          ? 'bg-neutral-20 text-neutral-40'
                          : 'bg-tertiary-pink/20 text-tertiary-pink/90'
                      }`}
                    >
                      {interest}
                    </span>
                  ))}
                  {child.interests.length > 3 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      loading 
                        ? 'bg-neutral-20 text-neutral-40'
                        : 'bg-tertiary-pink/20 text-tertiary-pink/90'
                    }`}>
                      +{child.interests.length - 3} more
                    </span>
                  )}
                </div>
              )}
              {loading && (
                <div className="flex items-center space-x-2 mt-3">
                  <div className="w-4 h-4 border-2 border-neutral-30 border-t-neutral-60 rounded-full animate-spin" />
                  <span className="text-xs text-neutral-50">Processing...</span>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-neutral-50">
            Each recommendation type uses different AI prompts to provide targeted suggestions
          </p>
        </div>
      </div>
    </div>
  );
}