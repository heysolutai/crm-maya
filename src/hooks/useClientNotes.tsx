import { useState, useEffect } from 'react';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from '@/hooks/use-toast';

export interface ClientNote {
  id: string;
  client_id: string;
  company_id: string;
  note: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  creator?: {
    full_name?: string;
    email: string;
  };
}

function mapNote(raw: any): ClientNote {
  return {
    id: raw.id,
    client_id: raw.clientId ?? raw.client_id,
    company_id: raw.companyId ?? raw.company_id,
    note: raw.note,
    created_by: raw.createdBy ?? raw.created_by,
    created_at: raw.createdAt ?? raw.created_at,
    updated_at: raw.updatedAt ?? raw.updated_at,
    creator: raw.creator ? {
      full_name: raw.creator.fullName ?? raw.creator.full_name,
      email: raw.creator.email,
    } : undefined,
  };
}

export function useClientNotes(clientId: string | null) {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = async () => {
    if (!clientId || !companyId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/client-notes?clientId=${clientId}&companyId=${companyId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch notes');
      const data = await res.json();
      setNotes((data || []).map(mapNote));
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar anotações',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addNote = async (noteText: string) => {
    if (!clientId || !companyId) return false;
    if (!noteText.trim()) {
      toast({
        title: 'Erro',
        description: 'A anotação não pode estar vazia',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const res = await fetch('/api/client-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          company_id: companyId,
          note: noteText.trim(),
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add note');

      toast({
        title: 'Anotação adicionada',
        description: 'Anotação salva com sucesso!',
      });

      fetchNotes();
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro ao adicionar anotação',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const res = await fetch(`/api/client-notes?id=${noteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete note');

      toast({
        title: 'Anotação removida',
        description: 'Anotação excluída com sucesso!',
      });

      fetchNotes();
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro ao remover anotação',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [clientId, companyId]);

  return {
    notes,
    loading,
    addNote,
    deleteNote,
    fetchNotes,
  };
}
