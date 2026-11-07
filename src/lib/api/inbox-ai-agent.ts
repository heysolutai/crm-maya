import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { normalizeCompanySlug, buildAgentMemoryKey } from '@/lib/api/utils'

/**
 * Garante que a inbox recem-criada tem um AiAgent DEDICADO (1:1).
 * Cada instancia conectada = seu proprio agente, nunca compartilhado: no
 * produto restaurante "conexao" e "agente" sao a mesma coisa. Por isso sempre
 * cria um agente novo (em branco) e vincula a esta inbox.
 *
 * `iaLigada: false` cria o agente com a chave "IA atendendo" desligada
 * (AiAgent.isActive): as mensagens chegam, mas a IA nao responde.
 */
export async function ensureInboxAiAgent(
  inboxId: string,
  companyId: string,
  displayName: string,
  opcoes: { iaLigada?: boolean } = {}
) {
  const inbox = await prisma.inbox.findUnique({
    where: { id: inboxId },
    select: { aiAgentId: true },
  })
  if (inbox?.aiAgentId) return

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
  const slug = normalizeCompanySlug(company?.name || displayName)

  const newAiAgentId = randomUUID()
  await prisma.aiAgent.create({
    data: {
      id: newAiAgentId,
      companyId,
      name: displayName,
      prompts: {} as Prisma.InputJsonValue,
      behaviorSettings: {} as Prisma.InputJsonValue,
      conditions: {} as Prisma.InputJsonValue,
      apiKeys: {} as Prisma.InputJsonValue,
      variables: {} as Prisma.InputJsonValue,
      knowledge: slug ? `know_${slug}` : null,
      memoryKey: buildAgentMemoryKey(newAiAgentId, displayName),
      productsKnowledge: slug ? `products_${slug}` : null,
      n8nWebhookUrl: null,
      followUpEnabled: false,
      followUpStages: [] as Prisma.InputJsonValue,
      isActive: opcoes.iaLigada ?? true,
    },
  })

  await prisma.inbox.update({
    where: { id: inboxId },
    data: { aiAgentId: newAiAgentId },
  })
}
