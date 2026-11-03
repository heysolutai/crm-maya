/**
 * Formato devolvido por GET /api/ai-health (painel "Situação").
 * Todos os textos já vêm prontos do servidor, em palavras simples.
 */

export type NivelSituacao = 'aviso' | 'problema';

export type StatusSituacao = 'ok' | NivelSituacao;

export interface AcaoSituacao {
  /** Texto do botão ("Conectar", "Ver quais"...). */
  label: string;
  /** Tela do sistema que resolve (sempre caminho interno, "/app/..."). */
  href: string;
}

export interface ItemSituacao {
  /** Chave da lista (verificação + referência). Nunca aparece na tela. */
  id: string;
  nivel: NivelSituacao;
  titulo: string;
  detalhe: string;
  oQueFazer: string;
  acao?: AcaoSituacao;
}

export interface SituacaoResposta {
  status: StatusSituacao;
  itens: ItemSituacao[];
  /** Quando foi verificado (ISO). */
  verificadoEm: string;
}
