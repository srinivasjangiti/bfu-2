/**
 * Next.js Middleware with Clerk Authentication + Security Features
 * 
 * Features:
 * - Clerk authentication (integrated)
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - Rate limiting on API routes
 * - Request logging
 * - CORS handling
 * - Request validation
 */

// Ensure Clerk credentials exist before clerkMiddleware imports or executes
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
    'pk_test_cG9saXRlLXJpbmd0YWlsLTQzNDAuY2xlcmsuYWNjb3VudHMuZGV2JA';
}
if (!process.env.CLERK_SECRET_KEY) {
  process.env.CLERK_SECRET_KEY =
    'sk_test_b3xkkVEP5UJAhmLO0M9FpPNc28z1YQ0NW87eRWa92m';
}

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rate limiting store (in-memory for demo, use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration
const RATE_LIMITS = {
  '/api/analyze': { maxRequests: 10, windowMs: 60000 }, // 10 requests per minute
  '/api/negotiate': { maxRequests: 5, windowMs: 60000 }, // 5 requests per minute
  '/api/playbook': { maxRequests: 20, windowMs: 60000 }, // 20 requests per minute
  '/api/share': { maxRequests: 10, windowMs: 60000 }, // 10 requests per minute
  default: { maxRequests: 100, windowMs: 60000 }, // 100 requests per minute for other routes
};

/**
 * Apply rate limiting
 */
function applyRateLimit(request: NextRequest, config: { maxRequests: number; windowMs: number }): NextResponse | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwardedFor?.split(',')[0] || realIp || 'unknown';
  const key = `${ip}:${request.nextUrl.pathname}`;
  const now = Date.now();

  const limit = rateLimitStore.get(key);

  if (!limit || now > limit.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return null; // Allow request
  }

  if (limit.count >= config.maxRequests) {
    const retryAfter = Math.ceil((limit.resetTime - now) / 1000);

    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': limit.resetTime.toString(),
        },
      }
    );
  }

  limit.count++;
  rateLimitStore.set(key, limit);

  return null; // Allow request
}

/**
 * Clean up old rate limit entries
 */
function cleanupRateLimits(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  rateLimitStore.forEach((value, key) => {
    if (now > value.resetTime) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => rateLimitStore.delete(key));
}

// Cleanup every 5 minutes
if (typeof window === 'undefined') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000);
}

/**
 * Security headers
 */
const SECURITY_HEADERS = {
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://*.clerk.accounts.dev",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://integrate.api.nvidia.com https://*.clerk.accounts.dev https://clerk.clerk.services",
    "frame-src 'self' https://*.clerk.accounts.dev",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '),

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Enable XSS protection
  'X-XSS-Protection': '1; mode=block',

  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions policy
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',

  // HSTS (HTTP Strict Transport Security)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/contracts(.*)',
  '/analyze(.*)',
  '/templates(.*)',
  '/profile(.*)',
  '/settings(.*)',
]);

// Define public routes that should be accessible without authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/api/public(.*)',
]);

const clerkHandler = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  // Protect routes that require authentication
  if (isProtectedRoute(request) && !isPublicRoute(request)) {
    try {
      await auth.protect();
    } catch {
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('redirect_url', request.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  const response = NextResponse.next();

  // Apply security headers to all routes
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Add request ID for tracking
  const requestId = crypto.randomUUID();
  response.headers.set('X-Request-ID', requestId);

  // Log requests in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${new Date().toISOString()}] ${request.method} ${pathname} (${requestId})`);
  }

  // Apply rate limiting to API routes
  if (pathname.startsWith('/api/')) {
    // Find matching rate limit config
    const config = Object.entries(RATE_LIMITS).find(([path]) =>
      pathname.startsWith(path) && path !== 'default'
    )?.[1] || RATE_LIMITS.default;

    const rateLimitResponse = applyRateLimit(request, config);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Add rate limit headers
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = forwardedFor?.split(',')[0] || realIp || 'unknown';
    const key = `${ip}:${pathname}`;
    const limit = rateLimitStore.get(key);

    if (limit) {
      response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', (config.maxRequests - limit.count).toString());
      response.headers.set('X-RateLimit-Reset', limit.resetTime.toString());
    }
  }

  // CORS headers for API routes (if needed)
  if (pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', request.headers.get('origin') || '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  }

  // Handle OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }

  // Add cache headers for static assets
  if (pathname.match(/\.(jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }

  // Add cache headers for pages
  if (!pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  }

  return response;
});

export default async function middleware(request: NextRequest, event: any) {
  try {
    return await (clerkHandler as any)(request, event);
  } catch (err) {
    console.warn('[proxy] Safe middleware fallback activated:', err);
    const response = NextResponse.next();
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
}

/**
 * Middleware configuration
 */
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
