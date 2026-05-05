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
    { icon: Sparkles, label: 'Atendimento automatizado 24/7' },
    { icon: MessageSquare, label: 'Integração com WhatsApp' },
    { icon: Calendar, label: 'Agendamentos inteligentes' },
  ]

  // Inicial do nome do sistema pra usar como fallback quando nao ha logo
  const initial = (branding.systemName || 'C').trim().charAt(0).toUpperCase()

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-brand-surface">
        {/* Glow focal central — destaque atras da logo, sem wash de cor uniforme */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-brand-primary/30 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] bg-brand-light/20 rounded-full blur-[80px]" />

        {/* Vinheta sutil pras bordas escurecerem (profundidade) */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          {/* Logo com halo radial pra destacar */}
          <div className="relative mb-10">
            <div className="absolute inset-0 -m-12 bg-brand-primary/25 rounded-full blur-3xl" />
            <div className="absolute inset-0 -m-6 bg-brand-primary/15 rounded-full blur-2xl" />

            {branding.logoUrl ? (
              <Image
                src={branding.logoUrl}
                alt={branding.systemName}
                className="relative w-auto h-auto max-w-sm max-h-56 object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
                width={500}
                height={500}
                priority
              />
            ) : (
              <div className="relative w-36 h-36 rounded-3xl bg-gradient-to-br from-brand-primary to-brand-deep flex items-center justify-center shadow-2xl">
                <span className="text-white text-6xl font-bold">{initial}</span>
              </div>
            )}
          </div>

          {/* So mostra o nome se NAO tem logo (logo geralmente ja contem o nome) */}
          {!branding.logoUrl && (
            <h1 className="text-4xl font-bold text-white mb-4 text-center">
              <span className="bg-gradient-to-r from-brand-primary via-brand-light to-brand-deep bg-clip-text text-transparent">
                {branding.systemName}
              </span>
            </h1>
          )}

          <p className="text-white/70 text-lg text-center max-w-md mb-10 leading-relaxed">
            {branding.loginDescription || 'O CRM mais inteligente para impulsionar suas vendas com Inteligência Artificial'}
          </p>

          {/* Features — bullets discretos, todos usam a cor primaria */}
          <div className="space-y-3 text-white/80">
            {features.map((feature) => (
              <div key={feature.label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/5 ring-1 ring-white/10 backdrop-blur-sm flex items-center justify-center">
                  <feature.icon className="w-4 h-4 text-brand-primary" />
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
              <Image
                src={branding.logoUrl}
                alt={branding.systemName}
                className="max-w-[160px] max-h-24 w-auto h-auto object-contain mb-4"
                width={200}
                height={120}
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-brand-primary to-brand-deep flex items-center justify-center mb-4">
                <span className="text-white text-3xl font-bold">{initial}</span>
              </div>
            )}
            <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-primary via-brand-light to-brand-deep bg-clip-text text-transparent">
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
                    className="pl-10 h-12 bg-muted/50 border-border/50 focus:border-brand-primary focus:ring-brand-primary/20"
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
                  className="pl-10 h-12 bg-muted/50 border-border/50 focus:border-brand-primary focus:ring-brand-primary/20"
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
                  className="pl-10 pr-10 h-12 bg-muted/50 border-border/50 focus:border-brand-primary focus:ring-brand-primary/20"
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
                  className="text-sm text-brand-primary hover:text-brand-light transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-primary to-brand-light hover:opacity-90 text-white font-semibold shadow-lg shadow-primary/25 transition-all duration-300 group"
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
                <span className="font-semibold text-brand-primary hover:text-brand-light transition-colors">
                  {isLogin ? 'Cadastre-se' : 'Entre'}
                </span>
              </button>
            </div>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground">
            Ao continuar, você concorda com nossos{' '}
            <Link href="/terms" className="text-brand-primary hover:underline">Termos de Uso</Link>
            {' '}e{' '}
            <Link href="/privacy" className="text-brand-primary hover:underline">Política de Privacidade</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
