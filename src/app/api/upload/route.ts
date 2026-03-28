import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads')
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

    // Sanitize bucket name
    const safeBucket = bucket.replace(/[^a-zA-Z0-9-_]/g, '')
    const dir = join(UPLOAD_DIR, safeBucket)
    await mkdir(dir, { recursive: true })

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'bin'
    const filename = `${randomUUID()}.${ext}`
    const filepath = join(dir, filename)

    // Write file
    const bytes = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))

    // Return public URL path
    const publicPath = `/uploads/${safeBucket}/${filename}`

    return NextResponse.json({
      path: publicPath,
      url: publicPath,
      filename,
      size: file.size,
      contentType: file.type,
    })
  } catch (error: any) {
    console.error('[Upload] Error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
