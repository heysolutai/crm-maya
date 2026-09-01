import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Configuracoes do fluxo de avaliacao da empresa (1:1).
 * Links externos (Google/TripAdvisor), prompts que a IA usa pra pedir a
 * avaliacao e a saudacao inicial.
 */

// Nota: `enabled` (ativar o modulo) NAO entra aqui — quem controla e o
// super-admin (/api/admin/review-module). A empresa so edita o conteudo.
const updateSchema = z.object({
  dispatchHour: z.number().int().min(0).max(23).optional(),
  // Inbox do disparo. Null = todas as conexoes ativas.
  inboxId: z.string().uuid().nullable().optional(),
  googleUrl: z.string().url().max(2000).or(z.literal('')).nullable().optional(),
  tripadvisorUrl: z.string().url().max(2000).or(z.literal('')).nullable().optional(),
  prompt1: z.string().max(4000).nullable().optional(),
  prompt2: z.string().max(4000).nullable().optional(),
  promptFinal: z.string().max(4000).nullable().optional(),
  greeting: z.string().max(2000).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const settings = await prisma.reviewSettings.findUnique({
      where: { companyId: auth.companyId },
    })

    // Sem registro ainda? Devolve o "vazio" pra tela renderizar os campos.
    return NextResponse.json(
      settings ?? {
        companyId: auth.companyId,
        enabled: false,
        dispatchHour: 9,
        inboxId: null,
        googleUrl: '',
        tripadvisorUrl: '',
        prompt1: '',
        prompt2: '',
        promptFinal: '',
        greeting: '',
      }
    )
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar configuracoes de avaliacao')
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }
  const companyId = auth.companyId

  try {
    const body = await req.json()
    const validation = updateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // IDOR: inbox escolhida precisa ser da empresa (e ativa).
    if (validation.data.inboxId) {
      const inbox = await prisma.inbox.findFirst({
        where: { id: validation.data.inboxId, companyId, isActive: true },
        select: { id: true },
      })
      if (!inbox) {
        return NextResponse.json({ error: 'Conexao invalida' }, { status: 400 })
      }
    }

    // Normaliza: string vazia vira null pra nao guardar lixo.
    const clean = <T,>(v: T | null | undefined) =>
      typeof v === 'string' && v.trim() === '' ? null : v ?? undefined

    const data = {
      dispatchHour: validation.data.dispatchHour,
      inboxId: validation.data.inboxId,
      googleUrl: clean(validation.data.googleUrl),
      tripadvisorUrl: clean(validation.data.tripadvisorUrl),
      prompt1: clean(validation.data.prompt1),
      prompt2: clean(validation.data.prompt2),
      promptFinal: clean(validation.data.promptFinal),
      greeting: clean(validation.data.greeting),
    }

    // Upsert por companyId (1:1). IDOR-safe: a chave e sempre a company do auth.
    const settings = await prisma.reviewSettings.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    })

    return NextResponse.json(settings)
  } catch (error) {
    return handleApiError(error, 'Erro ao salvar configuracoes de avaliacao')
  }
}
