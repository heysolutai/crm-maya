import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

// ─── Rate Limiting (in-memory, por IP) ──────────────────────
// Limites generosos: super-admin que carrega multiplas empresas + dashboard
// com polling de 10s em varios endpoints + SSE consome facil >300 req/min.
// Configuravel via env pra ajustar sem rebuild.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_API = parseInt(process.env.RATE_LIMIT_MAX_API || '1500', 10)
const RATE_LIMIT_MAX_PAGE = parseInt(process.env.RATE_LIMIT_MAX_PAGE || '600', 10)

function checkRateLimit(ip: string, isApi: boolean): boolean {
  // IP "unknown" agrupa tudo num bucket so — desativa rate limit nesse caso
  // pra evitar punir todo mundo quando o proxy nao forwards o header direito.
  if (ip === 'unknown') return true

  const now = Date.now()
  const key = `${ip}:${isApi ? 'api' : 'page'}`
  const limit = isApi ? RATE_LIMIT_MAX_API : RATE_LIMIT_MAX_PAGE
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  entry.count++
  return entry.count <= limit
}

// Limpar entries expiradas a cada 5 minutos
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key)
  }
}, 300_000)

// ─── Security Headers ───────────────────────────────────────
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  return response
}

export async function middleware(request: NextRequest) {
  // x-real-ip e setado pelo nginx como IP unico do cliente (proxy_set_header X-Real-IP $remote_addr)
  // x-forwarded-for pode ter cadeia (proxy1, proxy2, cliente) — pegamos o primeiro
  const ip =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'

  // ─── Rate Limiting ─────────────────────────────────────
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')
  const isWebhook = request.nextUrl.pathname.startsWith('/api/webhooks/')
  const isCron = request.nextUrl.pathname.startsWith('/api/cron/')

  // Webhooks e cron não têm rate limit (vem de serviços confiáveis)
  if (!isWebhook && !isCron && !checkRateLimit(ip, isApiRoute)) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    )
  }

  // API routes handle their own auth
  if (isApiRoute) {
    return addSecurityHeaders(NextResponse.next())
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
    return addSecurityHeaders(NextResponse.next())
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

  // ─── Role-based page access control ─────────────────────
  if (session?.user && request.nextUrl.pathname.startsWith('/app/')) {
    const role = session.user.role as string | null
    const pathname = request.nextUrl.pathname

    // Super admin tem acesso a tudo (necessario para impersonation/debugging)
    const isSuperAdmin = role === 'super_admin'

    // Pages restricted to company_admin only
    const adminOnlyPages = ['/app/settings', '/app/team', '/app/departments', '/app/ai-settings']
    if (adminOnlyPages.some(p => pathname.startsWith(p)) && !isSuperAdmin && role !== 'company_admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/app/dashboard'
      return NextResponse.redirect(url)
    }

    // Pages restricted to manager+ (manager, company_admin)
    const managerPages = ['/app/follow-ups', '/app/api-docs']
    if (managerPages.some(p => pathname.startsWith(p)) && !isSuperAdmin && !['manager', 'company_admin'].includes(role || '')) {
      const url = request.nextUrl.clone()
      url.pathname = '/app/dashboard'
      return NextResponse.redirect(url)
    }

    // Pages restricted to agent+ (agent, manager, company_admin)
    const agentPages = ['/app/conversations', '/app/crm', '/app/products', '/app/catalog', '/app/appointments', '/app/my-schedule', '/app/daily-report']
    if (agentPages.some(p => pathname.startsWith(p)) && !isSuperAdmin && !['agent', 'manager', 'company_admin'].includes(role || '')) {
      const url = request.nextUrl.clone()
      url.pathname = '/app/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // ─── Super admin pages ──────────────────────────────────
  if (session?.user && request.nextUrl.pathname.startsWith('/super-admin/')) {
    const isSuperAdmin = session.user.role === 'super_admin'
    if (!isSuperAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/app/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return addSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
