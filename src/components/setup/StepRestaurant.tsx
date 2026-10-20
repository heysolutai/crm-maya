"use client";

import { forwardRef, useImperativeHandle, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendJson, type SetupStepHandle } from './setup-api';

/**
 * Company como volta do GET /api/companies?id= (linha crua do Prisma, em
 * camelCase). Os aliases snake_case ficam por compatibilidade com quem ainda
 * mapeia a resposta.
 */
export interface SetupCompany {
  id: string;
  name: string;
  tradeName?: string | null;
  trade_name?: string | null;
  phone?: string | null;
  documentNumber?: string | null;
  document_number?: string | null;
  email?: string | null;
  settings?: Record<string, unknown> | null;
}

interface Props {
  company: SetupCompany;
}

interface FormState {
  tradeName: string;
  phone: string;
  documentNumber: string;
  email: string;
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const StepRestaurant = forwardRef<SetupStepHandle, Props>(function StepRestaurant({ company }, ref) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => ({
    tradeName: company.tradeName ?? company.trade_name ?? '',
    phone: company.phone ?? '',
    documentNumber: company.documentNumber ?? company.document_number ?? '',
    email: company.email ?? '',
  }));

  const set = (patch: Partial<FormState>) => setForm((p) => ({ ...p, ...patch }));

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        const email = form.email.trim();
        if (email && !EMAIL_VALIDO.test(email)) {
          toast.error('E-mail inválido', { description: email });
          return false;
        }
        try {
          await sendJson(
            '/api/companies',
            'PUT',
            {
              id: company.id,
              tradeName: form.tradeName.trim() || null,
              phone: form.phone.trim() || null,
              documentNumber: form.documentNumber.trim() || null,
              email: email || null,
            },
            'Erro ao salvar os dados do restaurante'
          );
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['company', company.id] }),
            queryClient.invalidateQueries({ queryKey: ['companies'] }),
          ]);
          toast.success('Dados do restaurante salvos');
          return true;
        } catch (e) {
          toast.error((e as Error).message);
          return false;
        }
      },
    }),
    [form, company.id, queryClient]
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Razão social</Label>
        <Input value={company.name} disabled className="bg-muted" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-trade-name">Nome fantasia</Label>
        <Input
          id="setup-trade-name"
          value={form.tradeName}
          onChange={(e) => set({ tradeName: e.target.value })}
          placeholder="Ex: Cantina da Nonna"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-phone">Telefone</Label>
        <Input
          id="setup-phone"
          value={form.phone}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder="(11) 99999-9999"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-document">CNPJ / CPF</Label>
        <Input
          id="setup-document"
          value={form.documentNumber}
          onChange={(e) => set({ documentNumber: e.target.value })}
          placeholder="00.000.000/0001-00"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="setup-email">E-mail do restaurante</Label>
        <Input
          id="setup-email"
          type="email"
          value={form.email}
          onChange={(e) => set({ email: e.target.value })}
          placeholder="contato@restaurante.com.br"
        />
        <p className="text-xs text-muted-foreground">
          Também recebe o resumo semanal das avaliações quando nenhum e-mail específico for informado.
        </p>
      </div>
    </div>
  );
});
