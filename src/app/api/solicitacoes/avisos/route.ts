import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { MAX_NUMEROS_TESTE } from '@/lib/ai/so-um-numero'
import { TEMPLATE_SUGERIDO, limparCacheEquipe } from '@/lib/solicitacoes/avisos'

/**
 * Aviso no WhatsApp da equipe, por funil (CRM > Regras). So o admin.
 *   GET ?funil=  -> configuracao + conexoes que podem enviar
 *   PUT          -> salvar
 */

const funilSchema = z.enum(['eventos', 'atendimento'])

const salvarSchema = z.object({
  funil: funilSchema,
  enabled: z.boolean(),
  inboxId: z.string().uuid().nullable(),
  phones: z
    .array(z.string().max(30))
    .max(MAX_NUMEROS_TESTE)
    .transform((ns) => [...new Set(ns.map((n) => n.replace(/\D/g, '')).filter(Boolean))])
    .refine((ns) => ns.every((n) => n.length >= 10 && n.length <= 13), 'Telefone inválido: use DDD + número'),
  templateName: z
    .string()
    .trim()
    .max(512)
    .regex(/^[a-z0-9_]*$/, 'Nome do template: só letras minúsculas, números e _')
    .nullable()
    .optional(),
  templateLanguage: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Idioma inválido (ex.: pt_BR)').default('pt_BR'),
})

async function exigirAdmin(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) return { erro: NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 }) }
  if (!(await isCompanyAdmin(auth))) {
    return { erro: NextResponse.json({ error: 'Apenas o administrador do restaurante pode mudar os avisos' }, { status: 403 }) }
  }
  return { companyId: auth.companyId }
}

async function conexoes(companyId: string) {
  const inboxes = await prisma.inbox.findMany({
    where: { companyId, isActive: true, channelType: { not: 'espelho' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, displayName: true, instanceName: true, channelType: true, status: true, phoneNumber: true },
  })
  return inboxes.map((i) => ({
    id: i.id,
    nome: i.displayName || i.instanceName,
    oficial: i.channelType === 'whatsapp_cloud',
    conectada: (i.status || '').toLowerCase() === 'connected' || i.channelType === 'whatsapp_cloud',
    telefone: i.phoneNumber,
  }))
}

export async function GET(req: NextRequest) {
  try {
    const r = await exigirAdmin(req)
    if ('erro' in r) return r.erro
    const funil = funilSchema.safeParse(req.nextUrl.searchParams.get('funil'))
    if (!funil.success) return NextResponse.json({ error: 'Funil invalido' }, { status: 400 })

    const [config, lista] = await Promise.all([
      prisma.handoffNotify.findUnique({ where: { companyId_funnel: { companyId: r.companyId, funnel: funil.data } } }),
      conexoes(r.companyId),
    ])
    return NextResponse.json({
      funil: funil.data,
      enabled: config?.enabled ?? false,
      inboxId: config?.inboxId ?? null,
      phones: config?.phones ?? [],
      templateName: config?.templateName ?? null,
      templateLanguage: config?.templateLanguage ?? 'pt_BR',
      conexoes: lista,
      templateSugerido: TEMPLATE_SUGERIDO,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao carregar os avisos')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const r = await exigirAdmin(req)
    if ('erro' in r) return r.erro
    const parsed = salvarSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const d = parsed.data

    // IDOR: a conexao vem do body, tem que ser deste restaurante (e nao espelho).
    if (d.inboxId) {
      const inbox = await prisma.inbox.findFirst({
        where: { id: d.inboxId, companyId: r.companyId, channelType: { not: 'espelho' } },
        select: { id: true },
      })
      if (!inbox) return NextResponse.json({ error: 'Conexão inválida' }, { status: 400 })
    }
    if (d.enabled && !d.phones.length) {
      return NextResponse.json({ error: 'Adicione pelo menos um número para receber os avisos' }, { status: 400 })
    }

    const dados = {
      enabled: d.enabled,
      inboxId: d.inboxId,
      phones: d.phones,
      templateName: d.templateName || null,
      templateLanguage: d.templateLanguage,
    }
    const salvo = await prisma.handoffNotify.upsert({
      where: { companyId_funnel: { companyId: r.companyId, funnel: d.funil } },
      create: { companyId: r.companyId, funnel: d.funil, ...dados },
      update: dados,
    })
    // Os numeros da equipe mudaram: a IA passa a ignorar os novos ja.
    limparCacheEquipe(r.companyId)
    return NextResponse.json({
      funil: salvo.funnel,
      enabled: salvo.enabled,
      inboxId: salvo.inboxId,
      phones: salvo.phones,
      templateName: salvo.templateName,
      templateLanguage: salvo.templateLanguage,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao salvar os avisos')
  }
}
