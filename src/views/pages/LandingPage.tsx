import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, 
  Users, 
  Calendar, 
  TrendingUp, 
  Bot, 
  Zap, 
  Shield, 
  Star,
  CheckCircle2,
  ArrowRight,
  Phone
} from 'lucide-react';
import Image from 'next/image';
import logoMileto from '@/assets/logo-mileto.png';

const LandingPage = () => {
  const router = useRouter();

  const features = [
    {
      icon: Bot,
      title: 'Atendimento com IA 24/7',
      description: 'Responda seus clientes automaticamente, mesmo fora do horário comercial. A IA entende e responde como um vendedor experiente.',
    },
    {
      icon: MessageSquare,
      title: 'Integração WhatsApp',
      description: 'Atenda todos os seus clientes direto pelo WhatsApp. Histórico completo de conversas e envio de mídia.',
    },
    {
      icon: Calendar,
      title: 'Agendamentos Inteligentes',
      description: 'Lembretes automáticos de consultas, troca de lentes e retornos. Nunca mais perca um cliente.',
    },
    {
      icon: Users,
      title: 'CRM Completo',
      description: 'Gerencie seus clientes em um funil visual. Acompanhe cada etapa da venda e histórico completo.',
    },
    {
      icon: TrendingUp,
      title: 'Follow-ups Automáticos',
      description: 'A IA envia mensagens de acompanhamento automaticamente para clientes que não responderam.',
    },
    {
      icon: Zap,
      title: 'Respostas Instantâneas',
      description: 'Enquanto você atende na loja, a IA cuida dos atendimentos online. Mais vendas, menos trabalho.',
    },
  ];

  const stats = [
    { value: '+40%', label: 'Aumento em vendas' },
    { value: '24/7', label: 'Atendimento disponível' },
    { value: '-60%', label: 'Tempo de resposta' },
    { value: '+85%', label: 'Satisfação do cliente' },
  ];

  const testimonials = [
    {
      name: 'Carlos Silva',
      business: 'Ótica Premium',
      quote: 'Aumentamos nossas vendas em 45% no primeiro mês. A IA responde os clientes muito rápido!',
      rating: 5,
    },
    {
      name: 'Ana Costa',
      business: 'Ótica Visão Clara',
      quote: 'Não perco mais vendas por falta de atendimento. A IA cuida de tudo enquanto atendo na loja.',
      rating: 5,
    },
    {
      name: 'Roberto Mendes',
      business: 'Óticas House',
      quote: 'Os lembretes automáticos de troca de lentes trouxeram muitos clientes de volta.',
      rating: 5,
    },
  ];


  return (
    <div className="min-h-screen bg-[hsl(var(--mileto-dark))] text-white overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--mileto-green)/0.15)] via-[hsl(var(--mileto-cyan)/0.1)] to-[hsl(var(--mileto-blue)/0.15)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--mileto-cyan)/0.2)_0%,_transparent_70%)]" />
        
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Logo */}
          <Image
            src={logoMileto}
            alt="MiletoIA Chat"
            className="h-36 md:h-48 mx-auto mb-8 drop-shadow-[0_0_30px_hsl(var(--mileto-cyan)/0.5)]"
            width={192}
            height={192}
          />
          
          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            Transforme sua{' '}
            <span className="bg-gradient-to-r from-[hsl(var(--mileto-green))] via-[hsl(var(--mileto-cyan))] to-[hsl(var(--mileto-blue))] bg-clip-text text-transparent">
              Ótica
            </span>
            <br />
            com Inteligência Artificial
          </h1>
          
          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-gray-300 mb-10 max-w-3xl mx-auto">
            Aumente suas vendas, automatize atendimentos e fidelize clientes com o CRM mais inteligente do mercado
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              onClick={() => router.push('/auth')}
              className="bg-gradient-to-r from-[hsl(var(--mileto-green))] to-[hsl(var(--mileto-cyan))] hover:opacity-90 text-black font-bold text-lg px-8 py-6 rounded-full shadow-[0_0_30px_hsl(var(--mileto-green)/0.5)] transition-all hover:shadow-[0_0_50px_hsl(var(--mileto-green)/0.7)]"
            >
              Comece Gratuitamente
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg"
              variant="outline"
              className="border-[hsl(var(--mileto-cyan))] text-[hsl(var(--mileto-cyan))] hover:bg-[hsl(var(--mileto-cyan)/0.1)] font-semibold text-lg px-8 py-6 rounded-full"
            >
              <Phone className="mr-2 h-5 w-5" />
              Falar com Consultor
            </Button>
          </div>
          
          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap justify-center gap-6 text-gray-400 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[hsl(var(--mileto-green))]" />
              <span>Dados protegidos</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[hsl(var(--mileto-cyan))]" />
              <span>Setup em 5 minutos</span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-[hsl(var(--mileto-green))]" />
              <span>+500 óticas atendidas</span>
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-[hsl(var(--mileto-cyan)/0.5)] rounded-full flex justify-center pt-2">
            <div className="w-1 h-2 bg-[hsl(var(--mileto-cyan))] rounded-full" />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-transparent to-[hsl(var(--mileto-dark))]">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div 
                key={index}
                className="text-center p-6 rounded-2xl bg-gradient-to-br from-[hsl(var(--mileto-green)/0.1)] to-[hsl(var(--mileto-blue)/0.1)] border border-[hsl(var(--mileto-cyan)/0.2)]"
              >
                <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[hsl(var(--mileto-green))] to-[hsl(var(--mileto-cyan))] bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-gray-400 mt-2">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Tudo que sua ótica precisa para{' '}
              <span className="bg-gradient-to-r from-[hsl(var(--mileto-green))] to-[hsl(var(--mileto-cyan))] bg-clip-text text-transparent">
                vender mais
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Automatize seu atendimento, gerencie clientes e aumente suas vendas com inteligência artificial
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group p-6 rounded-2xl bg-gradient-to-br from-[hsl(var(--mileto-dark))] to-[hsl(220_20%_8%)] border border-[hsl(var(--mileto-cyan)/0.2)] hover:border-[hsl(var(--mileto-cyan)/0.5)] transition-all hover:shadow-[0_0_30px_hsl(var(--mileto-cyan)/0.2)]"
              >
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[hsl(var(--mileto-green)/0.2)] to-[hsl(var(--mileto-cyan)/0.2)] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="h-6 w-6 text-[hsl(var(--mileto-cyan))]" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-transparent via-[hsl(var(--mileto-green)/0.05)] to-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              O que nossos clientes dizem
            </h2>
            <p className="text-xl text-gray-400">
              Óticas de todo Brasil já aumentaram suas vendas com MiletoIA
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl bg-gradient-to-br from-[hsl(var(--mileto-dark))] to-[hsl(220_20%_8%)] border border-[hsl(var(--mileto-cyan)/0.2)]"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-[hsl(var(--mileto-green))] text-[hsl(var(--mileto-green))]" />
                  ))}
                </div>
                <p className="text-gray-300 mb-4 italic">"{testimonial.quote}"</p>
                <div>
                  <div className="font-semibold">{testimonial.name}</div>
                  <div className="text-sm text-[hsl(var(--mileto-cyan))]">{testimonial.business}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Consultor Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-br from-[hsl(var(--mileto-green)/0.1)] to-[hsl(var(--mileto-cyan)/0.1)] border border-[hsl(var(--mileto-cyan)/0.2)]">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Quer saber quanto custa?
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Fale com um de nossos consultores e descubra o plano ideal para sua ótica. Atendimento personalizado e sem compromisso.
            </p>
            <Button 
              size="lg"
              className="bg-gradient-to-r from-[hsl(var(--mileto-green))] to-[hsl(var(--mileto-cyan))] hover:opacity-90 text-black font-bold text-lg px-12 py-6 rounded-full shadow-[0_0_30px_hsl(var(--mileto-green)/0.5)] transition-all hover:shadow-[0_0_50px_hsl(var(--mileto-green)/0.7)]"
            >
              <Phone className="mr-2 h-5 w-5" />
              Falar com Consultor
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-br from-[hsl(var(--mileto-green)/0.2)] via-[hsl(var(--mileto-cyan)/0.15)] to-[hsl(var(--mileto-blue)/0.2)] border border-[hsl(var(--mileto-cyan)/0.3)]">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Pronto para vender mais?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Junte-se a mais de 500 óticas que já aumentaram suas vendas com MiletoIA
            </p>
            <Button 
              size="lg"
              onClick={() => router.push('/auth')}
              className="bg-gradient-to-r from-[hsl(var(--mileto-green))] to-[hsl(var(--mileto-cyan))] hover:opacity-90 text-black font-bold text-lg px-12 py-6 rounded-full shadow-[0_0_30px_hsl(var(--mileto-green)/0.5)] transition-all hover:shadow-[0_0_50px_hsl(var(--mileto-green)/0.7)]"
            >
              Começar Teste Grátis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-[hsl(var(--mileto-cyan)/0.1)]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <Image src={logoMileto} alt="MiletoIA Chat" className="h-10" width={40} height={40} />
            <p className="text-gray-500 text-sm">
              © 2024 MiletoIA. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
