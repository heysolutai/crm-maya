import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Sparkles } from 'lucide-react';
import Image from 'next/image';
import logoMileto from '@/assets/logo-mileto.png';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const { signIn, signUp, user, companyId, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && role) {
      if (companyId) {
        router.replace('/app/dashboard');
      } else {
        toast.error('Use a rota administrativa para acesso de super admin.');
      }
    }
  }, [user, companyId, role, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success('Login realizado com sucesso!');
        }
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success('Cadastro realizado! Verifique seu email.');
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Ocorreu um erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Background with gradient */}
        <div className="absolute inset-0 bg-mileto-dark" />
        <div className="absolute inset-0 bg-gradient-to-br from-mileto-green/20 via-mileto-cyan/10 to-mileto-blue/20" />
        
        {/* Decorative circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-mileto-green/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-mileto-cyan/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-mileto-blue/10 rounded-full blur-3xl" />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <Image
            src={logoMileto}
            alt="MiletoIA Chat"
            className="w-40 h-40 mb-8 drop-shadow-2xl"
            width={160}
            height={160}
          />
          
          <h1 className="text-4xl font-bold text-white mb-4 text-center">
            <span className="bg-gradient-to-r from-mileto-green via-mileto-cyan to-mileto-blue bg-clip-text text-transparent">
              MiletoIA Chat
            </span>
          </h1>
          
          <p className="text-white/70 text-lg text-center max-w-md mb-8">
            O CRM mais inteligente para impulsionar suas vendas com Inteligência Artificial
          </p>
          
          {/* Features list */}
          <div className="space-y-4 text-white/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-mileto-green/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-mileto-green" />
              </div>
              <span>Atendimento automatizado 24/7</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-mileto-cyan/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-mileto-cyan" />
              </div>
              <span>Integração com WhatsApp</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-mileto-blue/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-mileto-blue" />
              </div>
              <span>Follow-ups inteligentes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <Image
              src={logoMileto}
              alt="MiletoIA Chat"
              className="w-24 h-24 mb-4"
              width={96}
              height={96}
            />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-mileto-green via-mileto-cyan to-mileto-blue bg-clip-text text-transparent">
              MiletoIA Chat
            </h1>
          </div>

          {/* Form Header */}
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-foreground">
              {isLogin ? 'Bem-vindo de volta!' : 'Crie sua conta'}
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
              className="w-full h-12 bg-gradient-to-r from-[hsl(150,80%,45%)] to-[hsl(175,70%,45%)] hover:from-[hsl(150,80%,40%)] hover:to-[hsl(175,70%,40%)] text-white font-semibold shadow-lg shadow-[hsl(150,80%,45%)]/25 transition-all duration-300 group"
              disabled={loading}
            >
              {loading ? (
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
                {isLogin
                  ? 'Não tem uma conta? '
                  : 'Já tem uma conta? '}
                <span className="font-semibold text-mileto-green hover:text-mileto-cyan transition-colors">
                  {isLogin ? 'Cadastre-se' : 'Entre'}
                </span>
              </button>
            </div>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground">
            Ao continuar, você concorda com nossos{' '}
            <a href="#" className="text-mileto-green hover:underline">Termos de Uso</a>
            {' '}e{' '}
            <a href="#" className="text-mileto-green hover:underline">Política de Privacidade</a>
          </p>
        </div>
      </div>
    </div>
  );
}
