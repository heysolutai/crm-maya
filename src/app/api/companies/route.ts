import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

const updateCompanySchema = z.object({
  id: z.string().uuid('Invalid id format'),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  tradeName: z.string().optional().nullable(),
  email: z.string().email().or(z.literal('')).optional().nullable(),
  phone: z.string().optional().nullable(),
  documentNumber: z.string().optional().nullable(),
  address: z.any().optional().nullable(),
  settings: z.any().optional(),
  isActive: z.boolean().optional(),
  subscriptionStatus: z.enum(['trial', 'active', 'suspended', 'cancelled']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { isSuperAdmin, companyId: authCompanyId } = await authenticate(req)

    // Single company lookup by ID — usuario regular so pode ler a propria empresa
    const singleId = req.nextUrl.searchParams.get('id')
    if (singleId) {
      if (!isSuperAdmin && singleId !== authCompanyId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const company = await prisma.company.findUnique({ where: { id: singleId } })
      return NextResponse.json(company)
    }

    // List all companies (super admin only)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const waInstances = await prisma.inbox.findMany({
      select: { companyId: true, metadata: true },
    })

    const phoneMap: Record<string, string> = {}
    for (const inst of waInstances) {
      const phone = (inst.metadata as any)?.connected_phone
      if (phone && typeof phone === 'string' && phone.length >= 10) {
        phoneMap[inst.companyId] = phone
      }
    }

    const result = companies.map(c => ({
      ...c,
      whatsapp_phone: phoneMap[c.id] || null,
    }))

    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

export async function PUT(req: NextRequest) {
  try {
    const { isSuperAdmin, companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()
    const validation = updateCompanySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { id, ...updates } = validation.data

    // Usuario regular so pode atualizar a propria empresa
    if (!isSuperAdmin && id !== authCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Campos sensíveis (subscriptionStatus, isActive) só super-admin
    if (!isSuperAdmin) {
      delete (updates as any).subscriptionStatus
      delete (updates as any).isActive
    }

    const company = await prisma.company.update({ where: { id }, data: updates })
    return NextResponse.json(company)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

export async function DELETE(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Confere que existe antes de apagar, pra devolver 404 em vez de um erro
    // de banco quando o id nao bate.
    const existing = await prisma.company.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 404 })

    // Cascata pelo PROPRIO schema, nao por funcao SQL.
    //
    // Antes isto chamava `SELECT delete_company_cascade(id)` — uma funcao que
    // existia no Supabase e que o `prisma db push` nunca cria, porque push so
    // sincroniza tabelas e colunas. Em qualquer Postgres proprio a exclusao
    // quebrava com "function delete_company_cascade(uuid) does not exist".
    //
    // Nao ha o que reimplementar: as 28 relacoes que apontam pra Company ja
    // sao `onDelete: Cascade` no schema (a unica excecao e User, que e
    // SetNull de proposito — usuario sobrevive a empresa). O banco faz a
    // cascata sozinho.
    await prisma.company.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}
