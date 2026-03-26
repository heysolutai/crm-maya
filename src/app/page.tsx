'use client'

import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  MessageSquare,
  Users,
  Calendar,
  TrendingUp,
  Bot,
  Zap,
  ArrowRight,
  CheckCircle2,
  Shield,
  Clock,
} from 'lucide-react'

function SmartRedirect() {
  const { user, role, companyId, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && role) {
      if (role === 'super_admin' && !companyId) {
        router.replace('/super-admin/dashboard')
      } else if (companyId) {
        router.replace('/app/dashboard')
      }
    }
  }, [loading, user, role, companyId, router])

  if (loading || (user && role)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return null
}

const features = [
  {
    icon: Bot,
    name: 'IA para Atendimento',
    description: 'Chatbot inteligente que atende seus clientes 24/7 via WhatsApp com respostas naturais.',
    gradient: 'from-mileto-green/20 to-mileto-green/5',
    iconBg: 'bg-mileto-green/15',
    iconColor: 'text-mileto-green',
  },
  {
    icon: MessageSquare,
    name: 'WhatsApp Integrado',
    description: 'Gerencie todas as conversas em um painel unificado com atribuição de agentes.',
    gradient: 'from-mileto-cyan/20 to-mileto-cyan/5',
    iconBg: 'bg-mileto-cyan/15',
    iconColor: 'text-mileto-cyan',
  },
  {
    icon: Calendar,
    name: 'Agendamento Inteligente',
    description: 'Agenda integrada com Google Calendar e confirmação automática por WhatsApp.',
    gradient: 'from-mileto-blue/20 to-mileto-blue/5',
    iconBg: 'bg-mileto-blue/15',
    iconColor: 'text-mileto-blue',
  },
  {
    icon: Users,
    name: 'CRM Completo',
    description: 'Funil de vendas visual com automação de etapas e acompanhamento de leads.',
    gradient: 'from-mileto-green/20 to-mileto-cyan/5',
    iconBg: 'bg-mileto-green/15',
    iconColor: 'text-mileto-green',
  },
  {
    icon: Zap,
    name: 'Follow-ups Automáticos',
    description: 'Reengaje clientes inativos com sequências inteligentes de mensagens.',
    gradient: 'from-mileto-cyan/20 to-mileto-blue/5',
    iconBg: 'bg-mileto-cyan/15',
    iconColor: 'text-mileto-cyan',
  },
  {
    icon: TrendingUp,
    name: 'Relatórios em Tempo Real',
    description: 'Métricas de atendimento, vendas e performance da equipe em dashboards visuais.',
    gradient: 'from-mileto-blue/20 to-mileto-green/5',
    iconBg: 'bg-mileto-blue/15',
    iconColor: 'text-mileto-blue',
  },
]

const stats = [
  { value: '24/7', label: 'Atendimento' },
  { value: '10x', label: 'Mais produtivo' },
  { value: '95%', label: 'Satisfação' },
  { value: '<1min', label: 'Tempo resposta' },
]

export default function Home() {
  const { user, loading } = useAuth()

  if (loading || user) {
    return <SmartRedirect />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo-mileto.png" alt="MiletoIA" width={40} height={40} className="rounded-xl" />
          <span className="text-xl font-bold bg-gradient-to-r from-mileto-green to-mileto-cyan bg-clip-text text-transparent">
            MiletoIA
          </span>
        </div>
        <Link href="/auth">
          <Button variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
            Entrar
          </Button>
        </Link>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-mileto-green/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-mileto-green/8 rounded-full blur-[120px]" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-mileto-cyan/8 rounded-full blur-[120px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-24 sm:pt-20 sm:pb-32">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 text-sm text-primary">
              <Bot className="h-4 w-4" />
              <span>CRM com Inteligência Artificial</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
              Transforme seu atendimento com{' '}
              <span className="bg-gradient-to-r from-mileto-green via-mileto-cyan to-mileto-blue bg-clip-text text-transparent">
                Inteligência Artificial
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              CRM completo com automação de WhatsApp, agendamentos inteligentes
              e IA conversacional para sua empresa vender mais.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/auth">
                <Button size="lg" className="h-14 px-8 text-base bg-gradient-to-r from-primary to-mileto-cyan hover:opacity-90 shadow-lg shadow-primary/25 group">
                  Comece Gratuitamente
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-mileto-green" />
                <span>Sem cartão de crédito</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-mileto-green to-mileto-cyan bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="relative py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold">
              Tudo que você precisa{' '}
              <span className="bg-gradient-to-r from-mileto-green to-mileto-cyan bg-clip-text text-transparent">
                em um só lugar
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Uma plataforma completa para gerenciar atendimento, vendas e relacionamento com clientes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.name}
                className="group relative p-8 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all duration-300 hover:-translate-y-1"
              >
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className="relative">
                  <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5`}>
                    <feature.icon className={`h-6 w-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-semibold mb-3">{feature.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-mileto-green/10 via-mileto-cyan/10 to-mileto-blue/10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-mileto-green/5 rounded-full blur-[150px]" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-8">
          <h2 className="text-3xl sm:text-4xl font-bold">
            Pronto para transformar seu negócio?
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Junte-se a empresas que já estão usando IA para atender melhor e vender mais.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Link href="/auth">
              <Button size="lg" className="h-14 px-8 text-base bg-gradient-to-r from-primary to-mileto-cyan hover:opacity-90 shadow-lg shadow-primary/25 group">
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-mileto-green" />
              <span>LGPD Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-mileto-cyan" />
              <span>Setup em minutos</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-mileto-blue" />
              <span>Suporte dedicado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <Image src="/logo-mileto.png" alt="MiletoIA" width={28} height={28} className="rounded-lg" />
              <span className="text-sm text-muted-foreground">
                &copy; 2024 MiletoIA. Todos os direitos reservados.
              </span>
            </div>
            <div className="flex gap-6 text-sm">
              <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                Privacidade
              </Link>
              <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                Termos de Uso
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
