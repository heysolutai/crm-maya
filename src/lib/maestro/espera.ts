import { prisma } from '@/lib/db'
import { N8N_DEBOUNCE_MS } from '@/lib/queue/queues'

/**
 * Quanto esperar antes de a IA responder, pra juntar mensagem picada do
 * cliente ("oi" / "queria reservar" / "pra sabado"). E a MESMA espera do
 * caminho do n8n (rota do webhook do WhatsApp): vem das Configuracoes de
 * avaliacao do restaurante (ReviewSettings.agruparSegundos); N8N_DEBOUNCE_MS e
 * so o padrao de quem nunca ajustou. Zero (ou menos) = o minimo de 1 s.
 */
export async function esperaAgrupamentoSegundos(companyId: string): Promise<number> {
  const ajuste = await prisma.reviewSettings
    .findUnique({ where: { companyId }, select: { agruparSegundos: true } })
    .catch(() => null)
  const segundos = ajuste?.agruparSegundos ?? Math.round(N8N_DEBOUNCE_MS / 1000)
  return Math.max(1, segundos)
}
