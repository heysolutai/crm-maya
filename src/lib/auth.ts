import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import type { AppRole } from '@prisma/client'

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email as string
        const password = credentials.password as string

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            userRoles: {
              select: { role: true, companyId: true },
            },
          },
        })

        if (!user || !user.passwordHash) return null
        if (!user.isActive) return null

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) return null

        const superAdminRole = user.userRoles.find(r => r.role === 'super_admin')
        // Pick the highest-privilege company role for this user's company
        const roleHierarchy = ['company_admin', 'manager', 'agent', 'viewer']
        const companyRoles = user.userRoles
          .filter(r => r.companyId)
          .sort((a, b) => roleHierarchy.indexOf(a.role) - roleHierarchy.indexOf(b.role))
        const companyRole = companyRoles[0] || null

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: superAdminRole?.role ?? companyRole?.role ?? null,
          companyId: companyRole?.companyId ?? null,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
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
