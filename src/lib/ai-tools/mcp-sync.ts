import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { mcpListarFerramentas, type McpTool } from './mcp'
import { NATIVE_TOOL_NAMES } from './native'
import { decryptHeaders } from './secrets'
import { renderText, type TemplateVars } from './template'

/**
 * Traz as ferramentas de um servidor MCP (tools/list) pra uma integracao
 * kind='mcp' (do catalogo ou privada de um restaurante):
 *   - nova: cria (nome unico pra IA, descricao e JSON Schema do servidor);
 *   - ja existia: atualiza descricao e schema, mantendo o nome que o
 *     restaurante ve e o "muda dados" ajustado a mao (salvo se o servidor
 *     informar explicitamente);
 *   - sumiu do servidor: desativa (nao apaga).
 * Erro de conexao sobe cru (IntegrationHttpError / ErroRpcMcp): quem chama traduz.
 */

export interface ResumoSyncMcp {
  total: number
  novas: number
  atualizadas: number
  desativadas: number
}

const MAX_NOME = 64

function limpar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/** "reservemaya" + "check_availability" -> "reservemaya_check_availability" (unico no sistema). */
function nomeUnico(slug: string, ferramenta: string, ocupados: Set<string>): string {
  const base = `${limpar(slug)}_${limpar(ferramenta)}`.slice(0, MAX_NOME - 3).replace(/_$/, '') || 'mcp_ferramenta'
  let nome = base
  for (let i = 2; ocupados.has(nome); i++) nome = `${base}_${i}`
  ocupados.add(nome)
  return nome
}

function rotulo(t: McpTool): string {
  const texto = (t.annotations?.title || t.title || t.name.replace(/[_-]+/g, ' ')).trim()
  return (texto.charAt(0).toUpperCase() + texto.slice(1)).slice(0, 120)
}

/** Nome que indica so leitura (quando o servidor nao diz). */
const SO_LE = /^(get|list|read|search|find|fetch|check|lookup|query|ask|show|view|describe|consultar|listar|buscar|ver|verificar|obter|pesquisar)/i

/**
 * "Muda dados" pede confirmacao do cliente antes de chamar. Vale a dica do
 * servidor (readOnlyHint/destructiveHint); sem dica, o nome decide.
 */
function mudaDados(t: McpTool): boolean {
  if (t.annotations?.readOnlyHint === true) return false
  if (t.annotations?.readOnlyHint === false || t.annotations?.destructiveHint === true) return true
  return !SO_LE.test(t.name)
}

/** O servidor disse explicitamente se muda dados? Senao, mantem o que foi ajustado a mao. */
function servidorInformou(t: McpTool): boolean {
  return t.annotations?.readOnlyHint !== undefined || t.annotations?.destructiveHint !== undefined
}

/** Cabecalhos pra conectar (variaveis de restaurante: as do contexto, ou vazias). */
export function cabecalhosMcp(headers: unknown, vars: TemplateVars = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(decryptHeaders(headers))) out[k] = renderText(v, vars)
  return out
}

export async function sincronizarMcp(integrationId: string): Promise<ResumoSyncMcp> {
  const integracao = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { id: true, slug: true, kind: true, baseUrl: true, headers: true },
  })
  if (!integracao || integracao.kind !== 'mcp') throw new Error('integracao MCP nao encontrada')

  const ferramentas = await mcpListarFerramentas(integracao.baseUrl, cabecalhosMcp(integracao.headers))

  const [existentes, todosNomes] = await Promise.all([
    prisma.integrationTool.findMany({ where: { integrationId }, select: { id: true, path: true } }),
    prisma.integrationTool.findMany({ select: { name: true } }),
  ])
  const porNomeNoServidor = new Map(existentes.map((t) => [t.path, t]))
  const ocupados = new Set<string>([...todosNomes.map((t) => t.name), ...NATIVE_TOOL_NAMES])
  const noServidor = new Set(ferramentas.map((t) => t.name))

  let novas = 0
  let atualizadas = 0
  await prisma.$transaction(async (tx) => {
    for (const [ordem, t] of ferramentas.entries()) {
      const descricao = (t.description || rotulo(t)).slice(0, 4000)
      const schema = t.inputSchema as Prisma.InputJsonValue
      const atual = porNomeNoServidor.get(t.name)
      if (atual) {
        await tx.integrationTool.update({
          where: { id: atual.id },
          // isActive: true -> voltou pro servidor depois de ter sumido.
          data: {
            aiDescription: descricao,
            inputSchema: schema,
            sortOrder: ordem,
            isActive: true,
            ...(servidorInformou(t) ? { isWrite: mudaDados(t) } : {}),
          },
        })
        atualizadas++
      } else {
        await tx.integrationTool.create({
          data: {
            integrationId,
            name: nomeUnico(integracao.slug, t.name, ocupados),
            label: rotulo(t),
            aiDescription: descricao,
            promptHint: null,
            parameters: [],
            method: 'MCP',
            path: t.name,
            bodyTemplate: Prisma.DbNull,
            responseTemplate: null,
            postActions: [],
            inputSchema: schema,
            isWrite: mudaDados(t),
            isActive: true,
            sortOrder: ordem,
          },
        })
        novas++
      }
    }
  })

  const sumiram = existentes.filter((t) => !noServidor.has(t.path)).map((t) => t.id)
  const desativadas = sumiram.length
    ? (await prisma.integrationTool.updateMany({ where: { id: { in: sumiram } }, data: { isActive: false } })).count
    : 0

  return { total: ferramentas.length, novas, atualizadas, desativadas }
}
