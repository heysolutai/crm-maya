import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Plus, Eye, EyeOff } from 'lucide-react';
import { useCompanies } from '@/hooks/useCompanies';

export function CreateCompanyDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { createCompanyAsync, isCreating } = useCompanies();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    ownerEmail: '',
    ownerFullName: '',
    ownerPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.companyName || !formData.ownerEmail) {
      return;
    }

    try {
      const result = await createCompanyAsync(formData);
      setFormData({ companyName: '', ownerEmail: '', ownerFullName: '', ownerPassword: '' });
      setOpen(false);
      // Redirect to setup page
      const companyId = result?.company?.id;
      if (companyId) {
        router.push(`/super-admin/companies/${companyId}/setup`);
      }
    } catch {
      // Error handled by mutation onError
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl">
          <Plus className="h-4 w-4 mr-2" />
          Nova Empresa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Criar Nova Empresa
            </DialogTitle>
          <DialogDescription>
              Crie uma nova empresa e seu administrador.
          </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nome da Empresa *</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                placeholder="Ex: Minha Empresa Ltda"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerEmail">Email do Administrador *</Label>
              <Input
                id="ownerEmail"
                type="email"
                value={formData.ownerEmail}
                onChange={(e) => setFormData(prev => ({ ...prev, ownerEmail: e.target.value }))}
                placeholder="admin@empresa.com"
                required
              />
              <p className="text-xs text-muted-foreground">
                Este será o email de login do administrador da empresa
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerFullName">Nome Completo do Administrador</Label>
              <Input
                id="ownerFullName"
                value={formData.ownerFullName}
                onChange={(e) => setFormData(prev => ({ ...prev, ownerFullName: e.target.value }))}
                placeholder="João Silva"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerPassword">Senha do Administrador *</Label>
              <div className="relative">
                <Input
                  id="ownerPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.ownerPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, ownerPassword: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Senha de acesso inicial do administrador
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Criando...' : 'Criar Empresa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
