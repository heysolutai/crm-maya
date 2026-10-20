import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { executeTool } from '@/lib/ai-tools/executor'

/**
 * POST /api/ai-tools/{nome}  (x-api-key)
 * { conversation_id, arguments: {...} | "json", run_id? }
 *
 * Executa a ferramenta pedida pelo modelo. Responde SEMPRE 200 com
 * { ok, result }: `result` e o texto pra devolver ao modelo como saida da
 * ferramenta, inclusive quando deu errado (com instrucao do que fazer).
 * 4xx so pra chamada mal formada (bug do orquestrador, nao da IA).
 */

const bodySchema = z.object({
  conversation_id: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  arguments: z.union([z.record(z.string(), z.unknown()), z.string().max(20_000)]).optional(),
  run_id: z.string().trim().min(1).max(200).optional(),
  runId: z.string().trim().min(1).max(200).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const { name } = await params
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(name)) {
      return NextResponse.json({ error: 'Nome de ferramenta invalido' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const validation = bodySchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }
    const conversationId = validation.data.conversation_id ?? validation.data.conversationId
    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id obrigatorio' }, { status: 400 })
    }

    const result = await executeTool({
      companyId,
      conversationId,
      name,
      rawArgs: validation.data.arguments ?? {},
      runId: validation.data.run_id ?? validation.data.runId ?? null,
    })

    return NextResponse.json({ ok: result.ok, result: result.result, ...(result.repeated ? { repeated: true } : {}) })
  } catch (error) {
    return handleApiError(error, 'Erro ao executar ferramenta')
  }
}
