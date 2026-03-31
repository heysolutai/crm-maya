'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, MessageSquare, Calendar, Sparkles } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useBranding } from '@/hooks/useBranding'

export default function AuthPage() {
  const router = useRouter()
  const { signIn, signUp, user, role, companyId, loading: authLoading } = useAuth()
  const { branding } = useBranding()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!authLoading && user && role) {
      if (role === 'super_admin' && !companyId) {
        router.replace('/super-admin/dashboard')
      } else if (companyId) {
        router.replace('/app/dashboard')
      }
    }
  }, [authLoading, user, role, companyId, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      if (isLogin) {
        const { error } = await signIn(email, password)
        if (error) {
          toast.error('Erro ao fazer login', {
            description: error.message || 'Verifique suas credenciais.',
          })
        } else {
          toast.success('Login realizado com sucesso!')
        }
      } else {
        const { error } = await signUp(email, password, fullName)
        if (error) {
          toast.error('Erro ao criar conta', {
            description: error.message,
          })
        } else {
          toast.success('Conta criada!', {
            description: 'Verifique seu email para confirmar.',
          })
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Ocorreu um erro')
    } finally {
      setIsSubmitting(false)
    }
  }

  const features = [
    { icon: Sparkles, label: 'Atendimento automatizado 24/7', bg: 'bg-mileto-green/20', text: 'text-mileto-green' },
    { icon: MessageSquare, label: 'Integração com WhatsApp', bg: 'bg-mileto-cyan/20', text: 'text-mileto-cyan' },
    { icon: Calendar, label: 'Agendamentos inteligentes', bg: 'bg-mileto-blue/20', text: 'text-mileto-blue' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-mileto-dark" />
        <div className="absolute inset-0 bg-gradient-to-br from-mileto-green/20 via-mileto-cyan/10 to-mileto-blue/20" />

        {/* Decorative blur circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-mileto-green/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-mileto-cyan/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-mileto-blue/10 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          {branding.logoUrl ? (
            <Image src={branding.logoUrl} alt={branding.systemName} className="w-40 h-40 mb-8 drop-shadow-2xl" width={160} height={160} />
          ) : (
            <Image src="/logo-mileto.png" alt={branding.systemName} className="w-40 h-40 mb-8 drop-shadow-2xl" width={160} height={160} />
          )}

          <h1 className="text-4xl font-bold text-white mb-4 text-center">
            <span className="bg-gradient-to-r from-mileto-green via-mileto-cyan to-mileto-blue bg-clip-text text-transparent">
              {branding.systemName}
            </span>
          </h1>

          <p className="text-white/70 text-lg text-center max-w-md mb-10">
            {branding.loginDescription || 'O CRM mais inteligente para impulsionar suas vendas com Inteligência Artificial'}
          </p>

          {/* Features */}
          <div className="space-y-4 text-white/80">
            {features.map((feature) => (
              <div key={feature.label} className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full ${feature.bg} flex items-center justify-center`}>
                  <feature.icon className={`w-4 h-4 ${feature.text}`} />
                </div>
                <span>{feature.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            {branding.logoUrl ? (
              <Image src={branding.logoUrl} alt={branding.systemName} className="w-24 h-24 mb-4" width={96} height={96} />
            ) : (
              <Image src="/logo-mileto.png" alt={branding.systemName} className="w-24 h-24 mb-4" width={96} height={96} />
            )}
            <h1 className="text-2xl font-bold bg-gradient-to-r from-mileto-green via-mileto-cyan to-mileto-blue bg-clip-text text-transparent">
              {branding.systemName}
            </h1>
          </div>

          {/* Form Header */}
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-foreground">
              {isLogin ? 'Bem-vindo!' : 'Crie sua conta'}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {isLogin
                ? 'Entre com suas credenciais para acessar o painel'
                : 'Preencha os dados para começar a usar o sistema'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">
                  Nome Completo
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="João Silva"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="pl-10 h-12 bg-muted/50 border-border/50 focus:border-mileto-green focus:ring-mileto-green/20"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-12 bg-muted/50 border-border/50 focus:border-mileto-green focus:ring-mileto-green/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-10 pr-10 h-12 bg-muted/50 border-border/50 focus:border-mileto-green focus:ring-mileto-green/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {isLogin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm text-mileto-green hover:text-mileto-cyan transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-primary to-mileto-cyan hover:opacity-90 text-white font-semibold shadow-lg shadow-primary/25 transition-all duration-300 group"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Carregando...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>{isLogin ? 'Entrar' : 'Criar Conta'}</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isLogin ? 'Não tem uma conta? ' : 'Já tem uma conta? '}
                <span className="font-semibold text-mileto-green hover:text-mileto-cyan transition-colors">
                  {isLogin ? 'Cadastre-se' : 'Entre'}
                </span>
              </button>
            </div>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground">
            Ao continuar, você concorda com nossos{' '}
            <Link href="/terms" className="text-mileto-green hover:underline">Termos de Uso</Link>
            {' '}e{' '}
            <Link href="/privacy" className="text-mileto-green hover:underline">Política de Privacidade</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
