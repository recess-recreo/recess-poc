/**
 * Recess Header Component - Brand-focused navigation header
 * 
 * Features:
 * - Recess brand colors and styling
 * - Responsive design with mobile menu
 * - Clean, professional layout
 * - Accessible navigation patterns
 */

'use client';

import { useState } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface RecessHeaderProps {
  className?: string;
}

export default function RecessHeader({ className = '' }: RecessHeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const navigationItems = [
    { name: 'Demo', href: '/demo/poc1', current: true },
    { name: 'About', href: '#about' },
    { name: 'Contact', href: '#contact' },
  ];

  return (
    <header className={`bg-primary shadow-sm relative z-50 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              {/* Recess Logo Icon */}
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center mr-3">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5 text-primary"
                  aria-hidden="true"
                >
                  <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" />
                </svg>
              </div>
              <div className="text-white">
                <h1 className="text-xl font-bold tracking-tight">
                  Recess
                </h1>
                <p className="text-xs text-brand-blue-100 -mt-1">
                  Concierge Demo
                </p>
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            {navigationItems.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                  item.current
                    ? 'bg-brand-blue-600 text-white'
                    : 'text-brand-blue-100 hover:bg-brand-blue-600 hover:text-white'
                }`}
                aria-current={item.current ? 'page' : undefined}
              >
                {item.name}
              </a>
            ))}
          </nav>

          {/* CTA Button */}
          <div className="hidden md:flex items-center">
            <button
              type="button"
              className="bg-secondary hover:bg-brand-yellow-600 text-primary px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 shadow-sm hover:shadow-md"
            >
              Get Started
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="text-brand-blue-100 hover:text-white p-2 rounded-md transition-colors"
              aria-expanded={isMobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? (
                <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-brand-blue-600 border-t border-brand-blue-500">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navigationItems.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className={`block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200 ${
                  item.current
                    ? 'bg-brand-blue-700 text-white'
                    : 'text-brand-blue-100 hover:bg-brand-blue-700 hover:text-white'
                }`}
                aria-current={item.current ? 'page' : undefined}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.name}
              </a>
            ))}
            {/* Mobile CTA */}
            <div className="pt-4 border-t border-brand-blue-500 mt-4">
              <button
                type="button"
                className="w-full bg-secondary hover:bg-brand-yellow-600 text-primary px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}