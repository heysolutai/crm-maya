import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
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

      // Upload images
      for (const file of images) {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 9);
        const ext = file.name.split('.').pop();
        const path = `${effectiveCompanyId}/support-tickets/${timestamp}-${randomId}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('conversation-media')
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (uploadError) throw uploadError;
        screenshotPaths.push(path);
      }

      const { error } = await supabase.from('support_tickets').insert({
        company_id: effectiveCompanyId,
        created_by: user.id,
        subject,
        description,
        screenshot_paths: screenshotPaths,
        priority,
      });

      if (error) throw error;

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
      const updateData: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = user?.id;
      }
      if (adminNotes !== undefined) {
        updateData.admin_notes = adminNotes;
      }

      const { error } = await supabase
        .from('support_tickets')
        .update(updateData)
        .eq('id', ticketId);

      if (error) throw error;

      toast({ title: 'Status atualizado', description: `Ticket marcado como "${status}".` });
    } catch (err: any) {
      console.error('Erro ao atualizar ticket:', err);
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      throw err;
    }
  };

  const deleteTicketScreenshots = async (paths: string[]) => {
    if (!paths.length) return;
    const { error } = await supabase.storage
      .from('conversation-media')
      .remove(paths);
    if (error) console.error('Erro ao deletar screenshots:', error);
  };

  return { submitTicket, updateTicketStatus, deleteTicketScreenshots, isSubmitting };
}
