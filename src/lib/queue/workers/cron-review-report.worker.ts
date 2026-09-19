import { Worker, Queue } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CronTickJob, enqueueEmail } from '../queues'
import { prisma } from '@/lib/db'
import { agrupar, separarComentarios } from '@/lib/reviews/temas'
import { emailRelatorioAvaliacoes } from '@/lib/email/templates'
import { emailConfigurado, urlDaAplicacao } from '@/lib/email/config'

/**
 * Relatorio semanal de avaliacoes por e-mail.
 *
 * Roda segunda de manha e manda, pra cada restaurante que ativou, o resumo da
 * semana que acabou de fechar: quantas avaliacoes, nota media e os temas mais
 * elogiados e mais reclamados — os mesmos da tela de Avaliacoes, pra nao haver
 * duas contas diferentes da mesma semana.
 *
 * So recebe quem ligou (`ReviewSettings.relatorioSemanal`). Ninguem passa a
 * receber e-mail por causa de um deploy.
 */

const REPORT_TZ = process.env.REVIEW_DISPATCH_TZ || 'America/Sao_Paulo'

/** Meia-noite de hoje no fuso de Brasilia. */
function inicioDoDiaBrt(agora: Date): Date {
  const dia = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return new Date(`${dia}T00:00:00-03:00`)
}

function dataCurta(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: REPORT_TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function enviarRelatorios() {
  const agora = new Date()

  if (!emailConfigurado()) {
    console.warn('[Cron Relatorio] SMTP nao configurado: nada a enviar')
    return { enviados: 0, semDestinatario: 0, falhas: 0 }
  }

  const ativos = await prisma.reviewSettings.findMany({
    where: { relatorioSemanal: true },
    select: { companyId: true, relatorioEmails: true },
  })

  if (ativos.length === 0) {
    return { enviados: 0, semDestinatario: 0, falhas: 0 }
  }

  // Semana fechada: da meia-noite de 7 dias atras ate a meia-noite de hoje.
  // O dia corrente fica de fora de proposito, senao o numero mudaria dependendo
  // da hora em que a cron rodasse.
  const fim = inicioDoDiaBrt(agora)
  const inicio = new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000)
  const periodo = `${dataCurta(inicio)} a ${dataCurta(new Date(fim.getTime() - 1))}`

  console.log(`[Cron Relatorio] ${ativos.length} restaurante(s) ativo(s) | periodo ${periodo}`)

  let enviados = 0
  let semDestinatario = 0
  let falhas = 0

  for (const { companyId, relatorioEmails } of ativos) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, email: true, isActive: true },
      })
      if (!company || !company.isActive) continue

      // Lista propria primeiro; sem ela, o e-mail cadastrado do restaurante.
      const destinatarios = (relatorioEmails.length > 0 ? relatorioEmails : [company.email])
        .filter((e): e is string => Boolean(e && e.trim()))
        .map((e) => e.trim())

      if (destinatarios.length === 0) {
        semDestinatario++
        console.warn(`[Cron Relatorio] Restaurante ${companyId} sem destinatario: pulado`)
        continue
      }

      const avaliacoes = await prisma.review.findMany({
        where: { companyId, createdAt: { gte: inicio, lt: fim } },
        take: 2000,
        select: { sentiment: true, rating: true, comment: true },
      })

      const { elogios, reclamacoes } = separarComentarios(avaliacoes)
      const media =
        avaliacoes.length > 0
          ? avaliacoes.reduce((soma, a) => soma + a.rating, 0) / avaliacoes.length
          : null

      const montado = emailRelatorioAvaliacoes({
        restaurante: company.name,
        periodo,
        total: avaliacoes.length,
        media,
        positivas: avaliacoes.filter((a) => a.sentiment === 'positivo').length,
        neutras: avaliacoes.filter((a) => a.sentiment === 'neutro').length,
        negativas: avaliacoes.filter((a) => a.sentiment === 'negativo').length,
        elogios: agrupar(elogios),
        reclamacoes: agrupar(reclamacoes),
        link: `${urlDaAplicacao()}/app/reviews`,
      })

      await enqueueEmail({
        para: destinatarios,
        assunto: montado.assunto,
        html: montado.html,
        texto: montado.texto,
        tipo: 'relatorio',
      })

      enviados++
    } catch (erro) {
      falhas++
      console.error(`[Cron Relatorio] Falha no restaurante ${companyId}:`, erro)
    }
  }

  console.log(
    `[Cron Relatorio] Concluido: ${enviados} enfileirado(s), ${semDestinatario} sem destinatario, ${falhas} falha(s)`
  )
  return { enviados, semDestinatario, falhas }
}

let worker: Worker<CronTickJob> | null = null

export function startReviewReportWorker() {
  if (worker) return worker

  const queue = new Queue<CronTickJob>(QUEUE_NAMES.CRON_REVIEW_REPORT, {
    connection: getRedisConnection(),
  })

  // Segunda-feira as 8h no fuso do restaurante.
  const pattern = process.env.REVIEW_REPORT_CRON || '0 8 * * 1'
  queue
    .upsertJobScheduler(
      'review-report-scheduler',
      { pattern, tz: REPORT_TZ },
      { name: 'send-review-report', data: { triggeredAt: new Date().toISOString() } }
    )
    .then(() => console.log(`[Cron Relatorio] Scheduler criado: pattern='${pattern}' tz='${REPORT_TZ}'`))
    .catch((err) => console.error('[Cron Relatorio] Falha ao criar scheduler:', err.message))

  worker = new Worker<CronTickJob>(
    QUEUE_NAMES.CRON_REVIEW_REPORT,
    async () => enviarRelatorios(),
    { connection: getRedisConnection(), concurrency: 1 }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Cron Relatorio] Job ${job?.id} falhou:`, err.message)
  })

  console.log('[Cron Relatorio] Worker iniciado (semanal)')
  return worker
}

export async function stopReviewReportWorker() {
  if (worker) {
    await worker.close()
    worker = null
  }
}
