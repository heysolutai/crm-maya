import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

const SINGLETON_ID = 'singleton'

/** GET - Public: returns system branding settings */
export async function GET() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: SINGLETON_ID },
    })

    if (!settings) {
      // Return defaults if no row exists yet
      return NextResponse.json({
        systemName: 'Wyarp',
        logoUrl: null,
        faviconUrl: null,
        primaryColor: '150 80% 36%',
        secondaryColor: '170 70% 35%',
        accentColor: '175 60% 32%',
        loginDescription: null,
      })
    }

    return NextResponse.json({
      systemName: settings.systemName,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      accentColor: settings.accentColor,
      loginDescription: settings.loginDescription,
    })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/** PUT - Super-admin only: update system branding */
export async function PUT(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()

    const settings = await prisma.systemSettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        systemName: body.systemName ?? 'Wyarp',
        logoUrl: body.logoUrl ?? null,
        faviconUrl: body.faviconUrl ?? null,
        primaryColor: body.primaryColor ?? '150 80% 36%',
        secondaryColor: body.secondaryColor ?? '170 70% 35%',
        accentColor: body.accentColor ?? '175 60% 32%',
        loginDescription: body.loginDescription ?? null,
      },
      update: {
        ...(body.systemName !== undefined && { systemName: body.systemName }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
        ...(body.faviconUrl !== undefined && { faviconUrl: body.faviconUrl }),
        ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
        ...(body.secondaryColor !== undefined && { secondaryColor: body.secondaryColor }),
        ...(body.accentColor !== undefined && { accentColor: body.accentColor }),
        ...(body.loginDescription !== undefined && { loginDescription: body.loginDescription }),
      },
    })

    return NextResponse.json({
      systemName: settings.systemName,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      accentColor: settings.accentColor,
      loginDescription: settings.loginDescription,
    })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
