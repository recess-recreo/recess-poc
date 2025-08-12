import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only protect the demo routes
  if (request.nextUrl.pathname.startsWith('/demo')) {
    // Check if user is authenticated (simple check)
    const isAuthenticated = request.headers.get('cookie')?.includes('poc-authenticated=true');
    
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/demo/:path*']
};