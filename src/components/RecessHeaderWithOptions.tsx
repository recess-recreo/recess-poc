/**
 * Recess Header Component with Logo Options
 * 
 * Alternate version of the header that showcases different logo configurations.
 * This component demonstrates various ways to implement the Recess branding.
 * 
 * WHY: Created to provide flexibility in logo presentation:
 * - Option 1: Icon + text name (current default)
 * - Option 2: Icon + text logo SVG
 * - Option 3: Icon only (for mobile/compact views)
 * 
 * USAGE: Replace RecessHeader with this component in layout.tsx to test different options
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import RecessIcon from './icons/RecessIcon';
import RecessTextLogo from './icons/RecessTextLogo';

interface RecessHeaderProps {
  className?: string;
  logoStyle?: 'icon-with-text' | 'icon-with-svg-text' | 'icon-only';
}

export default function RecessHeaderWithOptions({ 
  className = '',
  logoStyle = 'icon-with-text'
}: RecessHeaderProps) {
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
            <Link href="/" className="flex-shrink-0 flex items-center group">
              
              {logoStyle === 'icon-with-text' && (
                <>
                  {/* Icon with HTML text */}
                  <div className="flex items-center justify-center mr-3 transition-transform duration-200 group-hover:scale-105">
                    <RecessIcon 
                      width={32} 
                      height={34} 
                      className="text-white"
                    />
                  </div>
                  <div className="text-white">
                    <h1 className="text-xl font-bold tracking-tight">
                      Recess
                    </h1>
                    <p className="text-xs text-brand-blue-100 -mt-1">
                      Concierge Demo
                    </p>
                  </div>
                </>
              )}

              {logoStyle === 'icon-with-svg-text' && (
                <>
                  {/* Icon with SVG text logo */}
                  <div className="flex items-center justify-center mr-3 transition-transform duration-200 group-hover:scale-105">
                    <RecessIcon 
                      width={32} 
                      height={34} 
                      className="text-white"
                    />
                  </div>
                  <div className="flex flex-col">
                    <RecessTextLogo 
                      width={61} 
                      height={16} 
                      className="text-white"
                    />
                    <p className="text-xs text-brand-blue-100 mt-0.5">
                      Concierge Demo
                    </p>
                  </div>
                </>
              )}

              {logoStyle === 'icon-only' && (
                <>
                  {/* Icon only with larger size */}
                  <div className="flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                    <RecessIcon 
                      width={40} 
                      height={42} 
                      className="text-white"
                    />
                  </div>
                  <div className="ml-3 text-white md:block hidden">
                    <h1 className="text-xl font-bold tracking-tight">
                      Recess
                    </h1>
                    <p className="text-xs text-brand-blue-100 -mt-1">
                      Concierge Demo
                    </p>
                  </div>
                </>
              )}
              
            </Link>
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