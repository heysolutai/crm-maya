'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from 'next-auth/react'
import type { AppRole } from '@prisma/client'

interface AuthContextType {
  user: {
    id: string
    email: string
    user_metadata?: { full_name?: string }
  } | null
  session: any
  role: AppRole | null
  companyId: string | null
  isSuperAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (email: string, password: string, fullName: string, companyName: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const loading = status === 'loading'

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email!,
        user_metadata: { full_name: session.user.name ?? undefined },
      }
    : null

  const role = (session?.user?.role as AppRole) ?? null
  const companyId = (session?.user?.companyId as string) ?? null
  const isSuperAdmin = role === 'super_admin'

  const signIn = async (email: string, password: string) => {
    try {
      const result = await nextAuthSignIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        return { error: { message: 'Email ou senha inválidos' } }
      }
      return { error: null }
    } catch (err: any) {
      return { error: { message: err.message || 'Erro ao fazer login' } }
    }
  }

  const signUp = async (email: string, password: string, fullName: string, companyName: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, companyName }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { error: { message: data.error || 'Erro ao criar conta' } }
      }
      // Loga automatico apos cadastrar — o dono cai direto no dashboard (checklist).
      const signInResult = await nextAuthSignIn('credentials', { email, password, redirect: false })
      if (signInResult?.error) {
        return { error: { message: 'Conta criada! Faca login para entrar.' } }
      }
      return { error: null }
    } catch (err: any) {
      return { error: { message: err.message || 'Erro ao criar conta' } }
    }
  }

  const signOutFn = async () => {
    await nextAuthSignOut({ redirect: true, callbackUrl: '/auth' })
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        companyId,
        isSuperAdmin,
        loading,
        signIn,
        signUp,
        signOut: signOutFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
