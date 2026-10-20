import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type MaestroTurnJob } from '../queues'
import { processarTurno } from '@/lib/maestro/engine'

/**
 * Worker do Maestro: um job = um turno numa conversa. A logica mora no
 * engine (src/lib/maestro/engine.ts); aqui so o encaixe na fila.
 *
 * Concorrencia 10: cada turno passa a maior parte do tempo esperando o modelo,
 * entao da pra atender varias conversas ao mesmo tempo. Duas da MESMA conversa
 * nunca rodam juntas: o engine segura um lock por conversa.
 */

let worker: Worker<MaestroTurnJob> | null = null

async function processar(job: Job<MaestroTurnJob>) {
  const { companyId, conversationId } = job.data
  const r = await processarTurno({ companyId, conversationId })
  // Nunca loga texto de cliente nem da IA: so o desfecho.
  console.log(
    `[Maestro Worker] conversa ${conversationId}: ${r.status}` +
      ` (${r.chamadas} ferramenta(s), ${r.latenciaMs}ms)` +
      (r.motivo ? `: ${r.motivo}` : '')
  )
  return { status: r.status, motivo: r.motivo }
}

export function startMaestroTurnWorker() {
  if (worker) return worker

  worker = new Worker<MaestroTurnJob>(QUEUE_NAMES.MAESTRO_TURN, processar, {
    connection: getRedisConnection(),
    concurrency: 10,
  })

  worker.on('failed', (job, err) => {
    console.error(`[Maestro Worker] job ${job?.id} falhou:`, err.message)
  })

  console.log('[Maestro Worker] Started')
  return worker
}

export async function stopMaestroTurnWorker() {
  if (worker) {
    await worker.close()
    worker = null
  }
}
