/**
 * Ferramentas do MCP do CRM Maya, servidas pelo proprio app em POST /api/mcp
 * (src/app/api/mcp/route.ts). Hermes, Claude Code e claude.ai conectam na URL
 * do CRM com a chave de API do restaurante: nao ha servico nem imagem a parte.
 *
 * Nao fala com o banco: conversa com a API do proprio CRM usando `x-api-key`,
 * do mesmo jeito que o n8n. Isso mantem TODA a regra de isolamento por
 * restaurante onde ela ja existe e e testada — a chave pertence a uma empresa,
 * e a API so devolve o que e dela. Um MCP com acesso direto ao Postgres
 * contornaria essa barreira.
 *
 * Le conversas, funil e o prompt do agente de IA (pra auditar se a IA segue o
 * prompt). A UNICA escrita e o prompt do agente, e com trava: exige a versao
 * lida (se alguem mexeu no meio, recusa em vez de sobrescrever), um motivo, e
 * o texto anterior vai pro historico, de onde `restaurar_prompt` traz de volta.
 * Funil, clientes e conversas continuam so leitura.
 *
 * Dois modos:
 *   - restaurante: chave de API de um restaurante; tudo e daquele restaurante.
 *   - super-admin (`admin`): um token pra todos os restaurantes (./admin.ts).
 *     Cada ferramenta ganha `restaurante_id`, ou descobre o restaurante pelo
 *     agente, pela conversa ou pelo telefone do cliente; e ha `buscar_telefone`
 *     e `listar_restaurantes`. Com o token de leitura, as ferramentas de
 *     escrita nem sao registradas.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { chaveTelefone } from './telefone.mjs';

/** Teto de mensagens por conversa: o suficiente pra entender, sem estourar o contexto. */
const MAX_MENSAGENS = 200;
/** Teto de conversas por listagem. */
const MAX_CONVERSAS = 100;
/** Teto de conversas por auditoria: cada uma vem inteira, junto com o prompt. */
const MAX_AUDITADAS = 15;
/** Teto da resposta da auditoria, pra caber no contexto com folga. */
const MAX_SAIDA = 100_000;
/** Mensagem gigante (cardapio colado) nao ajuda a auditar; o comeco basta. */
const MAX_TEXTO_MENSAGEM = 1500;

const QUEM = {
  client: 'CLIENTE',
  ai: 'IA',
  agent: 'ATENDENTE',
  system: 'SISTEMA',
};

/**
 * Monta um servidor MCP ja com as ferramentas registradas.
 *
 * Um servidor por requisicao (a rota e sem sessao): no modo super-admin,
 * `restaurante` guarda o restaurante escolhido para a chamada em curso.
 *
 * `admin` (so no modo super-admin): { token, podeAlterar, restauranteDe,
 * ondeApareceTelefone, listarRestaurantes }, de ./admin.ts.
 *
 * @param {{ base: string, chave?: string, admin?: object }} opcoes
 */
