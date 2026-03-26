import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
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

export function useClientNotes(clientId: string | null) {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = async () => {
    if (!clientId || !companyId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_notes')
        .select(`
          *,
          creator:users!created_by(full_name, email)
        `)
        .eq('client_id', clientId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
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
        variant: 'destructive' 
      });
      return false;
    }

    try {
      const { error } = await supabase
        .from('client_notes')
        .insert([{ 
          client_id: clientId,
          company_id: companyId,
          note: noteText.trim()
        }]);

      if (error) throw error;
      
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
      const { error } = await supabase
        .from('client_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      
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
