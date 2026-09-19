import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type EmailJob } from '../queues'
import { enviarEmail } from '@/lib/email/transport'
import { emailConfigurado } from '@/lib/email/config'

/**
 * Worker de envio de e-mail.
 *
 * O destinatario aparece no log pra dar pra rastrear entrega; assunto, corpo e
 * qualquer link com token NAO, porque o link de recuperar senha da acesso a
 * conta de quem receber.
 */
async function processEmail(job: Job<EmailJob>) {
  const { para, assunto, html, texto, tipo } = job.data
  const destinatarios = Array.isArray(para) ? para : [para]

  if (!emailConfigurado()) {
    // Erro mesmo, nao um "pulei": sem isso um convite sumiria em silencio e
    // ninguem descobriria que o SMTP nunca foi preenchido.
    throw new Error('SMTP nao configurado: defina SMTP_HOST e SMTP_FROM')
  }

  console.log(
    `[Email Worker] Enviando ${tipo || 'e-mail'} para ${destinatarios.length} destinatario(s) ` +
    `(job ${job.id}, tentativa ${job.attemptsMade + 1})`
  )

  await enviarEmail({ para: destinatarios, assunto, html, texto })

  console.log(`[Email Worker] Enviado: ${tipo || 'e-mail'} (job ${job.id})`)
  return { enviados: destinatarios.length }
}

let worker: Worker<EmailJob> | null = null

export function startEmailWorker() {
  if (worker) return worker

  worker = new Worker<EmailJob>(QUEUE_NAMES.EMAIL, processEmail, {
    connection: getRedisConnection(),
    // Baixa de proposito: servidor SMTP costuma limitar conexoes simultaneas.
    concurrency: 2,
  })

  worker.on('failed', (job, err) => {
    console.error(`[Email Worker] Job ${job?.id} (${job?.data?.tipo || 'e-mail'}) falhou:`, err.message)
  })

  if (!emailConfigurado()) {
    console.warn('[Email Worker] SMTP nao configurado: os e-mails vao falhar ate SMTP_HOST/SMTP_FROM serem definidos')
  }

  console.log('[Email Worker] Worker iniciado')
  return worker
}

export async function stopEmailWorker() {
  if (worker) {
    await worker.close()
    worker = null
  }
}
