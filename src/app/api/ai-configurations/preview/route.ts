import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { buildCapabilitiesPrompt, listCompanyTools } from '@/lib/ai-tools/registry'
import { lerConfigMaestro } from '@/lib/maestro/config'
import { montarPartesDoPrompt } from '@/lib/maestro/prompt'

/**
 * "Ver o que a IA recebe" (Agente de IA › Prompt): o prompt do Maestro deste
 * agente, nas 4 partes, montado pelas MESMAS funcoes do atendimento (engine) e
 * do "Testar a IA". So leitura: nada e gravado.
 *
 * GET ?agentId=  -> { motor, partes: { agente, regras, ferramentas, contexto } }
 *
 * Quem ve: o administrador do restaurante e o super-admin, logados. Chave de
 * API nao (o n8n monta o proprio prompt). Nunca entram ids, telefones ou
 * chaves: o prompt do Maestro ja nao carrega nada disso.
 */

const querySchema = z.object({ agentId: z.string().uuid() })

async function podeVer(userId: string, companyId: string, isSuperAdmin: boolean): Promise<boolean> {
  if (isSuperAdmin) return true
  const papel = await prisma.userRole.findFirst({
    where: { userId, companyId, role: 'company_admin' },
    select: { id: true },
  })
  return !!papel
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!auth.agentId) return NextResponse.json({ error: 'Disponivel so para quem esta logado' }, { status: 403 })
    if (!(await podeVer(auth.agentId, auth.companyId, auth.isSuperAdmin === true))) {
      return NextResponse.json({ error: 'Apenas o administrador pode ver o prompt da IA' }, { status: 403 })
    }

    const validacao = querySchema.safeParse({ agentId: req.nextUrl.searchParams.get('agentId') })
    if (!validacao.success) return NextResponse.json({ error: 'Agente invalido' }, { status: 400 })

    // IDOR: o agente precisa ser do restaurante.
    const agente = await prisma.aiAgent.findFirst({
      where: { id: validacao.data.agentId, companyId: auth.companyId },
      select: { id: true, engine: true, prompts: true, behaviorSettings: true },
    })
    if (!agente) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    const [empresa, tools] = await Promise.all([
      prisma.company.findFirst({ where: { id: auth.companyId }, select: { name: true, tradeName: true } }),
      listCompanyTools(auth.companyId, { agentId: agente.id }),
    ])

    const config = lerConfigMaestro(agente)
    const partes = montarPartesDoPrompt({
      config,
      empresaNome: empresa?.tradeName || empresa?.name || '',
      clienteNome: 'Cliente',
      codigoConversa: null,
      capacidades: buildCapabilitiesPrompt(tools),
    })

    return NextResponse.json({
      motor: agente.engine === 'maestro' ? 'maestro' : 'n8n',
      // Sem texto salvo na aba Prompt: a parte 1 e o texto padrao do sistema.
      textoPadrao: !config.promptBase.trim(),
      partes,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao montar a previa do prompt')
  }
}
