import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { invalidateSystemSettingsCache, KNOWN_SETTINGS } from '@/lib/system-settings'
import { z } from 'zod'

const upsertSchema = z.object({
  settings: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string().nullable().optional(),
    })
  ),
})

function maskSecret(value: string | null | undefined, isSecret: boolean): string | null {
  if (!value) return null
  if (!isSecret) return value
  if (value.length <= 8) return '••••••'
  return `••••${value.slice(-4)}`
}

/**
 * GET /api/admin/system-settings
 *   Lista todas as settings conhecidas (com mascara em chaves marcadas como secret).
 *   Inclui chaves que ainda nao foram salvas no banco — retorna value: null.
 */
export async function GET(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
    }

    const rows = await prisma.systemSetting.findMany()
    const byKey = new Map(rows.map((r) => [r.key, r]))

    const result = KNOWN_SETTINGS.map((meta) => {
      const row = byKey.get(meta.key)
      return {
        key: meta.key,
        label: meta.label,
        description: meta.description,
        is_secret: meta.isSecret,
        placeholder: meta.placeholder,
        value: maskSecret(row?.value, meta.isSecret),
        has_value: !!(row?.value && row.value.trim() !== ''),
        updated_at: row?.updatedAt || null,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error, 'Erro ao listar settings')
  }
}

/**
 * PUT /api/admin/system-settings
 *   Body: { settings: [{ key, value }] }
 *   Faz upsert de cada item. Limpa cache em memoria pra mudancas terem efeito imediato.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
    }

    const body = await req.json()
    const validation = upsertSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const knownKeys = new Set(KNOWN_SETTINGS.map((s) => s.key))
    const updatedBy = auth.agentId || null

    for (const item of validation.data.settings) {
      if (!knownKeys.has(item.key)) {
        // Ignora chave desconhecida em silencio — evita sujeira na tabela
        continue
      }
      const meta = KNOWN_SETTINGS.find((s) => s.key === item.key)!
      // Trim — null/undefined/vazio salva null pra acionar fallback de env
      const newValue = item.value && item.value.trim() !== '' ? item.value.trim() : null

      await prisma.systemSetting.upsert({
        where: { key: item.key },
        create: {
          key: item.key,
          value: newValue,
          description: meta.description,
          isSecret: meta.isSecret,
          updatedBy,
        },
        update: {
          value: newValue,
          updatedBy,
        },
      })
    }

    invalidateSystemSettingsCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao salvar settings')
  }
}
