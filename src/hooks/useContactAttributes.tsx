import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

/**
 * Atributos personalizados do contato (Client.customFields).
 *
 * Busca sob demanda por cliente: o GET de conversas omite os campos Json de
 * proposito (seriam ate 500 objetos por requisicao pra usar o de um), entao o
 * painel carrega o contato aberto e o cache do React Query segura o resto.
 */
export interface Atributo {
  chave: string;
  valor: string;
}

function paraLista(mapa: Record<string, unknown> | null | undefined): Atributo[] {
  if (!mapa) return [];
  return Object.entries(mapa)
    // Chaves com "_" na frente sao internas de outros fluxos — nao sao do painel.
    .filter(([chave, valor]) => !chave.startsWith('_') && typeof valor === 'string')
    .map(([chave, valor]) => ({ chave, valor: String(valor) }))
    .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
}

export function useContactAttributes(clientId: string | null | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contact-attributes', clientId],
    queryFn: async () => {
      if (!clientId) return [] as Atributo[];
      const res = await fetch(`/api/clients/attributes?clientId=${clientId}`);
      if (!res.ok) throw new Error('Falha ao carregar o contato');
      const cliente = await res.json();
      return paraLista(cliente?.customFields);
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  const atributos = data || [];

  // Manda so o que mudou: o servidor faz merge. Enviar o mapa inteiro a partir
  // deste cache apagaria o que outro atendente gravou no mesmo contato.
  const salvar = useMutation({
    mutationFn: async (patch: { set?: Record<string, string>; remove?: string[] }) => {
      if (!clientId) throw new Error('Contato nao identificado');
      const res = await fetch('/api/clients/attributes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...patch }),
      });
      if (!res.ok) {
        const erro = await res.json().catch(() => ({}));
        throw new Error(erro.error || 'Falha ao salvar');
      }
      return res.json();
    },
    onSuccess: () => {
      // O contato tambem aparece no CRM e na lista de conversas.
      queryClient.invalidateQueries({ queryKey: ['contact-attributes', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao salvar atributo', description: e.message, variant: 'destructive' });
    },
  });

  /** Cria ou atualiza um par. Renomear = informar chaveAnterior (some a antiga). */
  const definir = async (chave: string, valor: string, chaveAnterior?: string) => {
    const k = chave.trim();
    if (!k) return false;
    const remove = chaveAnterior && chaveAnterior !== k ? [chaveAnterior] : undefined;
    try {
      await salvar.mutateAsync({ set: { [k]: valor }, remove });
      return true;
    } catch {
      // O toast do onError ja avisou; devolver false mantem o dialog aberto.
      return false;
    }
  };

  const remover = async (chave: string) => {
    try {
      await salvar.mutateAsync({ remove: [chave] });
      return true;
    } catch {
      return false;
    }
  };

  return { atributos, isLoading, definir, remover, isSaving: salvar.isPending };
}
