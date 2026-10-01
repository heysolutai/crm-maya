#!/usr/bin/env node
/**
 * MCP do CRM Maya por stdio — roda na maquina de quem usa.
 *
 * Serve Claude Code e o app de desktop. Para o claude.ai no navegador, use o
 * `http.mjs`, que expoe as mesmas ferramentas por HTTP.
 *
 * Configuracao (variaveis de ambiente):
 *   MAYA_API_URL   base da aplicacao, ex: https://crm.seudominio.com.br
 *   MAYA_API_KEY   chave de API do restaurante (Configuracoes > API)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { criarServidor } from './tools.mjs';

const BASE = process.env.MAYA_API_URL || '';
const KEY = process.env.MAYA_API_KEY || '';

if (!BASE || !KEY) {
  // stderr, nunca stdout: stdout e o canal do protocolo MCP.
  console.error('[maya-mcp] Defina MAYA_API_URL e MAYA_API_KEY antes de iniciar.');
  process.exit(1);
}

const server = criarServidor({ base: BASE, chave: KEY });
await server.connect(new StdioServerTransport());
console.error('[maya-mcp] pronto (stdio, somente leitura)');
