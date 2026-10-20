import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { buildCapabilitiesPrompt, listCompanyTools, toFunctions } from '@/lib/ai-tools/registry'
import { ensureDefaultIntegrations } from '@/lib/ai-tools/seed'

/**
 * GET /api/ai-tools?conversation_id=  (x-api-key)
 *
 * Ferramentas LIGADAS pro restaurante, no formato de function calling da
 * OpenAI, mais o trecho de prompt com o que a IA pode fazer. O orquestrador
 * (Maestro, n8n) busca isto a cada conversa e passa pro modelo: um unico
 * assistente atende qualquer restaurante/segmento.
 */

const querySchema = z.object({
  conversation_id: z.string().uuid().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const parsed = querySchema.safeParse({
      conversation_id:
        req.nextUrl.searchParams.get('conversation_id') ?? req.nextUrl.searchParams.get('conversationId') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    if (parsed.data.conversation_id) {
      const conv = await prisma.conversation.findFirst({
        where: { id: parsed.data.conversation_id, companyId },
        select: { id: true },
      })
      if (!conv) return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
    }

    await ensureDefaultIntegrations()
    const tools = await listCompanyTools(companyId)
    return NextResponse.json({
      tools: toFunctions(tools),
      prompt: buildCapabilitiesPrompt(tools),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar ferramentas')
  }
}
