'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Lock, Mail, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function SuperAdminAuthPage() {
  const router = useRouter()
  const { signIn, user, isSuperAdmin, signOut, loading, role } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      if (isSuperAdmin) {
        router.replace('/super-admin/dashboard')
      } else if (role) {
        toast.error('Acesso negado', {
          description: 'Você não tem permissão de Super Admin.',
        })
        signOut()
      }
    }
  }, [loading, user, isSuperAdmin, role, router, signOut])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const { error } = await signIn(email, password)
      if (error) {
        toast.error('Erro ao fazer login', {
          description: error.message || 'Verifique suas credenciais.',
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Link href="/" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao início
          </Link>
        </div>

        <Card className="border-slate-700/50 bg-slate-800/50 backdrop-blur">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Shield className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-xl">Super Admin</CardTitle>
            <CardDescription>Acesso restrito a administradores do sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Acessar painel'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
