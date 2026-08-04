import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
import { useAuth } from './useAuth';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';

export function useSupportTickets() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const { toast } = useToast();

  const submitTicket = async ({
    subject,
    description,
    images,
    priority = 'medium',
  }: {
    subject: string;
    description: string;
    images: File[];
    priority?: string;
  }) => {
    if (!user || !effectiveCompanyId) throw new Error('Usuário não autenticado');

    setIsSubmitting(true);
    try {
      const screenshotPaths: string[] = [];

      // Upload images via API route
      for (const file of images) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bucket', 'support-tickets');

        const uploadRes = await apiFetch('/api/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || 'Upload failed');
        }
        const uploadData = await uploadRes.json();
        screenshotPaths.push(uploadData.path || uploadData.url);
      }

      const res = await apiFetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          companyId: effectiveCompanyId,
          subject,
          description,
          screenshotPaths,
          priority,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create ticket');
      }

      toast({ title: 'Problema reportado', description: 'Seu ticket foi enviado com sucesso.' });
    } catch (err: any) {
      console.error('Erro ao criar ticket:', err);
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateTicketStatus = async (ticketId: string, status: string, adminNotes?: string) => {
    try {
      const res = await apiFetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateStatus',
          ticketId,
          status,
          adminNotes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update ticket');
      }

      toast({ title: 'Status atualizado', description: `Ticket marcado como "${status}".` });
    } catch (err: any) {
      console.error('Erro ao atualizar ticket:', err);
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      throw err;
    }
  };

  const deleteTicketScreenshots = async (paths: string[]) => {
    // With local file storage, cleanup would need a dedicated endpoint
    // For now, this is a no-op as uploaded files live on the server
    if (!paths.length) return;
    console.warn('[SupportTickets] Screenshot cleanup not implemented for local storage');
  };

  return { submitTicket, updateTicketStatus, deleteTicketScreenshots, isSubmitting };
}
