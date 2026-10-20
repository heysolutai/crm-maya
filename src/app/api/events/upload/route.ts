import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { handleApiError } from '@/lib/api/errors'
import { uploadToB2, MIME_TO_EXT } from '@/lib/storage'
import { requireEventAuth } from '../shared'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(req: NextRequest) {
  try {
    const a = await requireEventAuth(req, true)
    if (!a.ok) return a.response

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nenhuma foto enviada' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'A foto é grande demais (máximo 5 MB).' }, { status: 400 })
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Use fotos JPG, PNG ou WebP.' }, { status: 400 })
    }

    const ext = MIME_TO_EXT[file.type] || 'jpg'
    const key = `media/${a.companyId}/events/event_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
    const url = await uploadToB2(Buffer.from(await file.arrayBuffer()), key, file.type)
    return NextResponse.json({ url }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao enviar foto do evento')
  }
}
