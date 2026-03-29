import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function middleware(request: NextRequest) {
  // Do not run auth check on API routes (they handle their own auth)
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')
  if (isApiRoute) {
    return NextResponse.next()
  }

  const isSetupPage = request.nextUrl.pathname === '/setup'
  const isAuthPage =
    request.nextUrl.pathname === '/auth' ||
    request.nextUrl.pathname === '/super-admin/auth'
  const isPublicPage =
    request.nextUrl.pathname === '/privacy' ||
    request.nextUrl.pathname === '/terms'

  // Setup page is always accessible
  if (isSetupPage) {
    return NextResponse.next()
  }

  // Check if system needs initial setup (no users exist)
  // Only check on auth page to avoid hitting DB on every request
  if (isAuthPage) {
    try {
      const baseUrl = request.nextUrl.origin
      const res = await fetch(`${baseUrl}/api/setup`, {
        headers: { 'x-middleware-check': '1' },
      })
      const data = await res.json()
      if (data.needsSetup) {
        const url = request.nextUrl.clone()
        url.pathname = '/setup'
        return NextResponse.redirect(url)
      }
    } catch {
      // If check fails, continue normally
    }
  }

  const session = await auth()

  // Redirect unauthenticated users from protected routes to /auth
  if (!session?.user && !isAuthPage && !isPublicPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (session?.user && isAuthPage) {
    const url = request.nextUrl.clone()
    const isSuperAdmin = session.user.role === 'super_admin'
    url.pathname = isSuperAdmin ? '/super-admin/dashboard' : '/app/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
