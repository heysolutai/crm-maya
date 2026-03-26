import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Client } from '@/hooks/useClients';
import { FunnelStage } from '@/hooks/useFunnelStages';
import { Loader2 } from 'lucide-react';

// Accept a partial client type for flexibility with CRM cards
type PartialClient = Partial<Client> & { id?: string; first_name?: string };

interface ClientFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  client?: PartialClient | null;
  stages: FunnelStage[];
  onSave: (data: Partial<Client>) => Promise<any>;
}

export function ClientFormDialog({ 
  isOpen, 
  onClose, 
  client, 
  stages,
  onSave 
}: ClientFormDialogProps) {
  const isEditing = !!client;
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    secondary_phone: '',
    document_number: '',
    birth_date: '',
    gender: '',
    stage_id: '',
    source: '',
  });

  useEffect(() => {
    if (client) {
      setFormData({
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        email: client.email || '',
        phone: client.phone || '',
        secondary_phone: client.secondary_phone || '',
        document_number: client.document_number || '',
        birth_date: client.birth_date || '',
        gender: client.gender || '',
        stage_id: client.stage_id || '',
        source: client.source || '',
      });
    } else {
      // Reset form for new client
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        secondary_phone: '',
        document_number: '',
        birth_date: '',
        gender: '',
        stage_id: stages.find(s => s.is_default)?.id || stages[0]?.id || '',
        source: '',
      });
    }
  }, [client, stages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.first_name.trim()) {
      return;
    }

    setLoading(true);
    try {
      const dataToSave: Partial<Client> = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        secondary_phone: formData.secondary_phone.trim() || undefined,
        document_number: formData.document_number.trim() || undefined,
        birth_date: formData.birth_date || undefined,
        gender: formData.gender || undefined,
        stage_id: formData.stage_id || undefined,
        source: formData.source.trim() || undefined,
      };

      if (isEditing && client) {
        dataToSave.id = client.id;
      }

      await onSave(dataToSave);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Nome *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => handleChange('first_name', e.target.value)}
                placeholder="Nome"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Sobrenome</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => handleChange('last_name', e.target.value)}
                placeholder="Sobrenome"
              />
            </div>
          </div>

          {/* Contato */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          {/* Telefone Secundário e CPF/CNPJ */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="secondary_phone">Telefone Secundário</Label>
              <Input
                id="secondary_phone"
                value={formData.secondary_phone}
                onChange={(e) => handleChange('secondary_phone', e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document_number">CPF/CNPJ</Label>
              <Input
                id="document_number"
                value={formData.document_number}
                onChange={(e) => handleChange('document_number', e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          {/* Data de Nascimento e Gênero */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="birth_date">Data de Nascimento</Label>
              <Input
                id="birth_date"
                type="date"
                value={formData.birth_date}
                onChange={(e) => handleChange('birth_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gênero</Label>
              <Select 
                value={formData.gender} 
                onValueChange={(value) => handleChange('gender', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                  <SelectItem value="prefiro_nao_dizer">Prefiro não dizer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stage e Source */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stage_id">Etapa do Funil</Label>
              <Select 
                value={formData.stage_id} 
                onValueChange={(value) => handleChange('stage_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Origem</Label>
              <Input
                id="source"
                value={formData.source}
                onChange={(e) => handleChange('source', e.target.value)}
                placeholder="Ex: WhatsApp, Site, Indicação"
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !formData.first_name.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar' : 'Criar Cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
