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

    // Build B2 key: media/<bucket>/<uuid>.<ext>
    const mimeType = file.type || 'application/octet-stream'
    const ext = MIME_TO_EXT[mimeType] || file.name.split('.').pop() || 'bin'
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
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 })
  }
}

