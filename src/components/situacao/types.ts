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
  /** Verificação que gerou o item + referência (ex: "conexao:<id>"). O super-admin vê. */
  id: string;
  nivel: NivelSituacao;
  titulo: string;
  detalhe: string;
  oQueFazer: string;
  acao?: AcaoSituacao;
  /** Detalhe técnico: só vem para o super-admin. */
  tecnico?: string;
}

export interface SituacaoResposta {
  status: StatusSituacao;
  itens: ItemSituacao[];
  /** Quando foi verificado (ISO). */
  verificadoEm: string;
}
