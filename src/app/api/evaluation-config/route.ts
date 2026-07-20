import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateApiKeyFromHeader } from '@/lib/api/api-key-utils'
import { handleCors, jsonResponse, unauthorizedResponse, errorResponse } from '@/lib/api/cors'

/**
 * Config do agente de avaliacao (evaluation config).
 *
 * Endpoint EXTERNO (autenticado por x-api-key, nao por sessao) pra o n8n / a IA
 * puxar as configuracoes do fluxo de avaliacao da empresa: links de avaliacao
 * externa, os prompts e a saudacao inicial.
 *
 * Fonte: ReviewSettings (mesma tabela editada em /app/reviews > Configuracoes).
 * Retorno em snake_case pra facilitar o consumo no n8n.
 */

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApiKeyFromHeader(req)
    if (!auth) {
      return unauthorizedResponse('Chave de API invalida ou ausente')
    }

    const settings = await prisma.reviewSettings.findUnique({
      where: { companyId: auth.companyId },
    })

    // Sem registro ainda? Devolve tudo null — o fluxo decide o que fazer.
    return jsonResponse({
      company_id: auth.companyId,
      google_url: settings?.googleUrl ?? null,
      tripadvisor_url: settings?.tripadvisorUrl ?? null,
      prompt_1: settings?.prompt1 ?? null,
      prompt_2: settings?.prompt2 ?? null,
      greeting: settings?.greeting ?? null,
    })
  } catch (error) {
    // Nao vaza detalhes internos ao cliente.
    console.error('[evaluation-config] Erro:', error)
    return errorResponse('Erro interno do servidor', 500)
  }
}
