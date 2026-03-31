import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Optimized: count distinct conversations with unread messages (not messages themselves)
    // This uses the conversation.companyId index directly
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000)

    const result = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM messages m
       INNER JOIN conversations c ON c.id = m.conversation_id
       WHERE c.company_id = $1
       AND m.sender_type = 'client'
       AND m.is_read = false
       AND m.created_at >= $2`,
      companyId,
      cutoffDate
    )

    const count = Number(result[0]?.count ?? 0)

    return NextResponse.json({ count })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
