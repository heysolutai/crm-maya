import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticate } from '@/lib/api/auth'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { handleApiError } from '@/lib/api/errors'
import { ErroModelo } from '@/lib/maestro/llm'
import { ErroPlayground, prontidaoPlayground, simularTurno } from '@/lib/maestro/playground'

/**
 * "Testar a IA" (Maestro), so administrador do restaurante (gasta credito da
 * OpenAI). Nao precisa de numero de WhatsApp.
 *
 * GET  ?agentId=&inboxId=  -> da pra testar? (falta chave, ferramentas ligadas...)
 * POST { agentId, inboxId?, messages } -> resposta da IA + ferramentas usadas
 *
 * Roda o mesmo prompt, modelo e ferramentas do atendimento real. As
 * ferramentas do restaurante rodam DE VERDADE (reservar no Reserve Maya,
 * inscrever em evento), com o "cliente do teste"; so o que depende de uma
 * conversa real (transferir, encaminhar, anotar no CRM) e simulado. Nada e
 * enviado por WhatsApp. Ver src/lib/maestro/playground.ts.
 */

const bodySchema = z.object({
  agentId: z.string().uuid(),
  inboxId: z.string().uuid().optional(),
  /** Cliente do teste: vai pro sistema externo (ex.: nome/telefone da reserva). */
  cliente: z
    .object({
      nome: z.string().trim().max(80).optional(),
      telefone: z
        .string()
        .trim()
        .max(25)
        .refine((t) => !t || /^\d{10,15}$/.test(t.replace(/\D/g, '')), 'Telefone com DDD (10 a 15 números)')
        .optional(),
    })
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
})

const querySchema = z.object({
  agentId: z.string().uuid(),
  inboxId: z.string().uuid().optional(),
})

/** Erro do modelo -> mensagem em portugues pra quem esta testando (sem detalhe interno). */
function erroDoModelo(err: ErroModelo): { error: string; status: number } {
  switch (err.codigo) {
    case 'sem_chave':
      return {
        error: 'A IA ainda não tem acesso liberado: falta a chave da OpenAI. Cadastre em "Agente de IA" > "Provedores" ou peça ao suporte.',
        status: 422,
      }
    case 'chave_recusada':
      return {
        error: 'A OpenAI recusou a chave cadastrada. Confira a chave em "Agente de IA" > "Provedores" ou peça ao suporte.',
        status: 502,
      }
    case 'sem_saldo':
      return { error: 'A conta da OpenAI está sem saldo ou atingiu o limite de uso. Fale com o suporte.', status: 502 }
    case 'tempo':
    case 'rede':
      return { error: 'A OpenAI demorou demais para responder. Tente de novo.', status: 504 }
    default:
      return { error: 'A OpenAI não conseguiu responder agora. Tente de novo em instantes.', status: 502 }
  }
}

async function exigirAdmin(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return { erro: NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 }) } as const
  }
  if (!(await isCompanyAdmin(auth))) {
    return {
      erro: NextResponse.json({ error: 'Só o administrador do restaurante pode testar a IA.' }, { status: 403 }),
    } as const
  }
  return { auth, companyId: auth.companyId } as const
}

export async function GET(req: NextRequest) {
  const acesso = await exigirAdmin(req)
  if ('erro' in acesso) return acesso.erro

  try {
    const parsed = querySchema.safeParse({
      agentId: req.nextUrl.searchParams.get('agentId'),
      inboxId: req.nextUrl.searchParams.get('inboxId') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    return NextResponse.json(
      await prontidaoPlayground({
        companyId: acesso.companyId,
        ...parsed.data,
        superAdmin: acesso.auth.isSuperAdmin === true,
      })
    )
  } catch (error) {
    if (error instanceof ErroPlayground) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return handleApiError(error, '[maestro/playground] erro ao verificar o teste')
  }
}

export async function POST(req: NextRequest) {
  const acesso = await exigirAdmin(req)
  if ('erro' in acesso) return acesso.erro

  try {
    const body: unknown = await req.json().catch(() => null)
    const validacao = bodySchema.safeParse(body)
    if (!validacao.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validacao.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const resultado = await simularTurno({
      companyId: acesso.companyId,
      agentId: validacao.data.agentId,
      inboxId: validacao.data.inboxId,
      messages: validacao.data.messages,
      cliente: validacao.data.cliente ?? null,
      superAdmin: acesso.auth.isSuperAdmin === true,
    })
    return NextResponse.json(resultado)
  } catch (error) {
    if (error instanceof ErroPlayground) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof ErroModelo) {
      console.error('[maestro/playground] modelo falhou:', error.message)
      const { error: msg, status } = erroDoModelo(error)
      return NextResponse.json({ error: msg }, { status })
    }
    return handleApiError(error, '[maestro/playground] erro ao simular')
  }
}
