import { prisma } from '@/lib/db'

/**
 * Consumo da resumeUrl do fluxo externo (avaliacao no n8n).
 *
 * O n8n para num Wait e registra na conversa duas coisas:
 *   - `resumeUrl`      — o `webhook-waiting` que retoma a execucao
 *   - `executionUrl`   — o link pra ABRIR a execucao no n8n, so pra gente ver
 *
 * A resumeUrl e de uso unico: gasta, some. A executionUrl nunca e limpa — e
 * quando a resumeUrl e consumida que esse ponteiro faz falta, pra achar a
 * execucao que travou no Wait.
 *
 * O ponto delicado e QUANDO gastar a resumeUrl. Antes isso acontecia ao
 * ENFILEIRAR a mensagem, e o debounce quebrou esse pressuposto: a primeira
 * mensagem queimava a url, o job dela era cancelado pela mensagem seguinte, e
 * o job que sobrava ia pro webhook errado — o fluxo de avaliacao ficava
 * esperando pra sempre um resume que nunca chegava.
 *
 * Por isso quem consome e quem ENVIA. Job cancelado nao gasta nada.
 */

interface LinhaConsumida {
  resume_url: string | null
  resume_url_expires_at: Date | null
}

/**
 * A conversa esta (ou esteve ha pouco) sob um fluxo externo?
 *
 * A `resumeUrl` sozinha nao responde: ela some no primeiro encaminhamento, e o
 * cliente costuma mandar mais uma mensagem ("obrigado!") depois. Quem sustenta
 * a resposta entre um turno e outro e o `resumeUrlExpiresAt`, que NAO e limpo
 * junto com a url — enquanto a janela declarada pelo fluxo nao vence, a
 * conversa e dele, e o follow-up nao entra.
 */
export function emFluxoExterno(conversa: {
  resumeUrl?: string | null
  resumeUrlExpiresAt?: Date | null
}): boolean {
  return !!conversa.resumeUrlExpiresAt && conversa.resumeUrlExpiresAt > new Date()
}

/**
 * Pega a resumeUrl e limpa o campo na MESMA instrucao.
 *
 * O UPDATE ... RETURNING e atomico: com duas replicas do worker disputando a
 * mesma conversa, so uma leva a url; a outra recebe null e cai no webhook
 * normal, em vez de as duas resumirem o fluxo.
 *
 * O `resume_url_expires_at` fica de proposito: e ele que marca a janela do
 * fluxo depois que a url ja foi gasta (ver `emFluxoExterno`).
 *
 * @returns a url pronta pra usar, ou null (nao havia, ou estava vencida).
 */
export async function consumirResumeUrl(conversationId: string): Promise<string | null> {
  try {
    // O RETURNING sai da CTE, NAO do UPDATE.
    //
    // No Postgres, `UPDATE ... RETURNING col` devolve o valor DEPOIS da
    // escrita. Como a escrita e justamente `resume_url = NULL`, um RETURNING
    // direto devolvia sempre null: a url era consumida e jogada fora, e toda
    // mensagem caia no webhook geral enquanto a execucao ficava presa no Wait.
    //
    // A CTE le (e trava) a linha antes, e e dela que o valor antigo sai.
    // O `FOR UPDATE` mantem a atomicidade: com dois workers na mesma conversa,
    // o segundo espera, reavalia o `IS NOT NULL` e nao acha nada — so um
    // resume o fluxo.
    const linhas = await prisma.$queryRaw<LinhaConsumida[]>`
      WITH anterior AS (
        SELECT id, resume_url, resume_url_expires_at
        FROM conversations
        WHERE id = ${conversationId}::uuid AND resume_url IS NOT NULL
        FOR UPDATE
      )
      UPDATE conversations c
      SET resume_url = NULL
      FROM anterior
      WHERE c.id = anterior.id
      RETURNING anterior.resume_url AS resume_url,
                anterior.resume_url_expires_at AS resume_url_expires_at
    `

    const linha = linhas[0]
    if (!linha?.resume_url) return null

    if (linha.resume_url_expires_at && linha.resume_url_expires_at < new Date()) {
      console.log(`[ResumeUrl] ⏰ Vencida na conversa ${conversationId}: mensagem segue pro fluxo normal`)
      return null
    }

    return linha.resume_url
  } catch (erro) {
    // Falhar aqui nao pode derrubar o envio: sem url, a mensagem vai pro
    // webhook de IA normal, que e o comportamento de quem nao esta num fluxo.
    console.error('[ResumeUrl] Falha ao consumir:', erro)
    return null
  }
}
