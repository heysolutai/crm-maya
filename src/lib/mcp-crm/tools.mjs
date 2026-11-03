/**
 * Ferramentas do MCP do CRM Maya — compartilhadas pelos dois transportes.
 *
 * `server.mjs` expoe por stdio (roda na maquina de quem usa) e `http.mjs` por
 * HTTP (roda no servidor, alcancavel pelo claude.ai). A definicao das
 * ferramentas mora aqui uma vez so: duas copias divergiriam na primeira
 * correcao feita com pressa.
 *
 * Nao fala com o banco: conversa com a API do proprio CRM usando `x-api-key`,
 * do mesmo jeito que o n8n. Isso mantem TODA a regra de isolamento por
 * restaurante onde ela ja existe e e testada — a chave pertence a uma empresa,
 * e a API so devolve o que e dela. Um MCP com acesso direto ao Postgres
 * contornaria essa barreira.
 *
 * SOMENTE LEITURA, de proposito. O objetivo e entender o que os clientes falam
 * para depois decidir as etapas do funil; criar ou mexer em etapa e decisao de
 * quem opera, na tela do CRM.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** Teto de mensagens por conversa: o suficiente pra entender, sem estourar o contexto. */
const MAX_MENSAGENS = 200;
/** Teto de conversas por listagem. */
const MAX_CONVERSAS = 100;

/**
 * Monta um servidor MCP ja com as ferramentas registradas.
 *
 * Recebe base e chave por parametro (em vez de ler o ambiente aqui) porque o
 * transporte HTTP cria um servidor por requisicao e pode, no futuro, atender
 * mais de um restaurante com chaves diferentes.
 */
