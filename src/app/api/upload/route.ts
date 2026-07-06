import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { uploadToB2, MIME_TO_EXT } from '@/lib/storage'
import { randomUUID } from 'crypto'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const bucket = (formData.get('bucket') as string) || 'media'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
    }

    // Allowlist de tipos no SERVIDOR (nao confia so no cliente) — bloqueia
    // HTML/SVG/executaveis subindo pro bucket publico.
    const mimeType = file.type || 'application/octet-stream'
    const ALLOWED_MIME = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/aac',
      'video/mp4', 'video/webm',
      'application/pdf', 'text/csv', 'application/json', 'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ])
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json({ error: 'Tipo de arquivo nao suportado' }, { status: 400 })
    }

    // Build B2 key: media/<bucket>/<uuid>.<ext> — ext sanitizada (sem barra/ponto).
    const ext = (MIME_TO_EXT[mimeType] || file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
    const safeBucket = bucket.replace(/[^a-zA-Z0-9-_]/g, '')
    const key = `media/${safeBucket}/${randomUUID()}.${ext}`

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const publicUrl = await uploadToB2(buffer, key, mimeType)

    return NextResponse.json({
      path: publicUrl,
      url: publicUrl,
      key,
      filename: `${randomUUID()}.${ext}`,
      size: file.size,
      contentType: mimeType,
    })
  } catch (error: any) {
    console.error('[Upload] Error:', error)
    return NextResponse.json({ error: 'Erro ao subir arquivo' }, { status: 500 })
  }
}

