#!/usr/bin/env node
/**
 * MCP do CRM Maya por HTTP — roda no servidor, alcancavel pelo claude.ai.
 *
 * Mesmas ferramentas do `server.mjs`; muda so o transporte. O stdio roda na
 * maquina de quem usa e por isso nao serve o navegador; este aqui fica atras do
 * Traefik, com TLS, e o claude.ai conecta na URL.
 *
 * MODO SEM SESSAO (`sessionIdGenerator: undefined`): cada requisicao monta seu
 * proprio servidor e transporte, e descarta no fim. Como as ferramentas sao de
 * leitura e nao guardam estado entre chamadas, nao ha o que preservar — e sem
 * sessao o servico escala em varias replicas sem precisar de sticky session.
 *
 * SEGURANCA — leia antes de expor:
 *
 * Este endpoint da acesso de leitura as conversas de um restaurante. Quem tem
 * a URL e o token le tudo. Por isso:
 *   - o token e obrigatorio: sem MCP_TOKEN o processo nem sobe;
 *   - a comparacao e timing-safe;
 *   - aceita o token no header `Authorization: Bearer` (preferido) ou no
 *     caminho `/mcp/<token>`, porque alguns clientes so aceitam uma URL.
 *     O caminho e o modo fraco: URL vaza em log de proxy e historico. Use o
 *     header quando o cliente permitir, e trate o token como senha.
 *
 * Configuracao:
 *   MAYA_API_URL   base do CRM, ex: https://crm.seudominio.com.br
 *   MAYA_API_KEY   chave de API do restaurante
 *   MCP_TOKEN      segredo que protege ESTE endpoint (openssl rand -hex 32)
 *   MCP_PORT       porta de escuta (padrao 8080)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { criarServidor } from './tools.mjs';

const BASE = process.env.MAYA_API_URL || '';
const KEY = process.env.MAYA_API_KEY || '';
const TOKEN = process.env.MCP_TOKEN || '';
const PORT = parseInt(process.env.MCP_PORT || '8080', 10) || 8080;

/** Corpo maior que isso e recusado: JSON-RPC de MCP nao chega perto disso. */
const MAX_CORPO = 1_000_000;

if (!BASE || !KEY) {
  console.error('[maya-mcp-http] Defina MAYA_API_URL e MAYA_API_KEY.');
  process.exit(1);
}
if (!TOKEN || TOKEN.length < 16) {
  // Falhar aqui e melhor que subir aberto: sem token, qualquer um que descobrir
  // a URL le as conversas do restaurante inteiro.
  console.error('[maya-mcp-http] Defina MCP_TOKEN com pelo menos 16 caracteres.');
  process.exit(1);
}

/** Comparacao sem vazar o tamanho nem a posicao do primeiro byte diferente. */
function tokenConfere(recebido) {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(TOKEN);
  // timingSafeEqual exige mesmo tamanho; o hash iguala sem revelar o original.
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Token do header Authorization ou do ultimo segmento do caminho. */
function extrairToken(req) {
  const auth = req.headers.authorization || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();

  const caminho = new URL(req.url, 'http://x').pathname;
  const m = caminho.match(/^\/mcp\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function responder(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > MAX_CORPO) throw new Error('corpo grande demais');
    partes.push(parte);
  }
  if (total === 0) return undefined;
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

const servidor = http.createServer(async (req, res) => {
  const caminho = new URL(req.url, 'http://x').pathname;

  // Sonda de saude: fora da autenticacao de proposito, pra o healthcheck do
  // Swarm nao precisar carregar o token. Nao revela nada.
  if (caminho === '/health') {
    return responder(res, 200, { ok: true });
  }

  if (!caminho.startsWith('/mcp')) {
    return responder(res, 404, { error: 'Nao encontrado' });
  }

  if (!tokenConfere(extrairToken(req))) {
    // Sem detalhe do motivo: dizer "token errado" x "token ausente" ajuda quem
    // esta tentando adivinhar.
    return responder(res, 401, { error: 'Nao autorizado' });
  }

  let corpo;
  try {
    corpo = await lerCorpo(req);
  } catch {
    return responder(res, 400, { error: 'Corpo invalido' });
  }

  // Um servidor e um transporte por requisicao (modo sem sessao). Fechar no
  // fim evita acumular listener a cada chamada.
  const server = criarServidor({ base: BASE, chave: KEY });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, corpo);
  } catch (erro) {
    console.error('[maya-mcp-http] Falha ao atender:', erro?.message);
    if (!res.headersSent) responder(res, 500, { error: 'Erro interno' });
  }
});

servidor.listen(PORT, () => {
  console.error(`[maya-mcp-http] ouvindo na porta ${PORT} (somente leitura)`);
});
