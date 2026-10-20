/**
 * Formato devolvido por GET /api/ai-registro (tela "Registro da IA") e por
 * GET /api/conversations/ai-turns ("Decisões da IA" na conversa).
 * A explicação ("Por quê" / "O que fazer") já vem pronta do servidor.
 */

export type NivelIA = 'ok' | 'aviso' | 'problema';

export interface ExplicacaoIA {
  /** Rótulo curto do resultado (badge). */
  resultado: string;
  nivel: NivelIA;
  porque: string;
  oQueFazer: string | null;
}

/** Uma mensagem do cliente (ou um grupo delas) e o que a IA fez com ela. */
export interface TurnoIA {
  id: string;
  createdAt: string;
  status: string;
  motivo: string | null;
  texto: string | null;
  resposta: string | null;
  respondidoEm: string | null;
  latencyMs: number | null;
  bloqueios: number;
  pausadoAte: string | null;
  /** Quantas mensagens do cliente entraram neste turno. */
  mensagens: number;
  explicacao: ExplicacaoIA;
}

export interface RegistroIA extends TurnoIA {
  conversationId: string;
  /** Nome da conexão do WhatsApp. */
  conexao: string | null;
  contato: { nome: string | null; telefone: string | null };
}

export interface RegistroIAPagina {
  data: RegistroIA[];
  /** Data do último item: passe como `antes` para carregar mais. */
  proximo: string | null;
}

export interface TurnosIAResposta {
  data: TurnoIA[];
}

export type FiltroRegistro = 'todos' | 'problemas' | 'nao_respondidas' | 'respondidas';