export function criarServidor({ base, chave, admin }) {
  const BASE = (base || '').replace(/\/+$/, '');
  const KEY = chave || '';
  let restaurante = null;
/**
 * Chamada a API do CRM.
 *
 * O erro devolvido ao cliente MCP e curto e sem corpo bruto: a resposta de erro
 * da API pode trazer detalhe interno, e isso iria parar no contexto do modelo.
 * Excecao: o `error` de 400/404/409, que e frase das nossas rotas (validacao,
 * conflito de versao do prompt) e diz o que corrigir.
 */
async function api(caminho, params = {}, { metodo = 'GET', corpo } = {}) {
  const url = new URL(`${BASE}${caminho}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  // Rede de seguranca: registrar() sempre escolhe antes de chamar a ferramenta.
  if (admin && !restaurante) throw new Error('Restaurante nao escolhido: informe restaurante_id.');

  const res = await fetch(url, {
    method: metodo,
    headers: {
      ...(admin
        ? { 'x-mcp-admin': admin.token, 'x-impersonate-company': restaurante.id }
        : { 'x-api-key': KEY }),
      Accept: 'application/json',
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });

  if (!res.ok) {
    let motivo =
      res.status === 401 || res.status === 403
        ? admin
          ? 'acesso recusado — confira MCP_ADMIN_TOKEN no servidor'
          : 'chave de API recusada — confira MAYA_API_KEY'
        : `a API respondeu ${res.status}`;
    if ([400, 404, 409].includes(res.status)) {
      const erro = await res.json().then((j) => j?.error).catch(() => null);
      if (typeof erro === 'string' && erro) motivo = erro.slice(0, 400);
    }
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

const corta = (s, max) => (s.length > max ? `${s.slice(0, max)}… [cortado]` : s);

/** Valores dos argumentos numa linha: `date=2026-11-03, people=2`. */
function argsEmLinha(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
}

/**
 * Mensagens e ferramentas que a IA usou, em ordem, numa transcricao so. Pra
 * auditar o prompt as duas importam: "nunca confirme sem a ferramenta" so se
 * confere vendo a chamada (e se ela deu certo) entre as mensagens.
 */
async function transcricao(conversaId, limite) {
  const [mensagens, ferramentas] = await Promise.all([
    api('/api/messages', { conversationId: conversaId, limit: limite }),
    // CRM antigo nao tem a rota: segue so com as mensagens.
    api('/api/conversations/ai-tool-calls', { conversationId: conversaId })
      .then((r) => (Array.isArray(r?.data) ? r.data : []))
      .catch(() => null),
  ]);
  if (!Array.isArray(mensagens) || mensagens.length === 0) return null;

  // A API devolve da mais nova pra mais velha; a leitura pede o contrario.
  const emOrdem = [...mensagens].reverse();
  const cortada = mensagens.length >= limite;
  const inicio = new Date(emOrdem[0].createdAt).getTime();

  const itens = emOrdem.map((m) => {
    const autor = QUEM[m.senderType] || m.senderType?.toUpperCase() || '?';
    const nome = m.sender?.fullName ? ` (${m.sender.fullName})` : '';
    const corpo = corta(m.messageText?.trim() || `[${m.messageType || 'midia'}]`, MAX_TEXTO_MENSAGEM);
    return { em: new Date(m.createdAt).getTime(), linha: `[${data(m.createdAt)}] ${autor}${nome}: ${corpo}` };
  });

  for (const f of ferramentas || []) {
    const em = new Date(f.createdAt).getTime();
    // Chamada de antes do trecho carregado so confunde.
    if (cortada && em < inicio) continue;
    const args = argsEmLinha(f.arguments);
    const resultado = f.ok
      ? 'ok'
      : `FALHOU — ${f.explicacao?.titulo || 'erro'}${f.explicacao?.motivo ? `: ${f.explicacao.motivo}` : ''}`;
    itens.push({
      em,
      linha: `[${data(f.createdAt)}] FERRAMENTA ${f.label || f.toolName}${args ? ` (${corta(args, 300)})` : ''} → ${resultado}`,
    });
  }
  // sort estavel: mensagem e ferramenta no mesmo instante mantem a ordem acima.
  itens.sort((a, b) => a.em - b.em);

  const aiEm = emOrdem.filter((m) => m.senderType === 'ai').map((m) => new Date(m.createdAt).getTime());
  return {
    linhas: itens.map((i) => i.linha),
    total: emOrdem.length,
    cortada,
    semFerramentas: ferramentas === null,
    respostasIa: aiEm.length,
    primeiraIa: aiEm.length ? aiEm[0] : null,
    ultimaIa: aiEm.length ? aiEm[aiEm.length - 1] : null,
  };
}

/** Conversas do cliente com esse telefone, da mais recente pra mais antiga. */
async function conversasDoTelefone(telefone) {
  const chave = chaveTelefone(telefone);
  if (chave.length < 8) throw new Error('Telefone curto demais: informe com DDD, ex: 62999197953.');
  // A busca da API e "contem": os 8 ultimos digitos pegam com e sem o 9; o
  // filtro abaixo descarta outro DDD com o mesmo final.
  const achadas = await api('/api/conversations', { search: chave.slice(-8), limit: 50 });
  const semDdd = chave.length < 10;
  return (Array.isArray(achadas) ? achadas : [])
    .filter((c) => {
      const t = chaveTelefone(c.client?.phone);
      return semDdd ? t.endsWith(chave) : t === chave;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function listarAgentes() {
  const r = await api('/api/ai-configurations/prompt');
  return Array.isArray(r?.data) ? r.data : [];
}

/** Agente pelo id; sem id, o unico do restaurante. */
async function resolverAgente(agenteId) {
  const agentes = await listarAgentes();
  if (agentes.length === 0) throw new Error('Nenhum agente de IA neste restaurante.');
  if (agenteId) {
    const a = agentes.find((x) => x.id === agenteId);
    if (!a) throw new Error('agente_id nao e de nenhum agente deste restaurante. Use listar_agentes.');
    return a;
  }
  if (agentes.length === 1) return agentes[0];
  throw new Error(
    `Este restaurante tem ${agentes.length} agentes; informe agente_id:\n` +
      agentes.map((a) => `- ${a.id}: ${a.nome} (${a.conexoes.map((c) => c.nome).join(', ') || 'sem conexao'})`).join('\n')
  );
}

/**
 * Qual versao do prompt valia num instante: 0 = a atual, N = a anterior N
 * (mesma numeracao de ver_prompt). Historico vem da mais recente pra mais antiga.
 */
function versaoEm(historico, instante) {
  return historico.filter((v) => new Date(v.trocadoEm).getTime() > instante).length;
}

const ORIGEM = { tela: 'pela tela do CRM', api: 'pela API', mcp: 'pelo MCP' };

const AVISO_MODO_SIMPLES =
  'Este prompt foi gerado pelo modo simples da tela. Se alguem salvar o modo simples de novo, ' +
  'a tela avisa que o texto foi editado fora e, se confirmarem, gera tudo de novo e apaga a alteracao.';

  const server = new McpServer({ name: admin ? 'maya-crm-admin' : 'maya-crm', version: '1.2.0' });

const nomeRestaurante = (r) => `${r.nome} (${r.id})`;

/**
 * Super-admin: de qual restaurante e esta chamada. Ordem: restaurante_id
 * explicito > dono do agente/conversa > restaurante onde o telefone e cliente.
 */
async function escolherRestaurante(args) {
  if (args.restaurante_id) {
    const r = await admin.restauranteDe({ restauranteId: args.restaurante_id });
    if (!r) throw new Error('restaurante_id nao existe. Use listar_restaurantes ou buscar_telefone.');
    return r;
  }
  const porId = await admin.restauranteDe({ agenteId: args.agente_id, conversaId: args.conversa_id });
  if (porId) return porId;
  if (args.telefone) {
    const onde = await admin.ondeApareceTelefone(args.telefone);
    const porRestaurante = new Map(onde.clientes.map((c) => [c.restaurante.id, c.restaurante]));
    if (porRestaurante.size === 1) return [...porRestaurante.values()][0];
    if (porRestaurante.size === 0) {
      throw new Error(`O telefone ${args.telefone} nao e cliente de nenhum restaurante. Use buscar_telefone pra ver onde ele aparece.`);
    }
    throw new Error(
      `O telefone ${args.telefone} e cliente de ${porRestaurante.size} restaurantes; repita com restaurante_id:\n` +
        [...porRestaurante.values()].map((r) => `- ${nomeRestaurante(r)}`).join('\n')
    );
  }
  throw new Error('Informe restaurante_id (listar_restaurantes ou buscar_telefone) ou o telefone do cliente.');
}

/**
 * registerTool com o modo super-admin: acrescenta `restaurante_id`, escolhe o
 * restaurante antes de rodar e diz qual foi no topo da resposta. Ferramenta
 * que escreve some com o token de leitura.
 */
function registrar(nome, definicao, executar, { escreve = false } = {}) {
  if (!admin) return server.registerTool(nome, definicao, executar);
  if (escreve && !admin.podeAlterar) return;
  const inputSchema = {
    restaurante_id: z.string().uuid().optional()
      .describe('Restaurante (listar_restaurantes / buscar_telefone). Dispensavel se vier agente_id, conversa_id ou o telefone do cliente.'),
    ...definicao.inputSchema,
  };
  server.registerTool(nome, { ...definicao, inputSchema }, async (args, extra) => {
    restaurante = await escolherRestaurante(args);
    const r = await executar(args, extra);
    return {
      ...r,
      content: [{ type: 'text', text: `Restaurante: ${nomeRestaurante(restaurante)}` }, ...(r.content || [])],
    };
  });
}

// ─── Conversas ───────────────────────────────────────────────

registrar(
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
      conexao_id: z.string().uuid().optional()
        .describe('So as conversas de uma conexao (WhatsApp); ids em listar_agentes.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ status, desde, ate, limite, pular, conexao_id }) => {
    const conversas = await api('/api/conversations', {
      status,
      inboxId: conexao_id,
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

registrar(
  'ler_conversa',
  {
    title: 'Ler conversa',
    description:
      'Transcricao de uma conversa, em ordem cronologica, com quem falou cada mensagem ' +
      '(cliente, IA, atendente ou sistema) e as ferramentas que a IA usou no meio ' +
      '(reserva, consulta de horarios, transferencia...), com o resultado de cada uma. ' +
      'Aceita o id da conversa ou o telefone do cliente (traz a conversa mais recente dele). ' +
      'Pra saber onde a IA fugiu do prompt, prefira auditar_conversas com o telefone: ja traz o prompt junto.',
    inputSchema: {
      conversa_id: z.string().uuid().optional().describe('id da conversa, obtido em listar_conversas.'),
      telefone: z.string().optional()
        .describe('Telefone do cliente com DDD, ex: 62999197953 (com ou sem 55, com ou sem o 9).'),
      limite: z.number().int().min(1).max(MAX_MENSAGENS).optional()
        .describe(`Quantas mensagens trazer (padrao 80, maximo ${MAX_MENSAGENS}).`),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ conversa_id, telefone, limite }) => {
    if (!conversa_id && !telefone) throw new Error('Informe conversa_id ou telefone.');

    let id = conversa_id;
    let outras = [];
    if (!id) {
      const doCliente = await conversasDoTelefone(telefone);
      if (doCliente.length === 0) return texto(`Nenhuma conversa com o telefone ${telefone} neste restaurante.`);
      id = doCliente[0].id;
      outras = doCliente.slice(1);
    }

    const t = await transcricao(id, limite ?? 80);
    if (!t) return texto('Conversa sem mensagens (ou id inexistente neste restaurante).');

    const avisos = [
      outras.length
        ? `(Este cliente tem mais ${outras.length} conversa(s): ` +
          `${outras.map((c) => `${c.id} de ${data(c.startedAt)}`).join(', ')}. Use conversa_id pra abrir.)`
        : null,
      t.cortada ? '(Atingiu o limite — ha mensagens mais antigas. Aumente `limite` para ver o resto.)' : null,
      t.semFerramentas ? '(Nao deu pra carregar as ferramentas usadas pela IA: so as mensagens.)' : null,
    ].filter(Boolean);

    return texto(
      `Conversa ${id} — ${t.total} mensagem(ns):\n\n${t.linhas.join('\n')}` +
        `${avisos.length ? `\n\n${avisos.join('\n')}` : ''}`
    );
  }
);

// ─── Funil ───────────────────────────────────────────────────

registrar(
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

registrar(
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

// ─── Agente de IA: prompt ────────────────────────────────────

registrar(
  'listar_agentes',
  {
    title: 'Listar agentes de IA',
    description:
      'Agentes de IA do restaurante: id, conexoes (WhatsApp) que cada um atende, motor ' +
      '(maestro = motor do CRM, n8n = fluxo externo) e tamanho do prompt. Ponto de partida ' +
      'pra ver_prompt e auditar_conversas.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    const agentes = await listarAgentes();
    if (agentes.length === 0) return texto('Nenhum agente de IA neste restaurante.');

    const linhas = agentes.map((a) =>
      [
        `- id: ${a.id}`,
        `  nome: ${a.nome}${a.ativo ? '' : ' (DESATIVADO)'} | motor: ${a.motor}`,
        `  conexoes: ${a.conexoes.map((c) => `${c.nome} (${c.id})`).join(', ') || 'nenhuma — nao atende ninguem'}`,
        `  prompt: ${a.tamanho} caracteres | ${a.valeDesde ? `alterado em ${data(a.valeDesde)}` : 'sem troca registrada'}` +
          `${a.modoSimples ? ' | gerado pelo modo simples' : ''}`,
      ].join('\n')
    );
    return texto(`${agentes.length} agente(s):\n\n${linhas.join('\n\n')}`);
  }
);

registrar(
  'ver_prompt',
  {
    title: 'Ver prompt do agente',
    description:
      'Prompt do agente de IA (o texto que o restaurante escreveu), com a marca de versao ' +
      'exigida por alterar_prompt e o historico de trocas (quando, por onde, por que). ' +
      'Com versao_anterior=N mostra o texto que valia antes da troca N.',
    inputSchema: {
      agente_id: z.string().uuid().optional()
        .describe('id do agente (listar_agentes). Opcional se o restaurante tiver um so.'),
      versao_anterior: z.number().int().min(1).max(10).optional()
        .describe('Mostrar a versao anterior N (1 = a que valia antes da ultima troca).'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ agente_id, versao_anterior }) => {
    const agente = await resolverAgente(agente_id);
    const p = await api('/api/ai-configurations/prompt', { id: agente.id, anterior: versao_anterior });

    const historico = p.historico.length
      ? p.historico
          .map(
            (v) =>
              `  ${v.numero}. valia ${v.valiaDesde ? `de ${data(v.valiaDesde)} ` : ''}ate ${data(v.trocadoEm)}, ` +
              `trocado ${ORIGEM[v.origem] || v.origem}${v.motivo ? ` — "${v.motivo}"` : ''} (${v.tamanho} caracteres)`
          )
          .join('\n')
      : '  (nenhuma troca registrada ainda)';

    const cabecalho = [
      `Agente "${p.nome}" (${p.id})${p.ativo ? '' : ' — DESATIVADO'} | motor: ${p.motor}`,
      `Conexoes: ${p.conexoes.map((c) => c.nome).join(', ') || 'nenhuma'}`,
      `Versao atual: ${p.versao} | ${p.tamanho} caracteres | ${p.valeDesde ? `vale desde ${data(p.valeDesde)}` : 'sem troca registrada'}`,
      p.modoSimples ? `Atencao: ${AVISO_MODO_SIMPLES}` : null,
      p.motor === 'maestro'
        ? 'O motor maestro soma a este texto regras fixas (mensagens curtas de WhatsApp, sem markdown, ' +
          'nao inventar, nao dizer que fez algo sem a ferramenta confirmar) e o roteiro das ferramentas ligadas.'
        : null,
      `Historico:\n${historico}`,
    ].filter(Boolean);

    if (p.anterior) {
      return texto(
        `${cabecalho.join('\n')}\n\n════ VERSAO ANTERIOR ${p.anterior.numero} ════\n${p.anterior.prompt}\n════ FIM ════\n\n` +
          `Pra voltar a ela: restaurar_prompt com voltar_para=${p.anterior.numero} e versao=${p.versao}.`
      );
    }
    return texto(`${cabecalho.join('\n')}\n\n════ PROMPT ATUAL ════\n${p.prompt}\n════ FIM DO PROMPT ════`);
  }
);

registrar(
  'auditar_conversas',
  {
    title: 'Auditar conversas contra o prompt',
    description:
      'Junta o prompt do agente e as conversas mais recentes em que a IA respondeu ' +
      '(mensagens + ferramentas usadas), pra conferir se a IA segue o prompt. Como auditar: ' +
      'separe o prompt em regras/instrucoes concretas; pra cada uma, diga se foi cumprida, ' +
      'quebrada ou nao se aplicou, citando conversa e horario como prova; aponte tambem o ' +
      'que a IA fez que o prompt nao cobre e trechos do prompt ambiguos ou conflitantes. ' +
      'Conversa marcada com versao anterior deve ser julgada contra aquela versao (ver_prompt). ' +
      'Com telefone, audita so as conversas daquele cliente (e acha o agente pela conexao). ' +
      'Proponha ajustes de texto, mas so altere com alterar_prompt depois do usuario aprovar.',
    inputSchema: {
      telefone: z.string().optional()
        .describe('So as conversas deste cliente. Com DDD, ex: 62999197953 (com ou sem 55, com ou sem o 9).'),
      agente_id: z.string().uuid().optional()
        .describe('id do agente (listar_agentes). Opcional se o restaurante tiver um so ou se vier telefone.'),
      desde: z.string().optional().describe('Data inicial (ISO 8601). Filtra pelo inicio da conversa.'),
      ate: z.string().optional().describe('Data final (ISO 8601).'),
      quantidade: z.number().int().min(1).max(MAX_AUDITADAS).optional()
        .describe(`Quantas conversas com resposta da IA (padrao 6, maximo ${MAX_AUDITADAS}).`),
      mensagens_por_conversa: z.number().int().min(10).max(MAX_MENSAGENS).optional()
        .describe('Mensagens mais recentes de cada conversa (padrao 60).'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ telefone, agente_id, desde, ate, quantidade, mensagens_por_conversa }) => {
    const alvo = quantidade ?? 6;
    const limiteMsgs = mensagens_por_conversa ?? 60;

    // Com telefone: as conversas do cliente decidem o agente (o da conexao
    // onde ele falou por ultimo), salvo agente_id explicito.
    let doCliente = null;
    let agente;
    if (telefone) {
      doCliente = await conversasDoTelefone(telefone);
      if (doCliente.length === 0) return texto(`Nenhuma conversa com o telefone ${telefone} neste restaurante.`);
      if (agente_id) {
        agente = await resolverAgente(agente_id);
      } else {
        const conexao = doCliente[0].inbox;
        agente = (await listarAgentes()).find((a) => a.conexoes.some((c) => c.id === conexao?.id));
        if (!agente) {
          return texto(
            `A conversa mais recente de ${telefone} e da conexao "${conexao?.displayName || '—'}", ` +
              'que nao tem agente de IA ligado: nao ha prompt pra comparar.'
          );
        }
      }
    } else {
      agente = await resolverAgente(agente_id);
    }

    const p = await api('/api/ai-configurations/prompt', { id: agente.id });
    if (p.conexoes.length === 0) {
      return texto(`O agente "${p.nome}" nao esta ligado a nenhuma conexao: nao ha conversa dele pra auditar.`);
    }
    const nomeConexao = new Map(p.conexoes.map((c) => [c.id, c.nome]));

    // Conversa sem resposta da IA (atendente assumiu, cliente sumiu) nao serve:
    // busca o triplo e filtra lendo.
    let candidatas;
    if (doCliente) {
      candidatas = doCliente.filter((c) => nomeConexao.has(c.inbox?.id));
    } else {
      const listas = await Promise.all(
        p.conexoes.map((c) =>
          api('/api/conversations', { inboxId: c.id, startDate: desde, endDate: ate, limit: Math.min(alvo * 3, MAX_CONVERSAS) })
        )
      );
      candidatas = listas
        .flatMap((l) => (Array.isArray(l) ? l : []))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    candidatas = candidatas.slice(0, alvo * 3);

    const auditadas = [];
    for (let i = 0; i < candidatas.length && auditadas.length < alvo; i += 4) {
      const lote = candidatas.slice(i, i + 4);
      const lidas = await Promise.all(lote.map((c) => transcricao(c.id, limiteMsgs).catch(() => null)));
      lote.forEach((c, j) => {
        if (lidas[j]?.respostasIa && auditadas.length < alvo) auditadas.push({ c, t: lidas[j] });
      });
    }

    const cabecalho = [
      `AUDITORIA — agente "${p.nome}" | motor: ${p.motor} | conexoes: ${p.conexoes.map((c) => c.nome).join(', ')}`,
      `Prompt atual: versao ${p.versao}, ${p.tamanho} caracteres, ` +
        `${p.valeDesde ? `vale desde ${data(p.valeDesde)}` : 'sem troca registrada'}.`,
      p.motor === 'maestro'
        ? 'Alem do prompt, o motor maestro manda regras fixas (mensagens curtas, sem markdown, uma pergunta por vez, ' +
          'nao inventar, nao dizer que fez sem a ferramenta confirmar) e o roteiro das ferramentas: nao culpe o prompt por elas.'
        : null,
      `${auditadas.length} conversa(s) com resposta da IA (de ${candidatas.length} olhada(s)).`,
    ].filter(Boolean);

    if (auditadas.length === 0) {
      return texto(`${cabecalho.join('\n')}\n\nNenhuma conversa com resposta da IA nesse periodo.`);
    }

    let saida = `${cabecalho.join('\n')}\n\n════ PROMPT ATUAL ════\n${p.prompt}\n════ FIM DO PROMPT ════`;
    let cortadas = 0;

    auditadas.forEach(({ c, t }, i) => {
      const cliente = [c.client?.firstName, c.client?.lastName].filter(Boolean).join(' ').trim() || 'sem nome';
      const vIni = versaoEm(p.historico, t.primeiraIa);
      const vFim = versaoEm(p.historico, t.ultimaIa);
      const versao =
        vIni === 0
          ? null
          : vIni === vFim
            ? `(Prompt que valia: versao anterior ${vIni} — veja ver_prompt com versao_anterior=${vIni}.)`
            : `(O prompt mudou no meio desta conversa: comecou na versao anterior ${vIni}` +
              `${vFim === 0 ? ' e terminou na atual' : ` e terminou na anterior ${vFim}`}.)`;
      const bloco = [
        `── Conversa ${i + 1}/${auditadas.length} | id ${c.id} | cliente: ${cliente} | ` +
          `conexao: ${nomeConexao.get(c.inbox?.id) || c.inbox?.displayName || '—'} | status: ${c.status} ──`,
        versao,
        t.cortada ? `(So as ${t.total} mensagens mais recentes; ler_conversa traz mais.)` : null,
        t.semFerramentas ? '(Ferramentas indisponiveis: so as mensagens.)' : null,
        ...t.linhas,
      ]
        .filter(Boolean)
        .join('\n');

      if (saida.length + bloco.length > MAX_SAIDA) {
        cortadas++;
        return;
      }
      saida += `\n\n${bloco}`;
    });

    if (cortadas) {
      saida += `\n\n(${cortadas} conversa(s) ficaram de fora pelo tamanho. Diminua mensagens_por_conversa ou use ler_conversa.)`;
    }
    return texto(saida);
  }
);

registrar(
  'alterar_prompt',
  {
    title: 'Alterar prompt do agente',
    description:
      'ALTERA o prompt do agente de IA: muda como a IA atende os clientes a partir da proxima ' +
      'resposta. Antes: ver_prompt (pra pegar a versao) e mostrar ao usuario exatamente o que ' +
      'vai mudar, pedindo confirmacao. Prefira trocar+por (troca so um trecho, que precisa ' +
      'aparecer uma vez no texto atual); prompt_novo reescreve tudo. O texto anterior vai pro ' +
      'historico e restaurar_prompt traz de volta. Se alguem mexeu no prompt depois da leitura, ' +
      'a alteracao e recusada: leia de novo.',
    inputSchema: {
      agente_id: z.string().uuid().describe('id do agente (listar_agentes).'),
      versao: z.string().describe('Marca de versao mostrada por ver_prompt (ex: 3f9a1c0b7d2e).'),
      motivo: z.string().min(3).max(300)
        .describe('Por que esta mudanca (fica no historico). Ex: "IA confirmava reserva sem a ferramenta".'),
      trocar: z.string().optional()
        .describe('Trecho EXATO do prompt atual a substituir (com as mesmas quebras de linha).'),
      por: z.string().optional().describe('Texto que entra no lugar do trecho. Vazio remove o trecho.'),
      prompt_novo: z.string().optional().describe('Prompt inteiro novo, no lugar de trocar+por.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ agente_id, versao, motivo, trocar, por, prompt_novo }) => {
    if ((trocar === undefined) === (prompt_novo === undefined)) {
      throw new Error('Use trocar+por (um trecho) OU prompt_novo (tudo), um dos dois.');
    }
    if (trocar !== undefined && por === undefined) {
      throw new Error('Faltou "por": o texto que entra no lugar do trecho (vazio pra remover).');
    }
    const agente = await resolverAgente(agente_id);
    const r = await api('/api/ai-configurations/prompt', {}, {
      metodo: 'PATCH',
      corpo: { id: agente.id, versao, motivo, ...(trocar !== undefined ? { trocar, por } : { prompt_novo }) },
    });

    return texto(
      [
        `Prompt do agente "${agente.nome}" alterado em ${data(r.trocadoEm)}.`,
        `Tamanho: ${r.tamanhoAntes} → ${r.tamanhoDepois} caracteres. Versao nova: ${r.versao}.`,
        'Vale a partir da proxima resposta da IA.',
        `Pra desfazer: restaurar_prompt com agente_id=${agente.id}, versao=${r.versao}, voltar_para=1.`,
        agente.modoSimples ? `Atencao: ${AVISO_MODO_SIMPLES}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
  },
  { escreve: true }
);

registrar(
  'restaurar_prompt',
  {
    title: 'Restaurar versao anterior do prompt',
    description:
      'Volta o prompt do agente pra uma versao do historico (1 = a que valia antes da ultima ' +
      'troca). O texto atual tambem vai pro historico, entao da pra voltar de novo. Confirme ' +
      'com o usuario antes.',
    inputSchema: {
      agente_id: z.string().uuid().describe('id do agente (listar_agentes).'),
      versao: z.string().describe('Marca da versao ATUAL, mostrada por ver_prompt.'),
      voltar_para: z.number().int().min(1).max(10).optional()
        .describe('Numero da versao anterior no historico (padrao 1).'),
      motivo: z.string().min(3).max(300).describe('Por que esta voltando (fica no historico).'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ agente_id, versao, voltar_para, motivo }) => {
    const agente = await resolverAgente(agente_id);
    const n = voltar_para ?? 1;
    const r = await api('/api/ai-configurations/prompt', {}, {
      metodo: 'PATCH',
      corpo: { id: agente.id, versao, motivo, restaurar: n },
    });
    return texto(
      `Prompt do agente "${agente.nome}" voltou pra versao anterior ${n} em ${data(r.trocadoEm)}.\n` +
        `Tamanho: ${r.tamanhoAntes} → ${r.tamanhoDepois} caracteres. Versao nova: ${r.versao}.\n` +
        `O texto que estava valendo virou a versao anterior 1 (restaurar_prompt com voltar_para=1 desfaz).`
    );
  },
  { escreve: true }
);

// ─── Super-admin: entre restaurantes ─────────────────────────

if (admin) {
  server.registerTool(
    'buscar_telefone',
    {
      title: 'Onde este telefone aparece',
      description:
        'Procura um telefone em TODOS os restaurantes: como cliente (com a ultima conversa), ' +
        'como o WhatsApp do restaurante ou como usuario da equipe. Use pra descobrir o ' +
        'restaurante_id antes das outras ferramentas.',
      inputSchema: {
        telefone: z.string().describe('Com DDD, ex: 62999197953 (com ou sem 55, com ou sem o 9).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ telefone }) => {
      if (chaveTelefone(telefone).length < 8) throw new Error('Telefone curto demais: informe com DDD.');
      const onde = await admin.ondeApareceTelefone(telefone);
      const partes = [];
      if (onde.clientes.length) {
        partes.push(
          'Cliente em:\n' +
            onde.clientes
              .map(
                (c) =>
                  `- ${nomeRestaurante(c.restaurante)}: ${c.nome} (${c.telefone}), ${c.conversas} conversa(s)` +
                  `${c.ultimaConversaEm ? `, ultima em ${data(c.ultimaConversaEm)}` : ''}`
              )
              .join('\n')
        );
      }
      if (onde.conexoes.length) {
        partes.push(
          'WhatsApp do restaurante:\n' +
            onde.conexoes
              .map((c) => `- ${nomeRestaurante(c.restaurante)}: conexao "${c.nome}" (${c.telefone}, ${c.status || 'sem status'})`)
              .join('\n')
        );
      }
      if (onde.usuarios.length) {
        partes.push(
          'Usuario da equipe:\n' +
            onde.usuarios
              .map(
                (u) =>
                  `- ${u.restaurante ? nomeRestaurante(u.restaurante) : 'sem restaurante'}: ${u.nome}` +
                  `${u.papeis.length ? ` (${u.papeis.join(', ')})` : ''}`
              )
              .join('\n')
        );
      }
      return texto(partes.length ? partes.join('\n\n') : `O telefone ${telefone} nao aparece em nenhum restaurante.`);
    }
  );

  server.registerTool(
    'listar_restaurantes',
    {
      title: 'Listar restaurantes',
      description: 'Restaurantes da plataforma com id e os WhatsApps (conexoes) de cada um. Filtre pelo nome.',
      inputSchema: {
        busca: z.string().optional().describe('Parte do nome do restaurante.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ busca }) => {
      const lista = await admin.listarRestaurantes(busca);
      if (lista.length === 0) return texto('Nenhum restaurante encontrado.');
      const linhas = lista.map(
        (r) =>
          `- ${nomeRestaurante(r)}${r.ativo ? '' : ' — DESATIVADO'}\n` +
          `  WhatsApp: ${r.conexoes.map((c) => `${c.nome} (${c.telefone || 'sem numero'}, ${c.status || 'sem status'})`).join('; ') || 'nenhum'}`
      );
      return texto(`${lista.length} restaurante(s):\n\n${linhas.join('\n')}`);
    }
  );
}

  return server;
}
