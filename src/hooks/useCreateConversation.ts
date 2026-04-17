import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface UseCreateConversationOptions {
  companyId: string | null;
  onSuccess: (conversationId: string) => void;
}

export interface CreateConversationInput {
  name: string;
  phone: string;
  interest?: string;
  source?: string;
}

export function useCreateConversation({ companyId, onSuccess }: UseCreateConversationOptions) {
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();

  const createConversation = async (input: CreateConversationInput) => {
    if (!input.phone.trim() || !input.name.trim() || !companyId) return null;

    setIsCreating(true);

    try {
      const cleanPhone = input.phone.replace(/[^0-9]/g, '');

      if (cleanPhone.length < 10) {
        throw new Error('Número de telefone inválido');
      }

      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          phone: cleanPhone,
          name: input.name.trim(),
          interest: input.interest?.trim() || undefined,
          source: input.source?.trim() || undefined,
          channel: 'whatsapp',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Não foi possível criar a conversa.');
      }

      const result = await res.json();
      const conversationId = result.id;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });

      onSuccess(conversationId);

      toast({
        title: 'Conversa criada',
        description: result.existing ? 'Conversa existente selecionada.' : 'Nova conversa iniciada com sucesso!',
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
