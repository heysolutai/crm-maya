import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Lock, Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const SuperAdminAuth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, user, isSuperAdmin, signOut, loading: authLoading, role } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated as super admin
  useEffect(() => {
    if (!authLoading && user && isSuperAdmin) {
      router.push('/super-admin/dashboard');
    }
  }, [user, isSuperAdmin, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Preencha todos os campos');
      return;
    }

    setLoading(true);

    try {
      const { error } = await signIn(email, password);

      if (error) {
        toast.error('Credenciais inválidas');
        setLoading(false);
        return;
      }

      // Wait a bit for auth state to update
      setTimeout(() => {
        setLoading(false);
      }, 1000);
      
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Erro ao fazer login');
      setLoading(false);
    }
  };

  // Check role after user state changes
  useEffect(() => {
    if (user && !authLoading && role !== null) {
      if (isSuperAdmin) {
        toast.success('Bem-vindo(a), Super Administrador!');
        router.push('/super-admin/dashboard');
      } else {
        // Não é super_admin, não deveria estar nesta rota
        signOut();
        toast.error('Acesso negado. Esta área é restrita a Super Administradores.');
      }
    }
  }, [user, isSuperAdmin, role, authLoading, router, signOut]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-300">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Card className="w-full max-w-md border-destructive/50 shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-fit">
            <div className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-4 py-2 text-destructive border border-destructive/30">
              <Shield className="h-5 w-5" />
              <span className="text-sm font-bold tracking-wider">SUPER ADMIN</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Acesso Administrativo</CardTitle>
          <CardDescription className="text-base">
            Área restrita para Super Administradores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-base font-semibold">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </div>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-base font-semibold">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Senha
                </div>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-11"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-bold"
              disabled={loading}
              variant="destructive"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2"></div>
                  Acessando...
                </>
              ) : (
                'Acessar Sistema'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              onClick={() => router.push('/')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para página inicial
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminAuth;
