/**
 * Phase Indicator Component
 * 
 * WHY: Visual progress tracking because:
 * - Provides clear navigation and orientation during the demo
 * - Shows progress completion for investor confidence
 * - Allows jumping between phases for demonstration flexibility
 * - Creates professional demo experience with visual feedback
 * - Helps presenters explain the multi-step AI process
 */

'use client';

import { CheckCircleIcon, ArrowRightIcon } from '@heroicons/react/24/solid';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';

export interface Phase {
  id: string;
  title: string;
  subtitle: string;
  icon?: React.ComponentType<{ className?: string }>;
  status: 'pending' | 'active' | 'completed';
}

interface PhaseIndicatorProps {
  phases: Phase[];
  currentPhase: string;
  onPhaseSelect?: (phaseId: string) => void;
  showNavigation?: boolean;
  className?: string;
}

export default function PhaseIndicator({
  phases,
  currentPhase,
  onPhaseSelect,
  showNavigation = true,
  className = '',
}: PhaseIndicatorProps) {
  const currentPhaseIndex = phases.findIndex(p => p.id === currentPhase);
  const completedCount = phases.filter(p => p.status === 'completed').length;
  const progressPercentage = (completedCount / phases.length) * 100;

  return (
    <div className={`bg-neutral-0 rounded-xl shadow-sm border border-neutral-20 p-6 ${className}`}>
      {/* Header with Progress */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">Demo Progress</h2>
          <p className="text-sm text-neutral-60">
            Phase {currentPhaseIndex + 1} of {phases.length} • {completedCount}/{phases.length} completed
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Progress Ring */}
          <div className="relative w-12 h-12">
            <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 48 48">
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                className="text-neutral-20"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - progressPercentage / 100)}`}
                className="text-primary transition-all duration-500"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {Math.round(progressPercentage)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase Steps */}
      <div className="space-y-4">
        {phases.map((phase, index) => {
          const isCompleted = phase.status === 'completed';
          const isActive = phase.status === 'active';
          const isPending = phase.status === 'pending';
          const isClickable = showNavigation && onPhaseSelect;

          return (
            <div key={phase.id} className="flex items-start space-x-4">
              {/* Phase Icon/Status */}
              <div className="flex-shrink-0 relative">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                    isCompleted
                      ? 'bg-green-100 text-green-600'
                      : isActive
                      ? 'bg-primary/10 text-primary border-2 border-primary'
                      : 'bg-neutral-10 text-neutral-50 border border-neutral-30'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : phase.icon ? (
                    <phase.icon className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>

                {/* Connecting Line */}
                {index < phases.length - 1 && (
                  <div
                    className={`absolute top-10 left-5 w-0.5 h-8 transition-colors duration-200 ${
                      phases[index + 1].status === 'completed' || phases[index + 1].status === 'active'
                        ? 'bg-primary'
                        : 'bg-neutral-20'
                    }`}
                  />
                )}
              </div>

              {/* Phase Content */}
              <div 
                className={`flex-1 pb-4 ${
                  isClickable ? 'cursor-pointer group' : ''
                }`}
                onClick={isClickable ? () => onPhaseSelect(phase.id) : undefined}
              >
                <div className="flex items-center space-x-2">
                  <h3
                    className={`font-medium transition-colors duration-200 ${
                      isCompleted
                        ? 'text-green-700'
                        : isActive
                        ? 'text-primary'
                        : 'text-neutral-60'
                    } ${isClickable ? 'group-hover:text-primary' : ''}`}
                  >
                    {phase.title}
                  </h3>

                  {isActive && (
                    <div className="flex space-x-1">
                      <EllipsisHorizontalIcon className="w-4 h-4 text-primary animate-pulse" />
                    </div>
                  )}

                  {isClickable && !isActive && (
                    <ArrowRightIcon className="w-3 h-3 text-neutral-40 group-hover:text-primary transition-colors duration-200" />
                  )}
                </div>

                <p
                  className={`text-sm mt-1 transition-colors duration-200 ${
                    isCompleted
                      ? 'text-green-600'
                      : isActive
                      ? 'text-neutral-70'
                      : 'text-neutral-50'
                  } ${isClickable ? 'group-hover:text-neutral-70' : ''}`}
                >
                  {phase.subtitle}
                </p>

                {/* Active Phase Highlight */}
                {isActive && (
                  <div className="mt-2 h-1 bg-gradient-to-r from-primary to-secondary rounded-full animate-pulse" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="mt-6 pt-4 border-t border-neutral-20">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-green-600">{completedCount}</div>
            <div className="text-xs text-neutral-50">Completed</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-primary">
              {phases.filter(p => p.status === 'active').length}
            </div>
            <div className="text-xs text-neutral-50">Active</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-neutral-60">
              {phases.filter(p => p.status === 'pending').length}
            </div>
            <div className="text-xs text-neutral-50">Remaining</div>
          </div>
        </div>
      </div>
    </div>
  );
}