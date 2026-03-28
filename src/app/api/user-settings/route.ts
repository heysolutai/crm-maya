import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

/** GET user settings by userId query param */
export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    })
    return NextResponse.json(user?.settings || {})
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * PATCH - Merge-update user settings.
 * Body: { userId: string, settings: Record<string, any> }
 */
export async function PATCH(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { userId, settings } = body

    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const currentSettings = (user.settings as Record<string, any>) || {}
    const newSettings = { ...currentSettings, ...settings }

    await prisma.user.update({
      where: { id: userId },
      data: { settings: newSettings },
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
