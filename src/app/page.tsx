'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Simple password authentication
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Simple password check
    const DEMO_PASSWORD = 'recess2024';
    
    if (password === DEMO_PASSWORD) {
      // Store auth in sessionStorage for client-side checks
      sessionStorage.setItem('poc-authenticated', 'true');
      
      // Set cookie for middleware authentication
      document.cookie = 'poc-authenticated=true; path=/; max-age=86400'; // 24 hours
      
      router.push('/demo/poc1');
    } else {
      setError('Incorrect password. Please try again.');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Recess POC</h1>
          <p className="text-gray-600">Enter password to access demo</p>
        </div>

        {/* Login Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className={`w-full py-2 px-4 rounded-md text-white font-medium ${
                loading || !password
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
              }`}
            >
              {loading ? 'Loading...' : 'Submit'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}