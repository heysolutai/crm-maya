import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import type { AuthResult } from '@/lib/api/types'

export const UUID = z.string().uuid()

const httpsUrl = z
  .string()
  .max(1000)
  .refine((u) => {
    try {
      return new URL(u).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Foto invalida')

export const eventBodySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do evento').max(200),
  description: z.string().trim().max(4000).nullish(),
  priceInfo: z.string().trim().max(500).nullish(),
  /** yyyy-MM-dd */
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .or(z.literal('')),
  capacity: z.number().int().min(1).max(100000).nullish(),
  isActive: z.boolean().optional(),
  imageUrls: z.array(httpsUrl).max(8).optional(),
  extraFields: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
})

export type EventBody = z.infer<typeof eventBodySchema>

/** Meio-dia UTC: a data nao muda de dia em nenhum fuso do Brasil. */
export function parseEventDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(`${value}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export const eventSelect = {
  id: true,
  name: true,
  description: true,
  priceInfo: true,
  eventDate: true,
  imageUrls: true,
  extraFields: true,
  capacity: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
} as const

/** Inscritos confirmados e total de pessoas por evento (da empresa). */
export async function registrationTotals(
  companyId: string,
  eventIds: string[]
): Promise<Map<string, { registrations: number; guests: number }>> {
  const map = new Map<string, { registrations: number; guests: number }>()
  if (eventIds.length === 0) return map
  const rows = await prisma.eventRegistration.findMany({
    where: { companyId, eventId: { in: eventIds }, status: 'confirmed' },
    select: { eventId: true, guests: true },
  })
  for (const r of rows) {
    const cur = map.get(r.eventId) ?? { registrations: 0, guests: 0 }
    cur.registrations += 1
    cur.guests += r.guests ?? 1
    map.set(r.eventId, cur)
  }
  return map
}

export type EventAuth =
  | { ok: true; auth: AuthResult; companyId: string }
  | { ok: false; response: NextResponse }

/** Autentica; com `adminOnly` exige administrador do restaurante. */
export async function requireEventAuth(req: Request, adminOnly: boolean): Promise<EventAuth> {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return { ok: false, response: NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 }) }
  }
  if (adminOnly && !(await isCompanyAdmin(auth))) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Apenas o administrador pode fazer isso' }, { status: 403 }),
    }
  }
  return { ok: true, auth, companyId: auth.companyId }
}
