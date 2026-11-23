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
 * Le conversas, funil, a configuracao do agente de IA e as solicitacoes.
 * Escreve, sempre com trava:
 *   - prompt do agente, NO FORMATO DO MODO EM USO (modo simples: campos;
 *     avancado: texto). O modo so se troca na plataforma;
 *   - base de conhecimento, regras de encaminhamento e ferramentas nativas
 *     (so no modo super-admin com o token completo).
 * Toda escrita: primeiro a previa (sem `aplicar`, nada e gravado), depois a
 * mesma chamada com aplicar=true. Exige a versao lida (se alguem mexeu no
 * meio, recusa) e um motivo; fica no historico e da pra desfazer.
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
 * Guia geral que o cliente MCP recebe ao conectar (instructions): como alterar
 * com seguranca e onde fica cada informacao.
 */
const INSTRUCOES = `MCP do CRM Maya (Chat): conversas, configuração da IA de atendimento e solicitações de cada restaurante.

ORDEM SEGURA PARA QUALQUER ALTERAÇÃO
1. Leia antes: ver_agente (prompt), listar_base_conhecimento, listar_regras, listar_ferramentas. Cada leitura traz a "versao" que a alteração exige.
2. Chame a ferramenta de alteração SEM aplicar: ela devolve a prévia (antes → depois) e nada é gravado. Mostre a prévia para aprovação.
3. Só depois da aprovação, repita a MESMA chamada com aplicar=true. Tudo fica no histórico e dá para voltar (restaurar_prompt; desfazer_alteracao).

PROMPT DO AGENTE
- O modo (simples ou avançado) é escolhido só na plataforma; ver_agente mostra qual está em uso.
- Modo simples (restaurantes): altere campo a campo com alterar_campos. Modo avançado (outros segmentos): altere o texto com alterar_prompt. A ferramenta do outro modo é recusada.
- Antes de escrever, veja ver_o_que_a_ia_recebe: o sistema já manda regras fixas de WhatsApp (mensagens curtas, sem markdown, não inventar, idioma do cliente, despedida), o roteiro das ferramentas, as regras de encaminhamento, data, calendário e nome do cliente. Não repita isso no prompt.

ONDE FICA CADA INFORMAÇÃO
- Restaurante Reserve Maya: horários, turnos, regras e limites de reserva e eventos especiais (com reserva paga) vêm SÓ do Reserve Maya, em tempo real, pelas ferramentas. Nunca escreva isso no prompt nem na base de conhecimento (esses campos ficam bloqueados).
- Preços da casa (entrada, couvert, consumação mínima, taxa de serviço): ficam SÓ aqui, no campo precos do modo simples ou na base de conhecimento. O Reserve Maya informa só os valores de eventos especiais.
- Endereço: o Reserve Maya vale primeiro; se lá estiver vazio, a IA usa o campo endereco do prompt ou a base de conhecimento. Preencha aqui só se o Reserve Maya ainda não tiver (confira lá antes).
- Base de conhecimento: perguntas e respostas fixas da casa (pagamento, pet, estacionamento, rolha, capacidade de eventos...). É a do Chat; o FAQ do link de reservas é outro, do Reserve Maya.
- Saudação inicial, tom, limitações, links e o jeito da casa: campos do modo simples.
- Quando encaminhar para eventos personalizados ou para um atendente, o que perguntar antes e o que responder: regras de encaminhamento (listar_regras / alterar_regra), não o prompt.
- Reservas (criar, consultar, alterar, cancelar) não passam por este MCP: são do Reserve Maya.`;

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
 * conflito de versao) e diz o que corrigir.
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
    if ([400, 403, 404, 409].includes(res.status)) {
      const erro = await res.json().then((j) => j?.error).catch(() => null);
      if (typeof erro === 'string' && erro) motivo = erro.slice(0, 600);
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

/** "2026-09-01" vira o comeco (ou o fim) daquele dia em Sao Paulo; ISO completo passa como esta. */
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const inicioDoDia = (v) => (v && DIA.test(v) ? `${v}T00:00:00-03:00` : v);
const fimDoDia = (v) => (v && DIA.test(v) ? `${v}T23:59:59.999-03:00` : v);

/** Valores dos argumentos numa linha: `date=2026-11-03, people=2`. */
function argsEmLinha(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
}

/** Um valor de configuracao pra leitura: texto entre aspas, lista, sim/nao. */
function valor(v, max = 2000) {
  if (v === null || v === undefined || v === '') return '(vazio)';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (Array.isArray(v)) return v.length ? v.map((x) => `"${corta(String(x), 300)}"`).join(', ') : '(nenhum)';
  if (typeof v === 'object') return JSON.stringify(v);
  return `"${corta(String(v), max)}"`;
}

/**
 * Antes/depois de uma alteracao (resposta de /api/mcp-config): criar mostra
 * o que entra, apagar o que sai, editar so o que muda.
 */
function linhasDaMudanca(r) {
  const a = r.antes || null;
  const d = r.depois || null;
  if (!a && d) return Object.entries(d).map(([k, v]) => `  ${k}: ${valor(v)}`);
  if (a && !d) return Object.entries(a).map(([k, v]) => `  ${k}: ${valor(v)}`);
  if (!a || !d) return [];
  const linhas = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (JSON.stringify(a[k]) === JSON.stringify(d[k])) continue;
    linhas.push(`  ${k}:\n    antes:  ${valor(a[k])}\n    depois: ${valor(d[k])}`);
  }
  return linhas;
}

const ENTIDADE = { faq: 'Base de conhecimento', regra: 'Regra de encaminhamento', ferramentas: 'Ferramentas nativas' };
const ACAO = { criar: 'criar', editar: 'editar', apagar: 'apagar', desfazer: 'voltar ao que era antes' };

