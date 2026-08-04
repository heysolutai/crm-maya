import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import type { AppRole } from '@prisma/client'
import { getClientIp, logSecurityEvent } from '@/lib/security-log'

/**
 * Tempo ocioso ate deslogar. Quem esta mexendo no sistema renova o token
 * antes disso e nao percebe o limite; quem largou a aba cai.
 */
const INATIVIDADE_MAX = 60 * 60 // 1 hora

/**
 * Teto ABSOLUTO da sessao, contado do login. Vale mesmo com uso continuo.
 *
 * Sem ele, a renovacao por atividade tornaria a sessao eterna na pratica: um
 * navegador aberto o dia inteiro (ou uma aba esquecida numa maquina
 * compartilhada) seguiria autenticado indefinidamente. Passado esse tempo,
 * precisa entrar de novo.
 */
const SESSAO_MAX = 3 * 60 * 60 // 3 horas

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: AppRole | null
      companyId: string | null
      isSuperAdmin: boolean
    }
  }

  interface User {
    role?: AppRole | null
    companyId?: string | null
  }
}

declare module 'next-auth' {
  interface JWT {
    id: string
    role: AppRole | null
    companyId: string | null
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials, request) {
        const ip = request ? getClientIp(request as Request) : null
        const userAgent = request ? (request as Request).headers.get('user-agent') : null
        const email = (credentials?.email as string) || ''

        if (!email || !credentials?.password) return null
        const password = credentials.password as string

        // Anti brute-force: bloqueia apos muitas falhas recentes pro mesmo email
        // (independente de IP — robusto contra spoof de x-forwarded-for).
        try {
          const recentFails = await prisma.loginLog.count({
            where: {
              email,
              event: 'login_failed',
              createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
            },
          })
          if (recentFails >= 8) {
            await logSecurityEvent({ event: 'login_locked', email, ip, userAgent })
            return null
          }
        } catch {
          // best-effort: se a checagem falhar, nao trava o login
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            userRoles: {
              select: { role: true, companyId: true },
            },
          },
        })

        // Falha (usuario inexistente / inativo): registra email + IP e nega.
        if (!user || !user.passwordHash || !user.isActive) {
          await logSecurityEvent({ event: 'login_failed', email, ip, userAgent })
          return null
        }

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) {
          await logSecurityEvent({ event: 'login_failed', email, ip, userAgent })
          return null
        }

        const superAdminRole = user.userRoles.find(r => r.role === 'super_admin')
        // Pick the highest-privilege company role for this user's company
        const roleHierarchy = ['company_admin', 'manager', 'agent', 'viewer']
        const companyRoles = user.userRoles
          .filter(r => r.companyId)
          .sort((a, b) => roleHierarchy.indexOf(a.role) - roleHierarchy.indexOf(b.role))
        const companyRole = companyRoles[0] || null
        const companyId = companyRole?.companyId ?? null

        // Login OK: atualiza lastLogin + registra evento. Best-effort — uma
        // falha aqui NUNCA pode impedir o login.
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date(), lastLoginIp: ip },
          })
        } catch (e) {
          console.error('[auth] falha ao gravar lastLogin (ignorado):', (e as Error)?.message)
        }
        await logSecurityEvent({ event: 'login_success', userId: user.id, email: user.email, companyId, ip, userAgent })

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: superAdminRole?.role ?? companyRole?.role ?? null,
          companyId,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt' as const,
    /**
     * Janela de INATIVIDADE, nao duracao da sessao.
     *
     * O token e reemitido a cada acesso a sessao (ver updateAge), entao quem
     * esta usando o sistema nunca chega nesse limite — ele so vence pra quem
     * largou a aba. Antes eram 30 dias, o que na pratica significava sessao
     * eterna: dava pra sumir por dois meses e voltar logado.
     */
    maxAge: INATIVIDADE_MAX,
    /**
     * De quanto em quanto tempo o token pode ser renovado. Sem isso o padrao
     * e 24h — ou seja, a renovacao nunca aconteceria dentro de uma janela de
     * 1 hora e todo mundo cairia no meio do expediente.
     */
    updateAge: 5 * 60,
  },
  pages: {
    signIn: '/auth',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!
        token.role = (user as any).role ?? null
        token.companyId = (user as any).companyId ?? null
        token.checkedAt = Math.floor(Date.now() / 1000)
        // Marca do login. E o que permite o teto absoluto — sem gravar aqui,
        // a renovacao por atividade nao teria contra o que ser comparada.
        token.loginAt = Math.floor(Date.now() / 1000)
        return token
      }

      // Teto absoluto: passou de SESSAO_MAX desde o login, cai — nao importa
      // o quanto a pessoa esteja usando. Retornar null invalida o token e o
      // middleware manda pro /auth.
      const loginAt = (token.loginAt as number) || 0
      if (loginAt && Math.floor(Date.now() / 1000) - loginAt > SESSAO_MAX) {
        return null
      }
      // Revogacao: re-checa isActive + role no banco no maximo a cada 5 min.
      // Assim desativar/demitir/demover um usuario tem efeito em ate 5 min
      // (antes o token de 30 dias nunca era re-checado).
      const now = Math.floor(Date.now() / 1000)
      const lastCheck = (token.checkedAt as number) || 0
      if (token.id && now - lastCheck > 300) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { isActive: true, userRoles: { select: { role: true, companyId: true } } },
          })
          if (!dbUser || !dbUser.isActive) return null
          const superAdminRole = dbUser.userRoles.find((r) => r.role === 'super_admin')
          const roleHierarchy = ['company_admin', 'manager', 'agent', 'viewer']
          const companyRole =
            dbUser.userRoles
              .filter((r) => r.companyId)
              .sort((a, b) => roleHierarchy.indexOf(a.role) - roleHierarchy.indexOf(b.role))[0] || null
          token.role = superAdminRole?.role ?? companyRole?.role ?? null
          token.companyId = companyRole?.companyId ?? null
          token.checkedAt = now
        } catch {
          // best-effort: um blip do banco nao desloga todo mundo
        }
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as AppRole | null
      session.user.companyId = token.companyId as string | null
      session.user.isSuperAdmin = token.role === 'super_admin'
      return session
    },
  },
})
