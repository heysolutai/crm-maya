import { prisma } from '@/lib/db'
import { getNativeTool } from './native'

interface ChamadaParaRotular {
  toolName: string
  integrationId: string | null
}

/**
 * Nome amigavel de cada chamada de ferramenta (AiToolCall) pra tela: nativa
 * (codigo) ou IntegrationTool.label (catalogo global), e o nome do sistema
 * externo (Integration.name) pra explicar a falha. Duas consultas no maximo,
 * pra lista inteira.
 */
export async function rotulosDasChamadas(chamadas: ChamadaParaRotular[]) {
  const nomesIntegracao = [...new Set(chamadas.map((t) => t.toolName).filter((n) => !getNativeTool(n)))]
  const idsIntegracao = [...new Set(chamadas.map((t) => t.integrationId).filter((id): id is string => !!id))]
  const [ferramentas, integracoes] = await Promise.all([
    nomesIntegracao.length
      ? prisma.integrationTool.findMany({
          where: { name: { in: nomesIntegracao } },
          select: { name: true, label: true },
        })
      : Promise.resolve([]),
    idsIntegracao.length
      ? prisma.integration.findMany({ where: { id: { in: idsIntegracao } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])
  const labelPorNome = new Map(ferramentas.map((f) => [f.name, f.label]))
  const sistemaPorId = new Map(integracoes.map((i) => [i.id, i.name]))

  return {
    label: (t: ChamadaParaRotular): string =>
      getNativeTool(t.toolName)?.label ?? labelPorNome.get(t.toolName) ?? t.toolName,
    sistema: (t: ChamadaParaRotular): string | null =>
      t.integrationId ? sistemaPorId.get(t.integrationId) ?? null : null,
  }
}
