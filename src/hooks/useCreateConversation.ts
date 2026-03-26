import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';

interface UseCreateConversationOptions {
  companyId: string | null;
  onSuccess: (conversationId: string) => void;
}

export function useCreateConversation({ companyId, onSuccess }: UseCreateConversationOptions) {
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();

  const createConversation = async (phoneNumber: string) => {
    if (!phoneNumber.trim() || !companyId) return;
    
    setIsCreating(true);
    
    try {
      const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
      
      if (cleanPhone.length < 10) {
        throw new Error('Número de telefone inválido');
      }
      
      // Verificar se já existe cliente com esse telefone ou whatsapp_lid
      const { data: existingClients } = await supabase
        .from('clients')
        .select('id')
        .eq('company_id', companyId)
        .or(`phone.eq.${cleanPhone},whatsapp_lid.eq.${cleanPhone}`)
        .order('created_at', { ascending: true })
        .limit(1);

      let clientId = existingClients?.[0]?.id;
      
      // Se não existir, criar cliente
      if (!clientId) {
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            phone: cleanPhone,
            company_id: companyId,
            first_name: cleanPhone,
            source: 'manual',
          })
          .select('id')
          .single();
        
        if (clientError) throw clientError;
        clientId = newClient.id;
      }
      
      // Verificar se já existe conversa ativa para esse cliente
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_id', clientId)
        .eq('company_id', companyId)
        .in('status', ['active', 'waiting'])
        .maybeSingle();
      
      let conversationId = existingConversation?.id;
      
      // Se não existir conversa ativa, criar
      if (!conversationId) {
        const { data: newConversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            client_id: clientId,
            company_id: companyId,
            status: 'active',
            channel: 'whatsapp',
            started_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        
        if (convError) throw convError;
        conversationId = newConversation.id;
      }
      
      // Atualizar lista de conversas
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      
      onSuccess(conversationId);
      
      toast({
        title: 'Conversa criada',
        description: existingConversation ? 'Conversa existente selecionada.' : 'Nova conversa iniciada com sucesso!',
      });
      
      return conversationId;
    } catch (error: any) {
      console.error('Erro ao criar conversa:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível criar a conversa.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  return { createConversation, isCreating };
}
