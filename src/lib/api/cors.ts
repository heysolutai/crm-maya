import { NextResponse } from 'next/server';

const allowedOrigins = process.env.NEXT_PUBLIC_APP_URL
  ? [process.env.NEXT_PUBLIC_APP_URL, ...(process.env.CORS_EXTRA_ORIGINS?.split(',') || [])]
  : ['*'];

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  if (allowedOrigins.includes('*')) return '*';
  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
}

export function getCorsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-internal-key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

/** @deprecated Use getCorsHeaders(req) for origin-aware CORS */
export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigins.includes('*') ? '*' : allowedOrigins[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-internal-key',
};

export function handleCors(req: Request): NextResponse | null {
  if (req.method === 'OPTIONS') {
    return NextResponse.json(null, { headers: getCorsHeaders(req) });
  }
  return null;
}

export function jsonResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: corsHeaders });
}

export function successResponse(data: unknown): NextResponse {
  return jsonResponse(data, 200);
}

export function errorResponse(
  error: string | Error,
  status = 500,
  details?: string
): NextResponse {
  const message = error instanceof Error ? error.message : error;
  const body = details
    ? { error: message, success: false, details }
    : { error: message, success: false };
  return jsonResponse(body, status);
}

export function badRequestResponse(message: string): NextResponse {
  return errorResponse(message, 400);
}

export function unauthorizedResponse(message = 'Unauthorized'): NextResponse {
  return errorResponse(message, 401);
}

export function notFoundResponse(message = 'Not found'): NextResponse {
  return errorResponse(message, 404);
}
