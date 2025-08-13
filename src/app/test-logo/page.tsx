/**
 * Test Page for Recess Logo Implementation
 * 
 * This page demonstrates the different logo implementations and configurations.
 * It's a temporary page for testing and can be removed after verification.
 */

'use client';

import RecessHeader from '@/components/RecessHeader';
import RecessHeaderWithOptions from '@/components/RecessHeaderWithOptions';
import RecessIcon from '@/components/icons/RecessIcon';
import RecessTextLogo from '@/components/icons/RecessTextLogo';

export default function TestLogoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main header with implemented logo */}
      <RecessHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Recess Logo Implementation Test
        </h1>
        
        <div className="space-y-12">
          {/* Logo Components Showcase */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Individual Logo Components
            </h2>
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Icon (Default Size)</h3>
                <div className="flex items-center space-x-4">
                  <div className="bg-primary p-4 rounded">
                    <RecessIcon className="text-white" width={40} height={42} />
                  </div>
                  <div className="bg-gray-100 p-4 rounded">
                    <RecessIcon className="text-primary" width={40} height={42} />
                  </div>
                  <div className="bg-secondary p-4 rounded">
                    <RecessIcon className="text-primary" width={40} height={42} />
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Icon (Various Sizes)</h3>
                <div className="flex items-end space-x-4">
                  <RecessIcon className="text-primary" width={24} height={25} />
                  <RecessIcon className="text-primary" width={32} height={34} />
                  <RecessIcon className="text-primary" width={48} height={50} />
                  <RecessIcon className="text-primary" width={64} height={67} />
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Text Logo</h3>
                <div className="space-y-2">
                  <RecessTextLogo className="text-primary" width={122} height={32} />
                  <RecessTextLogo className="text-gray-600" width={91} height={24} />
                  <RecessTextLogo className="text-black" width={61} height={16} />
                </div>
              </div>
            </div>
          </section>
          
          {/* Header Variations */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Header Variations
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Icon with Text (Default)</h3>
                <div className="border rounded-lg overflow-hidden">
                  <RecessHeaderWithOptions logoStyle="icon-with-text" />
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Icon with SVG Text Logo</h3>
                <div className="border rounded-lg overflow-hidden">
                  <RecessHeaderWithOptions logoStyle="icon-with-svg-text" />
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Icon Only (Mobile-First)</h3>
                <div className="border rounded-lg overflow-hidden">
                  <RecessHeaderWithOptions logoStyle="icon-only" />
                </div>
              </div>
            </div>
          </section>
          
          {/* Usage Examples */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Combined Usage Examples
            </h2>
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              <div className="flex items-center space-x-3">
                <RecessIcon className="text-primary" width={32} height={34} />
                <RecessTextLogo className="text-gray-900" width={61} height={16} />
              </div>
              
              <div className="flex items-center space-x-3">
                <RecessIcon className="text-secondary" width={40} height={42} />
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Recess</h3>
                  <p className="text-sm text-gray-600">Your childcare concierge</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}