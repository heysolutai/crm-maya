import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { canonicalPhone } from '@/lib/api/utils'

/**
 * Recebe CSV de telefones (multipart/form-data com campo 'file') e atualiza
 * a audienceConfig da campanha como 'manual' com a lista parseada.
 *
 * Formato aceito do CSV:
 *   - Uma coluna so de telefone (com ou sem header)
 *   - 2 colunas: phone,name (com ou sem header) — name vira hint pra var {{nome}}
 *   - Separadores: virgula OU ponto-e-virgula
 *   - Quebra de linha: \r\n ou \n
 *
 * Limites:
 *   - Max 10MB
 *   - Max 50k linhas (proteger DB de createMany gigante)
 *
 * Nao popula recipients aqui — so atualiza audienceConfig. Pra materializar,
 * chame POST /api/campaigns/[id]/recipients depois.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_LINES = 50_000

interface CsvRow {
  phone: string
  name?: string
}

function detectSeparator(line: string): string {
  if (line.includes(';')) return ';'
  return ','
}

function parseCsv(text: string): { rows: CsvRow[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { rows: [], skipped: 0 }
  if (lines.length > MAX_LINES) {
    throw new Error(`CSV tem ${lines.length} linhas, limite e ${MAX_LINES}`)
  }

  const sep = detectSeparator(lines[0])

  // Detecta header: se a primeira linha NAO comecar com digito/+/(, eh header
  const firstCellRaw = lines[0].split(sep)[0]?.trim().replace(/^"|"$/g, '') || ''
  const hasHeader = !/^[\d+(]/.test(firstCellRaw)
  const dataLines = hasHeader ? lines.slice(1) : lines

  const rows: CsvRow[] = []
  let skipped = 0
  for (const raw of dataLines) {
    const cells = raw.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (cells.length === 0 || !cells[0]) {
      skipped++
      continue
    }
    const phone = canonicalPhone(cells[0])
    if (!phone || phone.length < 10 || phone.length > 15) {
      skipped++
      continue
    }
    const name = cells[1]?.trim() || undefined
    rows.push({ phone, name })
  }
  return { rows, skipped }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: auth.companyId },
      select: { id: true, status: true },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha nao encontrada' }, { status: 404 })
    }
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Nao da pra alterar audiencia com status "${campaign.status}"` },
        { status: 400 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Campo "file" obrigatorio (multipart)' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Arquivo passa do limite de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB` },
        { status: 400 }
      )
    }

    const text = await file.text()
    let parsed: { rows: CsvRow[]; skipped: number }
    try {
      parsed = parseCsv(text)
    } catch (parseErr) {
      return NextResponse.json(
        { error: (parseErr as Error).message || 'CSV invalido' },
        { status: 400 }
      )
    }

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum telefone valido no CSV', skipped: parsed.skipped },
        { status: 400 }
      )
    }

    // Dedup por canonical phone (mantem nome do primeiro encontrado)
    const map = new Map<string, CsvRow>()
    for (const r of parsed.rows) {
      if (!map.has(r.phone)) map.set(r.phone, r)
    }
    const uniqueRows = Array.from(map.values())

    // Atualiza audienceConfig pra modo 'manual' com a lista
    await prisma.campaign.update({
      where: { id },
      data: {
        audienceSource: 'manual',
        audienceConfig: {
          source: 'manual',
          phones: uniqueRows.map((r) => r.phone),
          // Mantemos os nomes parseados pra usar quando o cliente nao bater com
          // nenhum Client cadastrado (substitui {{nome}} no template do worker).
          // O endpoint /recipients precisa ler isso ao materializar — TODO.
          names: Object.fromEntries(uniqueRows.filter((r) => r.name).map((r) => [r.phone, r.name])),
        },
      },
    })

    return NextResponse.json({
      success: true,
      parsedRows: parsed.rows.length,
      uniqueRows: uniqueRows.length,
      skipped: parsed.skipped,
      sample: uniqueRows.slice(0, 5),
    })
  } catch (error) {
    console.error('Erro ao processar CSV:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