/** Texto da resposta de uma alteracao (previa ou aplicada). */
function relatorioDaAlteracao(r) {
  const linhas = linhasDaMudanca(r);
  const oQue = `${ENTIDADE[r.entidade] || r.entidade}: ${ACAO[r.acao] || r.acao}${r.id ? ` (id ${r.id})` : ''}`;
  if (r.simulado) {
    return [
      `PRÉVIA — nada foi gravado. ${oQue}.`,
      linhas.length ? linhas.join('\n') : '  (sem detalhes)',
      'Mostre esta prévia para aprovação. Para gravar, repita a mesma chamada com aplicar=true.',
    ].join('\n');
  }
  return [
    `Aplicado. ${oQue}.`,
    linhas.length ? linhas.join('\n') : null,
    r.versao ? `Versão nova: ${r.versao}` : null,
    // Uma volta nao se desfaz (o servidor recusa): para refazer, altera de novo.
    r.alteracaoId && r.acao !== 'desfazer' ? `Para desfazer: desfazer_alteracao com alteracao_id=${r.alteracaoId}.` : null,
  ]
    .filter(Boolean)
    .join('\n');
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

const MODO = {
  simples: 'SIMPLES (formulário da plataforma) → altere com alterar_campos',
  avancado: 'AVANÇADO (texto livre) → altere com alterar_prompt',
  nenhum: 'NENHUM (nada salvo; a IA usa um texto padrão curto) → escolha e salve o modo na plataforma antes de alterar por aqui',
};

const TIPO = { reserve_maya: 'Restaurante Reserve Maya', personalizado: 'Personalizado' };

/** Situacao da IA numa linha: ligada para todos, so para numeros de teste ou desligada. */
function situacaoIa(a) {
  if (!a.ativo) return 'IA DESLIGADA';
  return a.numerosDeTeste?.length ? `IA ligada só para os números de teste: ${a.numerosDeTeste.join(', ')}` : 'IA ligada para todos';
}

function conexoesEmLinha(a) {
  return (
    a.conexoes
      .map((c) => `${c.nome}${c.telefone ? ` (${c.telefone})` : ''}${c.idReserveMaya ? ` — ID Reserve Maya: ${c.idReserveMaya}` : ''}`)
      .join('; ') || 'nenhuma — não atende ninguém'
  );
}

  const server = new McpServer(
    { name: admin ? 'maya-crm-admin' : 'maya-crm', version: '1.3.0' },
    { instructions: INSTRUCOES }
  );

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
 * que escreve some com o token de leitura. `soAdmin`: so existe no modo
 * super-admin (a chave de API do restaurante nao altera essa configuracao).
 */
function registrar(nome, definicao, executar, { escreve = false, soAdmin = false } = {}) {
  if (!admin) {
    if (soAdmin) return;
    return server.registerTool(nome, definicao, executar);
  }
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

/** Parametro comum das ferramentas que escrevem. */
const APLICAR = z.boolean().optional()
  .describe('false/omitido = só a prévia (nada é gravado). true = grava. Aplique só depois de mostrar a prévia e ter aprovação.');
const MOTIVO = z.string().min(3).max(300)
  .describe('Por que esta mudança (fica no histórico). Ex.: "Casa Brisa: limitações vindas do prompt do NicoChat".');

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
        .describe('Data inicial (AAAA-MM-DD = desde o comeco do dia em Sao Paulo, ou ISO completo). Filtra pelo inicio da conversa.'),
      ate: z.string().optional().describe('Data final (AAAA-MM-DD = ate o fim do dia em Sao Paulo, ou ISO completo).'),
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
      startDate: inicioDoDia(desde),
      endDate: fimDoDia(ate),
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
        // Conversa antiga do webhook ficou sem startedAt: a criacao e o inicio.
        `  status: ${c.status} | iniciada: ${data(c.startedAt || c.createdAt)}`,
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
          `${outras.map((c) => `${c.id} de ${data(c.startedAt || c.createdAt)}`).join(', ')}. Use conversa_id pra abrir.)`
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

// ─── Agente de IA ────────────────────────────────────────────

registrar(
  'listar_agentes',
  {
    title: 'Listar agentes de IA',
    description:
      'Agentes de IA do restaurante: id, conexoes (WhatsApp) com o ID do Reserve Maya de cada ' +
      'uma, se a IA esta ligada (para todos ou so numeros de teste), motor (maestro = motor do ' +
      'CRM, n8n = fluxo externo), tipo e o modo do prompt em uso. Ponto de partida pra ' +
      'ver_agente, ver_prompt e auditar_conversas.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    const agentes = await listarAgentes();
    if (agentes.length === 0) return texto('Nenhum agente de IA neste restaurante.');

    const linhas = agentes.map((a) =>
      [
        `- id: ${a.id}`,
        `  nome: ${a.nome} | motor: ${a.motor} | ${situacaoIa(a)}`,
        `  tipo: ${TIPO[a.tipo] || a.tipo} | modo do prompt: ${MODO[a.modo] || a.modo}`,
        `  conexoes: ${conexoesEmLinha(a)}`,
        `  prompt: ${a.tamanho} caracteres | ${a.valeDesde ? `alterado em ${data(a.valeDesde)}` : 'sem troca registrada'}`,
      ].join('\n')
    );
    return texto(`${agentes.length} agente(s):\n\n${linhas.join('\n\n')}`);
  }
);

registrar(
  'ver_agente',
  {
    title: 'Ver configuração do agente',
    description:
      'Configuração do agente de IA por partes: modo do prompt em uso (e com qual ferramenta ' +
      'se altera), tipo (Reserve Maya ou personalizado), ID do Reserve Maya de cada conexão, ' +
      'motor, modelo, temperatura, se a IA está ligada e, no modo simples, cada campo com o ' +
      'valor atual, para que serve e o limite de tamanho. Traz a "versao" que alterar_campos ' +
      'exige. Comece por aqui antes de propor mudança no prompt.',
    inputSchema: {
      agente_id: z.string().uuid().optional()
        .describe('id do agente (listar_agentes). Opcional se o restaurante tiver um so.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ agente_id }) => {
    const agente = await resolverAgente(agente_id);
    const p = await api('/api/ai-configurations/prompt', { id: agente.id });

    const cabecalho = [
      `Agente "${p.nome}" (${p.id}) | motor: ${p.motor} | ${situacaoIa(p)}`,
      `Modelo: ${p.modelo}${p.temperatura !== null && p.temperatura !== undefined ? ` | temperatura: ${p.temperatura}` : ''}`,
      `Tipo: ${TIPO[p.tipo] || p.tipo} — ${p.tipoExplicado}`,
      `Conexões: ${conexoesEmLinha(p)}`,
      `MODO EM USO: ${MODO[p.modo] || p.modo}`,
      `Versão do prompt: ${p.versao} | ${p.tamanho} caracteres | ${p.valeDesde ? `vale desde ${data(p.valeDesde)}` : 'sem troca registrada'}`,
      p.motor !== 'maestro'
        ? 'Atenção: este agente responde pelo n8n, que monta o próprio prompt no fluxo. Os campos abaixo valem para o Maestro.'
        : null,
    ].filter(Boolean);

    if (p.modo !== 'simples') {
      return texto(
        `${cabecalho.join('\n')}\n\n` +
          (p.modo === 'avancado'
            ? 'O texto livre está em ver_prompt. Os campos do modo simples não valem enquanto o modo avançado estiver em uso.'
            : 'Nada salvo ainda. Peça para escolher e salvar o modo na aba Prompt da plataforma.')
      );
    }

    const FONTE = {
      reserve_maya: 'fonte: SÓ o Reserve Maya, em tempo real (campo bloqueado; deixe em branco)',
      reserve_maya_primeiro:
        'fonte: o Reserve Maya vale primeiro; este campo só é usado quando lá estiver vazio',
      prompt: null,
    };
    const campos = p.campos.map((c) => {
      const regra = c.bloqueado
        ? 'BLOQUEADO'
        : c.opcoes
          ? `opções: ${c.opcoes.map((o) => `${o.valor} (${o.rotulo}: ${o.descricao})`).join(' | ')}`
          : `até ${c.max} caracteres`;
      return [
        `- ${c.nome} — ${c.rotulo} [${regra}]`,
        `  para que serve: ${c.paraQueServe}`,
        FONTE[c.fonte] ? `  ${FONTE[c.fonte]}` : null,
        c.nota ? `  observação: ${c.nota}` : null,
        `  valor atual: ${valor(c.valor, 4000)}`,
      ]
        .filter(Boolean)
        .join('\n');
    });

    return texto(
      `${cabecalho.join('\n')}\n\nCampos do modo simples (nome para alterar_campos):\n${campos.join('\n')}\n\n` +
        'Para alterar: alterar_campos com agente_id, versao, motivo e só os campos que mudam. ' +
        'Antes de escrever, veja ver_o_que_a_ia_recebe para não repetir o que o sistema já manda.'
    );
  }
);

registrar(
  'ver_o_que_a_ia_recebe',
  {
    title: 'Ver o que a IA recebe',
    description:
      'O prompt inteiro que o motor Maestro monta, nas 4 partes e na ordem em que a IA recebe: ' +
      '1) texto do agente (o que se altera), 2) regras fixas de WhatsApp, 3) roteiro das ' +
      'ferramentas ligadas e das regras de encaminhamento, 4) contexto (data, calendário, ' +
      'cliente). Use antes de alterar o prompt, para não repetir o que o sistema já manda.',
    inputSchema: {
      agente_id: z.string().uuid().optional()
        .describe('id do agente (listar_agentes). Opcional se o restaurante tiver um so.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ agente_id }) => {
    const agente = await resolverAgente(agente_id);
    const p = await api('/api/ai-configurations/prompt', { id: agente.id, partes: 1 });
    const partes = p.partes || {};
    const secao = (titulo, origem, corpo) => `════ ${titulo} ════\n(${origem})\n${corpo?.trim() || '(vazio)'}`;
    return texto(
      [
        `Agente "${p.nome}" | motor: ${p.motor}${p.motor !== 'maestro' ? ' — este agente responde pelo n8n; abaixo está o que o Maestro mandaria' : ''}`,
        secao('1. TEXTO DO AGENTE', `vem da aba Prompt (modo em uso: ${p.modo}); é a única parte que se altera`, partes.agente),
        secao('2. REGRAS DE CONVERSA NO WHATSAPP', 'fixas do sistema, iguais para todo agente: não repita no prompt', partes.regras),
        secao('3. FERRAMENTAS E ENCAMINHAMENTOS', 'montado sozinho das ferramentas ligadas e das regras de encaminhamento', partes.ferramentas),
        secao('4. CONTEXTO DO ATENDIMENTO', 'preenchido a cada conversa; aqui, exemplo de primeira resposta', partes.contexto),
        'DADOS QUE ENTRAM SOZINHOS a cada conversa: data e hora atuais (São Paulo), calendário dos próximos 14 dias, ' +
          'primeiro nome do cliente, se é a primeira resposta (decide a saudação) e o código da conversa. O telefone do ' +
          'cliente não entra no texto: vai direto para as ferramentas de reserva. Horários, turnos, limites e eventos ' +
          'do Reserve Maya são consultados na hora, pelas ferramentas. Endereço: a IA consulta o Reserve Maya primeiro e, ' +
          'se não vier, usa o texto do agente ou a base. Preços da casa (entrada, couvert, consumação): só do texto do ' +
          'agente ou da base; o Reserve Maya informa só valores de eventos especiais.',
      ].join('\n\n')
    );
  }
);

registrar(
  'ver_prompt',
  {
    title: 'Ver prompt do agente',
    description:
      'Prompt do agente de IA (o texto que vai na parte 1), com o modo em uso, a marca de ' +
      'versao exigida para alterar e o historico de trocas (quando, por onde, por que). ' +
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
              `trocado ${ORIGEM[v.origem] || v.origem}${v.motivo ? ` — "${v.motivo}"` : ''} (${v.tamanho} caracteres` +
              `${v.doModoSimples ? ', do modo simples' : ''})`
          )
          .join('\n')
      : '  (nenhuma troca registrada ainda)';

    const cabecalho = [
      `Agente "${p.nome}" (${p.id})${p.ativo ? '' : ' — DESATIVADO'} | motor: ${p.motor}`,
      `Conexoes: ${conexoesEmLinha(p)}`,
      `MODO EM USO: ${MODO[p.modo] || p.modo}`,
      `Versao atual: ${p.versao} | ${p.tamanho} caracteres | ${p.valeDesde ? `vale desde ${data(p.valeDesde)}` : 'sem troca registrada'}`,
      p.motor === 'maestro'
        ? 'O motor maestro soma a este texto regras fixas e o roteiro das ferramentas ligadas (ver_o_que_a_ia_recebe).'
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
      'Proponha ajustes, mas so altere (alterar_campos ou alterar_prompt, conforme o modo) depois do usuario aprovar.',
    inputSchema: {
      telefone: z.string().optional()
        .describe('So as conversas deste cliente. Com DDD, ex: 62999197953 (com ou sem 55, com ou sem o 9).'),
      agente_id: z.string().uuid().optional()
        .describe('id do agente (listar_agentes). Opcional se o restaurante tiver um so ou se vier telefone.'),
      desde: z.string().optional().describe('Data inicial (AAAA-MM-DD ou ISO). Filtra pelo inicio da conversa.'),
      ate: z.string().optional().describe('Data final (AAAA-MM-DD ou ISO).'),
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
          api('/api/conversations', {
            inboxId: c.id,
            startDate: inicioDoDia(desde),
            endDate: fimDoDia(ate),
            limit: Math.min(alvo * 3, MAX_CONVERSAS),
          })
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
      `Prompt atual: versao ${p.versao}, ${p.tamanho} caracteres, modo ${p.modo}, ` +
        `${p.valeDesde ? `vale desde ${data(p.valeDesde)}` : 'sem troca registrada'}.`,
      p.motor === 'maestro'
        ? 'Alem do prompt, o motor maestro manda regras fixas (mensagens curtas, sem markdown, uma pergunta por vez, ' +
          'nao inventar, nao dizer que fez sem a ferramenta confirmar, idioma do cliente) e o roteiro das ferramentas e ' +
          'das regras de encaminhamento: nao culpe o prompt por elas (ver_o_que_a_ia_recebe).'
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
  'alterar_campos',
  {
    title: 'Alterar campos do modo simples',
    description:
      'ALTERA o prompt de um agente no MODO SIMPLES, campo a campo (o texto da IA é gerado de ' +
      'novo, igual quando se salva pela plataforma). Só funciona com o modo simples em uso ' +
      '(ver_agente); no avançado use alterar_prompt. Mande só os campos que mudam. Sem ' +
      'aplicar=true devolve a prévia (antes → depois) e nada é gravado. Em restaurante Reserve ' +
      'Maya, horario_funcionamento e horarios_reserva ficam bloqueados (vêm só do sistema de ' +
      'reservas). precos é aqui mesmo (o Reserve Maya só informa valores de eventos especiais). ' +
      'endereco: o Reserve Maya vale primeiro, preencha só se lá não tiver. O texto anterior vai ' +
      'para o histórico (restaurar_prompt volta).',
    inputSchema: {
      agente_id: z.string().uuid().describe('id do agente (listar_agentes).'),
      versao: z.string().describe('Versão do prompt lida em ver_agente (ex.: 3f9a1c0b7d2e).'),
      motivo: MOTIVO,
      campos: z
        .object({
          nome_ia: z.string().optional().describe('Como a IA se apresenta.'),
          nome_restaurante: z.string().optional().describe('Nome da casa, como o cliente conhece.'),
          tom: z.enum(['amigavel', 'formal', 'descontraido']).optional().describe('Jeito de falar.'),
          como_responde: z.enum(['objetivo', 'equilibrado', 'detalhado']).optional()
            .describe('Tamanho das respostas: objetivo (fala pouco), equilibrado, detalhado (fala muito).'),
          saudacao_inicial: z.string().optional()
            .describe('Texto da primeira resposta da conversa, do jeito que vai. {nome} = primeiro nome do cliente; {resposta} = onde entra a resposta ao que ele perguntou.'),
          endereco: z.string().optional()
            .describe('Endereço completo. Em restaurante Reserve Maya, só vale quando o Reserve Maya não tiver o endereço.'),
          horario_funcionamento: z.string().optional().describe('Só para quem NÃO usa Reserve Maya (lá é bloqueado).'),
          horarios_reserva: z.string().optional().describe('Só para quem NÃO usa Reserve Maya (lá é bloqueado).'),
          precos: z.string().optional()
            .describe('Preço de entrada, couvert, consumação mínima, taxa de serviço: os preços da casa ficam aqui (o Reserve Maya só informa valores de eventos especiais).'),
          sobre_a_casa: z.string().optional().describe('A proposta e o jeito da casa. Perguntas e respostas vão na base de conhecimento.'),
          links: z.string().optional().describe('Um por linha: "Cardápio: https://...".'),
          limitacoes: z.string().optional().describe('O que a IA nunca diz nem faz, um por linha. Vale acima do resto do texto.'),
          instrucoes_extras: z.string().optional().describe('Regras ou exceções que não cabem nos outros campos.'),
        })
        .describe('Só os campos que mudam. "" limpa o campo.'),
      aplicar: APLICAR,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ agente_id, versao, motivo, campos, aplicar }) => {
    const agente = await resolverAgente(agente_id);
    const enviados = Object.fromEntries(Object.entries(campos || {}).filter(([, v]) => v !== undefined));
    if (Object.keys(enviados).length === 0) throw new Error('Informe ao menos um campo em "campos".');
    const r = await api('/api/ai-configurations/prompt', {}, {
      metodo: 'PATCH',
      corpo: { id: agente.id, versao, motivo, campos: enviados, simular: !aplicar },
    });

    const mudancas = (r.mudancas || []).map(
      (m) => `- ${m.campo} (${m.rotulo}):\n    antes:  ${valor(m.antes, 3000)}\n    depois: ${valor(m.depois, 3000)}`
    );
    if (r.simulado) {
      return texto(
        [
          `PRÉVIA — nada foi gravado. Agente "${agente.nome}": ${mudancas.length} campo(s) mudam.`,
          ...mudancas,
          `Texto da IA: ${r.tamanhoAntes} → ${r.tamanhoDepois} caracteres.`,
          'Mostre esta prévia para aprovação. Para gravar, repita a mesma chamada com aplicar=true.',
        ].join('\n')
      );
    }
    return texto(
      [
        `Aplicado em ${data(r.trocadoEm)}. Agente "${agente.nome}": ${mudancas.length} campo(s) alterado(s).`,
        ...mudancas,
        `Texto da IA: ${r.tamanhoAntes} → ${r.tamanhoDepois} caracteres. Versão nova: ${r.versao}.`,
        'Vale a partir da próxima resposta da IA.',
        `Para desfazer: restaurar_prompt com agente_id=${agente.id}, versao=${r.versao}, voltar_para=1.`,
      ].join('\n')
    );
  },
  { escreve: true }
);

registrar(
  'alterar_prompt',
  {
    title: 'Alterar texto do prompt (modo avançado)',
    description:
      'ALTERA o texto do prompt de um agente no MODO AVANÇADO (texto livre). No modo simples ' +
      'é recusado: use alterar_campos. Prefira trocar+por (troca só um trecho, que precisa ' +
      'aparecer uma vez no texto atual); prompt_novo reescreve tudo. Sem aplicar=true devolve ' +
      'a prévia e nada é gravado. O texto anterior vai para o histórico e restaurar_prompt ' +
      'traz de volta. Se alguém mexeu no prompt depois da leitura, a alteração é recusada: leia de novo.',
    inputSchema: {
      agente_id: z.string().uuid().describe('id do agente (listar_agentes).'),
      versao: z.string().describe('Marca de versao mostrada por ver_prompt (ex: 3f9a1c0b7d2e).'),
      motivo: MOTIVO,
      trocar: z.string().optional()
        .describe('Trecho EXATO do prompt atual a substituir (com as mesmas quebras de linha).'),
      por: z.string().optional().describe('Texto que entra no lugar do trecho. Vazio remove o trecho.'),
      prompt_novo: z.string().optional().describe('Prompt inteiro novo, no lugar de trocar+por.'),
      aplicar: APLICAR,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ agente_id, versao, motivo, trocar, por, prompt_novo, aplicar }) => {
    if ((trocar === undefined) === (prompt_novo === undefined)) {
      throw new Error('Use trocar+por (um trecho) OU prompt_novo (tudo), um dos dois.');
    }
    if (trocar !== undefined && por === undefined) {
      throw new Error('Faltou "por": o texto que entra no lugar do trecho (vazio pra remover).');
    }
    const agente = await resolverAgente(agente_id);
    const r = await api('/api/ai-configurations/prompt', {}, {
      metodo: 'PATCH',
      corpo: {
        id: agente.id,
        versao,
        motivo,
        ...(trocar !== undefined ? { trocar, por } : { prompt_novo }),
        simular: !aplicar,
      },
    });

    if (r.simulado) {
      return texto(
        [
          `PRÉVIA — nada foi gravado. Agente "${agente.nome}" (modo avançado).`,
          trocar !== undefined
            ? `Trecho que sai:\n${corta(trocar, 3000)}\n\nTrecho que entra:\n${corta(por || '(remove o trecho)', 3000)}`
            : 'O texto inteiro é substituído pelo prompt_novo enviado.',
          `Tamanho: ${r.tamanhoAntes} → ${r.tamanhoDepois} caracteres.`,
          'Mostre esta prévia para aprovação. Para gravar, repita a mesma chamada com aplicar=true.',
        ].join('\n')
      );
    }
    return texto(
      [
        `Prompt do agente "${agente.nome}" alterado em ${data(r.trocadoEm)}.`,
        `Tamanho: ${r.tamanhoAntes} → ${r.tamanhoDepois} caracteres. Versao nova: ${r.versao}.`,
        'Vale a partir da proxima resposta da IA.',
        `Pra desfazer: restaurar_prompt com agente_id=${agente.id}, versao=${r.versao}, voltar_para=1.`,
      ].join('\n')
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
      'troca), sem trocar o modo: no modo simples volta os campos junto. Uma versao de outro ' +
      'modo e recusada (troca de modo so pela plataforma). O texto atual tambem vai pro ' +
      'historico, entao da pra voltar de novo. Sem aplicar=true so mostra a previa.',
    inputSchema: {
      agente_id: z.string().uuid().describe('id do agente (listar_agentes).'),
      versao: z.string().describe('Marca da versao ATUAL, mostrada por ver_prompt.'),
      voltar_para: z.number().int().min(1).max(10).optional()
        .describe('Numero da versao anterior no historico (padrao 1).'),
      motivo: MOTIVO,
      aplicar: APLICAR,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ agente_id, versao, voltar_para, motivo, aplicar }) => {
    const agente = await resolverAgente(agente_id);
    const n = voltar_para ?? 1;
    const r = await api('/api/ai-configurations/prompt', {}, {
      metodo: 'PATCH',
      corpo: { id: agente.id, versao, motivo, restaurar: n, simular: !aplicar },
    });
    if (r.simulado) {
      return texto(
        `PRÉVIA — nada foi gravado. Agente "${agente.nome}" voltaria para a versao anterior ${n} ` +
          `(modo ${r.modo}${r.modo === 'simples' ? ', com os campos daquela versao' : ''}).\n` +
          `Tamanho: ${r.tamanhoAntes} → ${r.tamanhoDepois} caracteres. Texto que voltaria (ver_prompt com versao_anterior=${n} mostra inteiro).\n` +
          'Para gravar, repita a mesma chamada com aplicar=true.'
      );
    }
    return texto(
      `Prompt do agente "${agente.nome}" voltou pra versao anterior ${n} em ${data(r.trocadoEm)}.\n` +
        `Tamanho: ${r.tamanhoAntes} → ${r.tamanhoDepois} caracteres. Versao nova: ${r.versao}.\n` +
        `O texto que estava valendo virou a versao anterior 1 (restaurar_prompt com voltar_para=1 desfaz).`
    );
  },
  { escreve: true }
);

// ─── Base de conhecimento ────────────────────────────────────

registrar(
  'listar_base_conhecimento',
  {
    title: 'Listar base de conhecimento',
    description:
      'Perguntas e respostas da base de conhecimento do Chat (a IA consulta quando o cliente ' +
      'pergunta), com id e versao de cada uma. Vale para todos os WhatsApps do restaurante. ' +
      'Não é o FAQ do link de reservas (esse é do Reserve Maya).',
    inputSchema: {
      busca: z.string().optional().describe('Filtra por texto na pergunta ou na resposta.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ busca }) => {
    const r = await api('/api/mcp-config/faq');
    const termo = (busca || '').trim().toLowerCase();
    const itens = (r.data || []).filter(
      (f) => !termo || f.pergunta.toLowerCase().includes(termo) || f.resposta.toLowerCase().includes(termo)
    );
    if (itens.length === 0) return texto(termo ? `Nenhuma pergunta com "${busca}".` : 'Base de conhecimento vazia.');
    const linhas = itens.map((f) =>
      [
        `- id: ${f.id} | versao: ${f.versao}${f.ativa ? '' : ' | DESATIVADA'}`,
        `  P: ${f.pergunta}`,
        `  R: ${f.resposta}`,
        f.categoria || f.palavrasChave?.length
          ? `  categoria: ${f.categoria || '—'} | palavras-chave: ${f.palavrasChave?.join(', ') || '—'}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
    return texto(`${itens.length} pergunta(s)${termo ? ` com "${busca}"` : ''}:\n\n${linhas.join('\n\n')}`);
  }
);

registrar(
  'alterar_base_conhecimento',
  {
    title: 'Alterar base de conhecimento',
    description:
      'Cria, edita ou apaga uma pergunta da base de conhecimento do Chat. A busca da IA é ' +
      'atualizada na hora (não precisa sincronizar). Uma pergunta por assunto; resposta pronta ' +
      'para o cliente. Em restaurante Reserve Maya: horários, turnos, limites de reserva e eventos ' +
      'especiais vêm só do sistema, em tempo real: não cadastre. Preços da casa (entrada, couvert, ' +
      'consumação) podem ficar aqui ou no campo precos do prompt: o Reserve Maya só informa valores ' +
      'de eventos especiais. Endereço: o Reserve Maya vale primeiro; cadastre aqui só se lá não ' +
      'tiver. Sem aplicar=true devolve a prévia. Editar e apagar exigem a versao de ' +
      'listar_base_conhecimento. Para desligar sem apagar, edite com ativa=false.',
    inputSchema: {
      acao: z.enum(['criar', 'editar', 'apagar']),
      id: z.string().uuid().optional().describe('editar/apagar: id da pergunta.'),
      versao: z.string().optional().describe('editar/apagar: versao lida em listar_base_conhecimento.'),
      pergunta: z.string().optional().describe('criar (obrigatória) / editar: a pergunta, como o cliente faria.'),
      resposta: z.string().optional().describe('criar (obrigatória) / editar: a resposta que a IA dá. Até 4000 caracteres.'),
      categoria: z.string().nullable().optional().describe('Categoria (opcional). null limpa.'),
      palavras_chave: z.array(z.string()).optional().describe('Palavras que ajudam a achar (até 20).'),
      ativa: z.boolean().optional().describe('false = a IA deixa de usar (sem apagar).'),
      motivo: MOTIVO,
      aplicar: APLICAR,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ acao, id, versao, pergunta, resposta, categoria, palavras_chave, ativa, motivo, aplicar }) => {
    if (acao !== 'criar' && (!id || !versao)) throw new Error('Para editar ou apagar, informe id e versao (listar_base_conhecimento).');
    const alteracao =
      acao === 'criar'
        ? { acao, pergunta, resposta, categoria, palavras_chave, ativa }
        : acao === 'editar'
          ? { acao, id, versao, pergunta, resposta, categoria, palavras_chave, ativa }
          : { acao, id, versao };
    const r = await api('/api/mcp-config/faq', {}, { metodo: 'POST', corpo: { motivo, simular: !aplicar, alteracao } });
    return texto(relatorioDaAlteracao(r));
  },
  { escreve: true, soAdmin: true }
);

// ─── Regras de encaminhamento ────────────────────────────────

registrar(
  'listar_regras',
  {
    title: 'Listar regras de encaminhamento',
    description:
      'Regras de encaminhamento da IA: funil "eventos" (eventos personalizados: casamento, ' +
      'aniversário fechado, corporativo, cardápio fechado, exclusividade do espaço) e ' +
      '"atendimento" (passar para um atendente: reclamação, dúvida sem resposta...). Cada regra ' +
      'diz QUANDO a IA encaminha (gatilho e não-gatilho), o que pergunta antes, o caminho ' +
      '(coletar direto ou apresentar com texto e fotos), o que responde e quem é avisado. Traz ' +
      'a versao de cada regra, os avisos do funil e o guia dos campos. É aqui, e não no prompt, ' +
      'que se define quando encaminhar.',
    inputSchema: {
      funil: z.enum(['eventos', 'atendimento']).optional().describe('Só um funil.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ funil }) => {
    const r = await api('/api/mcp-config/regras');
    const regras = (r.regras || []).filter((x) => !funil || x.funil === funil);
    const guia = (r.guia || []).map((g) => `- ${g.nome}: ${g.explicacao}`).join('\n');
    const avisos = (r.avisosDoFunil || [])
      .filter((a) => !funil || a.funil === funil)
      .map((a) => `- ${a.funil}: ${a.ligado ? 'ligado' : 'desligado'} | números: ${a.numeros.join(', ') || 'nenhum'} | enviado por: ${a.enviadoPor || '—'}`)
      .join('\n');
    const blocos = regras.map((x) => {
      const campos = (r.guia || []).map((g) => `  ${g.nome}: ${valor(x[g.nome], 1500)}`).join('\n');
      return `── ${x.nome} | funil: ${x.funil} | id: ${x.id} | versao: ${x.versao}${x.automatica ? ' | AUTOMÁTICA (falha da IA: só ativa, etiqueta e numeros_aviso mudam)' : ''}\n${campos}`;
    });
    return texto(
      [
        `GUIA DOS CAMPOS (nomes para alterar_regra):\n${guia}`,
        `AVISOS DO FUNIL (números que recebem toda solicitação do funil; mudam na plataforma, CRM > Regras):\n${avisos || '- nenhum configurado'}`,
        `${regras.length} regra(s)${funil ? ` no funil ${funil}` : ''}:\n\n${blocos.join('\n\n') || '(nenhuma)'}`,
      ].join('\n\n')
    );
  }
);

registrar(
  'alterar_regra',
  {
    title: 'Alterar regra de encaminhamento',
    description:
      'Cria, edita ou apaga uma regra de encaminhamento (eventos personalizados ou atendimento ' +
      'humano), com a mesma validação da tela CRM > Regras. Para a IA acertar: quando_usar ' +
      'específico, quando_nao_usar com o que parece mas não é (ex.: reserva normal de ' +
      'aniversário; evento especial da casa é reserva) e exemplos de frases. Caminho ' +
      '"coletar" pede os dados direto; "apresentar" manda antes a apresentação (texto e até 5 ' +
      'fotos https) e depois pede os dados. dados_a_coletar vão numa mensagem só. ' +
      'resposta_final e frase_pedido_dados levam o jeito de falar da casa. Sem aplicar=true ' +
      'devolve a prévia. Editar e apagar exigem a versao de listar_regras. Para desligar sem ' +
      'apagar, edite com ativa=false.',
    inputSchema: {
      acao: z.enum(['criar', 'editar', 'apagar']),
      funil: z.enum(['eventos', 'atendimento']).optional().describe('criar: em qual funil.'),
      id: z.string().uuid().optional().describe('editar/apagar: id da regra.'),
      versao: z.string().optional().describe('editar/apagar: versao lida em listar_regras.'),
      nome: z.string().optional().describe('criar (obrigatório): nome da categoria, ex.: "Casamento".'),
      etiqueta: z.string().optional().describe('criar (obrigatório): etiqueta da conversa.'),
      quando_usar: z.string().optional().describe('criar (obrigatório): GATILHO, quando a IA usa a regra (10 a 1000 caracteres).'),
      quando_nao_usar: z.string().optional().describe('NÃO-GATILHO: o que parece, mas não é.'),
      exemplos: z.array(z.string()).optional().describe('Frases de cliente (até 10).'),
      dados_a_coletar: z.array(z.string()).optional().describe('O que perguntar antes de encaminhar (até 8, 60 caracteres cada).'),
      frase_pedido_dados: z.string().optional().describe('Frase que abre o pedido de dados, no tom da casa.'),
      caminho: z.enum(['coletar', 'apresentar']).optional().describe('coletar = pergunta direto; apresentar = apresentação antes.'),
      apresentacao: z.string().optional().describe('Texto da apresentação (caminho apresentar). Vai exatamente assim.'),
      fotos: z.array(z.string()).optional().describe('Até 5 URLs https de fotos da apresentação.'),
      resposta_final: z.string().optional().describe('O que a IA diz depois de encaminhar. Variáveis: {nome}, {resumo}, {restaurante}.'),
      jeito_resposta_final: z.enum(['adaptar', 'exato']).optional().describe('exato = envia como está; adaptar = a IA adapta.'),
      pausar_ia: z.boolean().optional().describe('true = a conversa fica com a equipe e a IA para de responder.'),
      numeros_aviso: z.array(z.string()).optional().describe('Números avisados só nesta categoria (DDD + número).'),
      ativa: z.boolean().optional().describe('Liga/desliga a regra.'),
      motivo: MOTIVO,
      aplicar: APLICAR,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ acao, funil, id, versao, motivo, aplicar, ...campos }) => {
    if (acao === 'criar' && !funil) throw new Error('Para criar, informe o funil (eventos ou atendimento).');
    if (acao !== 'criar' && (!id || !versao)) throw new Error('Para editar ou apagar, informe id e versao (listar_regras).');
    const enviados = Object.fromEntries(
      Object.entries(campos).filter(([k, v]) => v !== undefined && k !== 'restaurante_id')
    );
    const alteracao =
      acao === 'criar'
        ? { acao, funil, ...enviados }
        : acao === 'editar'
          ? { acao, id, versao, ...enviados }
          : { acao, id, versao };
    const r = await api('/api/mcp-config/regras', {}, { metodo: 'POST', corpo: { motivo, simular: !aplicar, alteracao } });
    return texto(relatorioDaAlteracao(r));
  },
  { escreve: true, soAdmin: true }
);

registrar(
  'listar_solicitacoes',
  {
    title: 'Listar solicitações (leads)',
    description:
      'Solicitações abertas pela IA ou pela equipe num funil (eventos personalizados ou ' +
      'atendimento humano): cliente, categoria, etapa, dados coletados, resumo e se a equipe ' +
      'foi avisada no WhatsApp. Serve para a supervisão conferir se cada pedido chegou à equipe.',
    inputSchema: {
      funil: z.enum(['eventos', 'atendimento']),
      desde: z.string().optional().describe('AAAA-MM-DD (padrão: últimos 30 dias).'),
      ate: z.string().optional().describe('AAAA-MM-DD (padrão: hoje).'),
      busca: z.string().optional().describe('Nome ou telefone do cliente.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ funil, desde, ate, busca }) => {
    const r = await api('/api/solicitacoes', { funil, desde, ate, busca });
    const etapas = new Map((r.etapas || []).map((e) => [e.key, e.label]));
    const itens = r.itens || [];
    if (itens.length === 0) return texto(`Nenhuma solicitação em ${funil} de ${r.periodo?.desde} a ${r.periodo?.ate}.`);
    const linhas = itens.map((s) => {
      const dados = Object.entries(s.data || {}).map(([k, v]) => `${k}: ${v}`).join(' | ');
      const aviso = s.notifiedAt ? `aviso: enviado ${data(s.notifiedAt)}${s.notifyResult ? ` (${s.notifyResult})` : ''}` : `aviso: não enviado${s.notifyResult ? ` (${s.notifyResult})` : ''}`;
      return [
        `- ${data(s.createdAt)} | ${s.category} | etapa: ${etapas.get(s.stage) || s.stage} | origem: ${s.origin}`,
        `  cliente: ${s.customerName || 'sem nome'} (${s.customerPhone || 'sem telefone'}) | ${aviso}`,
        s.summary ? `  resumo: ${corta(s.summary, 500)}` : null,
        dados ? `  dados: ${corta(dados, 800)}` : null,
        s.conversationId ? `  conversa: ${s.conversationId}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    });
    return texto(`${itens.length} solicitação(ões) em ${funil}, de ${r.periodo?.desde} a ${r.periodo?.ate}:\n\n${linhas.join('\n\n')}`);
  }
);

// ─── Ferramentas ─────────────────────────────────────────────

registrar(
  'listar_ferramentas',
  {
    title: 'Listar ferramentas da IA',
    description:
      'Ferramentas nativas do CRM (base de conhecimento, transferir para atendente, eventos ' +
      'personalizados) ligadas ou não no restaurante, o modo de ferramentas do WhatsApp do ' +
      'agente (CRM ou servidor MCP como o Reserve Maya) e a lista do que a IA recebe de fato. ' +
      'Traz a versao que ligar_ferramentas exige.',
    inputSchema: {
      agente_id: z.string().uuid().optional().describe('Mostra também o modo e o que a IA desse agente recebe.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ agente_id }) => {
    const agente = agente_id ? await resolverAgente(agente_id) : null;
    const r = await api('/api/mcp-config/ferramentas', { agentId: agente?.id });
    const nativas = r.nativas.map((t) => `- ${t.nome} — ${t.rotulo}: ${t.ligada ? 'LIGADA' : 'desligada'}\n  ${t.oQueFaz}`).join('\n');
    const recebe = r.iaRecebe.map((t) => `- ${t.rotulo || t.nome} (${t.nome}, ${t.origem}${t.alteraDados ? ', altera dados' : ''})`).join('\n');
    return texto(
      [
        `Versão (para ligar_ferramentas): ${r.versao || '(nenhuma ligada)'}`,
        `NATIVAS (valem para o restaurante todo):\n${nativas}`,
        r.agente ? `MODO DO WHATSAPP do agente "${r.agente.nome}": ${r.agente.modo} — ${r.agente.modoExplicado}. Muda só na plataforma.` : null,
        `A IA RECEBE${r.agente ? ` (agente "${r.agente.nome}")` : ''}:\n${recebe || '- nada'}`,
      ]
        .filter(Boolean)
        .join('\n\n')
    );
  }
);

registrar(
  'ligar_ferramentas',
  {
    title: 'Ligar ou desligar ferramentas nativas',
    description:
      'Liga ou desliga ferramentas nativas do restaurante (buscar_conhecimento, ' +
      'transferir_para_humano, encaminhar_para_eventos). Sem encaminhar_para_eventos ligada, a ' +
      'IA não abre solicitação de evento personalizado (passa para um atendente). Integrações e ' +
      'o modo do WhatsApp mudam só na plataforma. Sem aplicar=true devolve a prévia.',
    inputSchema: {
      versao: z.string().describe('Versão lida em listar_ferramentas.'),
      ligar: z.array(z.enum(['buscar_conhecimento', 'transferir_para_humano', 'encaminhar_para_eventos'])).optional(),
      desligar: z.array(z.enum(['buscar_conhecimento', 'transferir_para_humano', 'encaminhar_para_eventos'])).optional(),
      motivo: MOTIVO,
      aplicar: APLICAR,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ versao, ligar, desligar, motivo, aplicar }) => {
    const r = await api('/api/mcp-config/ferramentas', {}, {
      metodo: 'POST',
      corpo: { versao, ligar: ligar || [], desligar: desligar || [], motivo, simular: !aplicar },
    });
    return texto(relatorioDaAlteracao(r));
  },
  { escreve: true, soAdmin: true }
);

// ─── Historico das alteracoes ────────────────────────────────

registrar(
  'listar_alteracoes',
  {
    title: 'Listar alterações feitas pelo MCP',
    description:
      'Histórico das alterações feitas por este MCP na base de conhecimento, nas regras e nas ' +
      'ferramentas, com o antes, o depois e o motivo. O id de cada uma é o que ' +
      'desfazer_alteracao recebe. O prompt tem histórico próprio (ver_prompt).',
    inputSchema: {
      entidade: z.enum(['faq', 'regra', 'ferramentas']).optional(),
      limite: z.number().int().min(1).max(100).optional().describe('Padrão 30.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ entidade, limite }) => {
    const r = await api('/api/mcp-config/alteracoes', { entidade, limite });
    const itens = r.data || [];
    if (itens.length === 0) return texto('Nenhuma alteração registrada.');
    const linhas = itens.map((c) =>
      [
        `- id: ${c.id} | ${data(c.quando)} | ${c.entidade} | ${c.acao}${c.registro ? ` | registro ${c.registro}` : ''}${c.desfeitaEm ? ` | DESFEITA em ${data(c.desfeitaEm)}` : ''}`,
        `  motivo: "${c.motivo}"`,
        ...linhasDaMudanca(c),
      ].join('\n')
    );
    return texto(`${itens.length} alteração(ões):\n\n${linhas.join('\n\n')}`);
  }
);

registrar(
  'desfazer_alteracao',
  {
    title: 'Desfazer alteração',
    description:
      'Volta uma alteração da base de conhecimento, de uma regra ou das ferramentas ' +
      '(listar_alteracoes). Só funciona se o registro ainda está como a alteração deixou; se ' +
      'mudou depois, é recusado para não apagar a mudança nova. Sem aplicar=true devolve a prévia.',
    inputSchema: {
      alteracao_id: z.string().uuid().describe('id em listar_alteracoes (ou o que a alteração devolveu).'),
      motivo: MOTIVO,
      aplicar: APLICAR,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ alteracao_id, motivo, aplicar }) => {
    const r = await api('/api/mcp-config/alteracoes', {}, {
      metodo: 'POST',
      corpo: { id: alteracao_id, motivo, simular: !aplicar },
    });
    return texto(relatorioDaAlteracao(r));
  },
  { escreve: true, soAdmin: true }
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
      description:
        'Restaurantes da plataforma com id e os WhatsApps (conexoes) de cada um, com o ID do ' +
        'restaurante no Reserve Maya quando a conexao tem. Filtre pelo nome.',
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
          `  WhatsApp: ${
            r.conexoes
              .map(
                (c) =>
                  `${c.nome} (${c.telefone || 'sem numero'}, ${c.status || 'sem status'}` +
                  `${c.idReserveMaya ? `, ID Reserve Maya: ${c.idReserveMaya}` : ''})`
              )
              .join('; ') || 'nenhum'
          }`
      );
      return texto(`${lista.length} restaurante(s):\n\n${linhas.join('\n')}`);
    }
  );
}

  return server;
}