export function criarServidor({ base, chave }) {
  const BASE = (base || '').replace(/\/+$/, '');
  const KEY = chave || '';
/**
 * Chamada a API do CRM.
 *
 * O erro devolvido ao cliente MCP e curto e sem corpo bruto: a resposta de erro
 * da API pode trazer detalhe interno, e isso iria parar no contexto do modelo.
 */
async function api(caminho, params = {}) {
  const url = new URL(`${BASE}${caminho}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { 'x-api-key': KEY, Accept: 'application/json' },
  });

  if (!res.ok) {
    const motivo =
      res.status === 401 || res.status === 403
        ? 'chave de API recusada — confira MAYA_API_KEY'
        : `a API respondeu ${res.status}`;
    throw new Error(`Falha em ${caminho}: ${motivo}`);
  }

  return res.json();
}

const texto = (valor) => ({ content: [{ type: 'text', text: valor }] });

/** Data curta em pt-BR; entrada pode vir nula. */
function data(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

  const server = new McpServer({ name: 'maya-crm', version: '1.0.0' });

// ─── Conversas ───────────────────────────────────────────────

server.registerTool(
  'listar_conversas',
  {
    title: 'Listar conversas',
    description:
      'Lista conversas do restaurante, da mais recente pra mais antiga. Devolve id, cliente, ' +
      'status, canal e a ultima mensagem — sem o historico completo. Use `ler_conversa` ' +
      'para abrir uma delas. Filtre por periodo para estudar uma safra especifica.',
    inputSchema: {
      status: z.enum(['active', 'pending', 'closed']).optional()
        .describe('Situacao da conversa.'),
      desde: z.string().optional()
        .describe('Data inicial (ISO 8601, ex: 2026-09-01). Filtra pelo inicio da conversa.'),
      ate: z.string().optional().describe('Data final (ISO 8601).'),
      limite: z.number().int().min(1).max(MAX_CONVERSAS).optional()
        .describe(`Quantas conversas trazer (padrao 25, maximo ${MAX_CONVERSAS}).`),
      pular: z.number().int().min(0).optional().describe('Quantas pular, para paginar.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ status, desde, ate, limite, pular }) => {
    const conversas = await api('/api/conversations', {
      status,
      startDate: desde,
      endDate: ate,
      limit: limite ?? 25,
      offset: pular ?? 0,
    });

    if (!Array.isArray(conversas) || conversas.length === 0) {
      return texto('Nenhuma conversa encontrada com esses filtros.');
    }

    const linhas = conversas.map((c) => {
      const cliente = [c.client?.firstName, c.client?.lastName].filter(Boolean).join(' ').trim();
      const ultima = c.messages?.[0];
      const previa = (ultima?.messageText || '').replace(/\s+/g, ' ').slice(0, 90);
      return [
        `- id: ${c.id}`,
        `  cliente: ${cliente || 'sem nome'} (${c.client?.phone || 'sem telefone'})`,
        `  status: ${c.status} | iniciada: ${data(c.startedAt)}`,
        `  canal: ${c.inbox?.displayName || c.channel || '—'}`,
        `  departamento: ${c.department?.name || 'Triagem'}`,
        previa ? `  ultima: "${previa}"` : null,
      ]
        .filter(Boolean)
        .join('\n');
    });

    return texto(`${conversas.length} conversa(s):\n\n${linhas.join('\n\n')}`);
  }
);

server.registerTool(
  'ler_conversa',
  {
    title: 'Ler conversa',
    description:
      'Transcricao de uma conversa, em ordem cronologica, com quem falou cada mensagem ' +
      '(cliente, IA, atendente ou sistema). E daqui que saem os sinais de intencao de ' +
      'compra, objecao e etapa para desenhar o funil.',
    inputSchema: {
      conversa_id: z.string().uuid().describe('id da conversa, obtido em listar_conversas.'),
      limite: z.number().int().min(1).max(MAX_MENSAGENS).optional()
        .describe(`Quantas mensagens trazer (padrao 80, maximo ${MAX_MENSAGENS}).`),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ conversa_id, limite }) => {
    const mensagens = await api('/api/messages', {
      conversationId: conversa_id,
      limit: limite ?? 80,
    });

    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return texto('Conversa sem mensagens (ou id inexistente neste restaurante).');
    }

    // A API devolve da mais nova pra mais velha; a leitura pede o contrario.
    const emOrdem = [...mensagens].reverse();

    const quem = {
      client: 'CLIENTE',
      ai: 'IA',
      agent: 'ATENDENTE',
      system: 'SISTEMA',
    };

    const linhas = emOrdem.map((m) => {
      const autor = quem[m.senderType] || m.senderType?.toUpperCase() || '?';
      const nome = m.sender?.fullName ? ` (${m.sender.fullName})` : '';
      const corpo = m.messageText?.trim() || `[${m.messageType || 'midia'}]`;
      return `[${data(m.createdAt)}] ${autor}${nome}: ${corpo}`;
    });

    const aviso =
      mensagens.length >= (limite ?? 80)
        ? '\n\n(Atingiu o limite — ha mensagens mais antigas. Aumente `limite` para ver o resto.)'
        : '';

    return texto(`${emOrdem.length} mensagem(ns):\n\n${linhas.join('\n')}${aviso}`);
  }
);

// ─── Funil ───────────────────────────────────────────────────

server.registerTool(
  'listar_etapas_funil',
  {
    title: 'Listar etapas do funil',
    description:
      'Etapas do funil de vendas configuradas hoje, na ordem. Consulte antes de propor ' +
      'mudancas: o objetivo e ajustar o que existe, nao desenhar do zero por cima.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    const etapas = await api('/api/funnel-stages');

    if (!Array.isArray(etapas) || etapas.length === 0) {
      return texto('Nenhuma etapa de funil configurada neste restaurante.');
    }

    const linhas = etapas.map(
      (e, i) =>
        `${i + 1}. ${e.name}${e.isDefault ? ' (entrada)' : ''}${e.isFinal ? ' (final)' : ''}` +
        `${e.description ? ` — ${e.description}` : ''}`
    );

    return texto(`${etapas.length} etapa(s):\n\n${linhas.join('\n')}`);
  }
);

server.registerTool(
  'listar_clientes_por_etapa',
  {
    title: 'Distribuicao dos clientes no funil',
    description:
      'Quantos clientes estao em cada etapa do funil hoje. Mostra onde a base empilha — ' +
      'etapa cheia sem saida costuma ser etapa mal definida.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    const [clientes, etapas] = await Promise.all([
      api('/api/clients'),
      api('/api/funnel-stages'),
    ]);

    if (!Array.isArray(clientes) || clientes.length === 0) {
      return texto('Nenhum cliente cadastrado neste restaurante.');
    }

    const nomePorId = new Map((etapas || []).map((e) => [e.id, e.name]));
    const contagem = new Map();
    for (const c of clientes) {
      // No schema o campo e `stageId` (coluna stage_id), nao `funnelStageId`.
      const chave = c.stageId ? nomePorId.get(c.stageId) || 'Etapa removida' : 'Sem etapa';
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }

    const linhas = Array.from(contagem.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nome, total]) => `- ${nome}: ${total}`);

    return texto(`${clientes.length} cliente(s) no total:\n\n${linhas.join('\n')}`);
  }
);


  return server;
}
