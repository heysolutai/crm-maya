import type { Prisma } from '@prisma/client'

/**
 * Motivos do Registro da IA em portugues: "Por que" e "O que fazer".
 *
 * O banco guarda um texto curto e FIXO (constantes abaixo); a explicacao sai
 * daqui na leitura. Como os textos gravados nao mudam, registro antigo
 * continua explicado mesmo se a explicacao for reescrita.
 */

export const MOTIVOS = {
  IA_PAUSADA: 'IA pausada para o cliente',
  SEM_FLUXO: 'sem fluxo de IA configurado',
  FLUXO_FORA: 'fluxo: fora do ar',
  RESPOSTA_BLOQUEADA: 'resposta da IA bloqueada: IA pausada',
  /** O restaurante desligou a IA do WhatsApp (chave "IA atendendo"). */
  IA_DESLIGADA: 'IA desligada neste WhatsApp',
  /** IA ligada so para um numero (teste) e a mensagem veio de outro cliente. */
  IA_SO_OUTRO_NUMERO: 'IA ligada so para outro numero',

  // Maestro (IA do proprio CRM). Textos FIXOS: o banco guarda estes e a tela
  // explica pelo texto, entao nao mude um existente (registro antigo perderia
  // a explicacao); acrescente um novo.
  MAESTRO_AGENTE_DESLIGADO: 'maestro: agente de IA desligado',
  MAESTRO_OUTRO_MOTOR: 'maestro: agente nao usa o Maestro',
  MAESTRO_CONVERSA_ENCERRADA: 'maestro: conversa encerrada',
  MAESTRO_COM_ATENDENTE: 'maestro: conversa com atendente',
  MAESTRO_SEM_CONTATO: 'maestro: conversa sem contato ou telefone',
  MAESTRO_RESPOSTA_DESCARTADA: 'maestro: resposta descartada, cliente escreveu de novo',
  MAESTRO_SEM_CHAVE: 'maestro: sem chave da OpenAI',
  MAESTRO_CHAVE_RECUSADA: 'maestro: chave da OpenAI recusada',
  MAESTRO_SEM_SALDO: 'maestro: limite ou saldo da OpenAI',
  MAESTRO_MODELO_FALHOU: 'maestro: falha ao chamar a OpenAI',
  MAESTRO_SEM_RESPOSTA: 'maestro: a IA nao gerou resposta',
  MAESTRO_ENVIO_FALHOU: 'maestro: falha ao enviar pelo canal',
  MAESTRO_ERRO_INTERNO: 'maestro: erro interno',
  MAESTRO_FALHA_FILA: 'maestro: falha ao enfileirar o turno',
} as const

/** Enviado e sem resposta ha mais que isso = problema ("nao respondeu"). */
export const SEM_RESPOSTA_APOS_MS = 10 * 60 * 1000

/** Resposta do cliente que foi pro fluxo de avaliacao (resumeUrl), nao pra IA de atendimento. */
export const DESTINO_AVALIACAO = 'fluxo_externo'

/**
 * Turno que espera resposta da IA de atendimento. O que foi pra avaliacao nao
 * conta: quem responde e a avaliacao, e a IA normal fica quieta de proposito.
 * O `destino: null` explicito e porque o `not` do Prisma tambem descarta null.
 */
export const ESPERA_RESPOSTA_DA_IA: Prisma.AiTurnWhereInput = {
  status: 'enviado',
  OR: [{ destino: null }, { destino: { not: DESTINO_AVALIACAO } }],
}

export interface Explicacao {
  /** Rotulo curto do resultado (badge). */
  resultado: string
  /** 'ok' | 'aviso' | 'problema' (cor na tela). */
  nivel: 'ok' | 'aviso' | 'problema'
  porque: string
  oQueFazer: string | null
}

function hora(d: Date | string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

/*
 * Regras dos textos abaixo (quem le e a equipe do restaurante, nao tecnico):
 * sem "OpenAI", "Maestro", "turno", "canal", "fila", "fluxo", "chave", "API";
 * todo problema diz o que o restaurante pode fazer, ou "fale com o suporte"
 * quando so o suporte resolve. O texto cru (motivo) so o super-admin ve.
 */

/** Explicacao dos motivos do Maestro (texto gravado -> o que dizer na tela). */
const EXPLICACOES_MAESTRO: Record<string, Explicacao> = {
  // IA desligada e escolha do restaurante, nao falha: quem atende e a equipe.
  [MOTIVOS.MAESTRO_AGENTE_DESLIGADO]: {
    resultado: 'IA desligada',
    nivel: 'ok',
    porque: 'A IA deste WhatsApp está desligada: quem responde é a equipe.',
    oQueFazer: 'Se a IA deveria estar atendendo, ligue a chave "IA atendendo" na aba "Agente de IA" deste WhatsApp.',
  },
  [MOTIVOS.IA_DESLIGADA]: {
    resultado: 'IA desligada',
    nivel: 'ok',
    porque: 'A IA deste WhatsApp está desligada: quem responde é a equipe.',
    oQueFazer: 'Se a IA deveria estar atendendo, ligue a chave "IA atendendo" na aba "Agente de IA" deste WhatsApp.',
  },
  [MOTIVOS.IA_SO_OUTRO_NUMERO]: {
    resultado: 'IA só para um número',
    nivel: 'ok',
    porque: 'A IA deste WhatsApp está ligada só para um número de teste: este cliente é atendido pela equipe.',
    oQueFazer: 'Quando terminar de testar, deixe a IA "Para todos" na aba "Agente de IA" deste WhatsApp.',
  },
  [MOTIVOS.MAESTRO_OUTRO_MOTOR]: {
    resultado: 'Não respondida',
    nivel: 'aviso',
    porque: 'A configuração da IA deste WhatsApp mudou enquanto esta mensagem esperava, e ela ficou sem resposta.',
    oQueFazer: 'Se o cliente ainda estiver esperando, responda pela conversa.',
  },
  [MOTIVOS.MAESTRO_CONVERSA_ENCERRADA]: {
    resultado: 'Não respondida',
    nivel: 'aviso',
    porque: 'A conversa já estava encerrada, então a IA não respondeu.',
    oQueFazer: 'Se o cliente ainda precisa de ajuda, reabra a conversa e responda.',
  },
  [MOTIVOS.MAESTRO_COM_ATENDENTE]: {
    resultado: 'Não respondida (atendente)',
    nivel: 'aviso',
    porque: 'A conversa está com um atendente (ou esperando um atendente), então a IA fica quieta para não atrapalhar.',
    oQueFazer: 'Quando o atendimento terminar e a IA puder voltar, clique em "Retomar IA" no topo da conversa.',
  },
  [MOTIVOS.MAESTRO_SEM_CONTATO]: {
    resultado: 'Não respondida',
    nivel: 'aviso',
    porque: 'Esta conversa está sem o telefone do cliente ou sem um WhatsApp ligado a ela, então a IA não tem para onde responder.',
    oQueFazer: 'Confira o telefone no cadastro do cliente. Se estiver certo, fale com o suporte.',
  },
  [MOTIVOS.MAESTRO_RESPOSTA_DESCARTADA]: {
    resultado: 'Descartada',
    nivel: 'aviso',
    porque:
      'A IA preparou uma resposta, mas o cliente mandou outra mensagem antes de ela sair. Para não responder algo desatualizado, a IA deixou essa resposta de lado e respondeu tudo junto logo depois.',
    oQueFazer: null,
  },
  [MOTIVOS.MAESTRO_SEM_CHAVE]: {
    resultado: 'Erro',
    nivel: 'problema',
    porque: 'O serviço de IA não está liberado para este restaurante, então a IA não conseguiu responder. A conversa foi passada para a equipe.',
    oQueFazer: 'Responda o cliente pela conversa e fale com o suporte para liberar o acesso da IA.',
  },
  [MOTIVOS.MAESTRO_CHAVE_RECUSADA]: {
    resultado: 'Erro',
    nivel: 'problema',
    porque: 'O serviço de IA recusou o acesso deste restaurante, então a IA não conseguiu responder. A conversa foi passada para a equipe.',
    oQueFazer: 'Responda o cliente pela conversa e fale com o suporte para conferir o acesso da IA.',
  },
  [MOTIVOS.MAESTRO_SEM_SALDO]: {
    resultado: 'Erro',
    nivel: 'problema',
    porque: 'O serviço de IA ficou sem crédito ou chegou ao limite de uso, então a IA não conseguiu responder. A conversa foi passada para a equipe.',
    oQueFazer: 'Responda o cliente pela conversa e fale com o suporte para liberar o uso da IA.',
  },
  [MOTIVOS.MAESTRO_MODELO_FALHOU]: {
    resultado: 'Erro',
    nivel: 'problema',
    porque: 'O serviço de IA demorou demais ou estava fora do ar, então a IA não conseguiu responder. A conversa foi passada para a equipe.',
    oQueFazer: 'Responda o cliente pela conversa. Se acontecer várias vezes, fale com o suporte.',
  },
  [MOTIVOS.MAESTRO_SEM_RESPOSTA]: {
    resultado: 'Erro',
    nivel: 'problema',
    porque: 'A IA não conseguiu montar uma resposta para esta mensagem. A conversa foi passada para a equipe.',
    oQueFazer: 'Responda o cliente pela conversa. Se acontecer várias vezes, fale com o suporte.',
  },
  [MOTIVOS.MAESTRO_ENVIO_FALHOU]: {
    resultado: 'Erro',
    nivel: 'problema',
    porque:
      'A IA preparou a resposta, mas ela não saiu pelo WhatsApp (o número pode estar desconectado ou o WhatsApp fora do ar). A conversa foi passada para a equipe.',
    oQueFazer: 'Confira em Conexões se o WhatsApp está conectado e responda o cliente pela conversa.',
  },
  [MOTIVOS.MAESTRO_ERRO_INTERNO]: {
    resultado: 'Erro',
    nivel: 'problema',
    porque: 'Deu um erro inesperado no sistema enquanto a IA preparava a resposta. A conversa foi passada para a equipe.',
    oQueFazer: 'Responda o cliente pela conversa. Se acontecer várias vezes, fale com o suporte.',
  },
  [MOTIVOS.MAESTRO_FALHA_FILA]: {
    resultado: 'Erro',
    nivel: 'problema',
    porque: 'A mensagem não chegou até a IA porque uma parte do sistema estava fora do ar.',
    oQueFazer: 'Responda o cliente pela conversa e avise o suporte.',
  },
}

/**
 * Motivo curto (meia frase, minusculo) pra nota que a IA deixa na conversa
 * quando desiste e passa o cliente pra equipe: "A IA nao conseguiu responder
 * este cliente (<isto>)".
 */
const MOTIVO_CURTO: Record<string, string> = {
  [MOTIVOS.MAESTRO_SEM_CHAVE]: 'o serviço de IA não está liberado para o restaurante',
  [MOTIVOS.MAESTRO_CHAVE_RECUSADA]: 'o serviço de IA recusou o acesso do restaurante',
  [MOTIVOS.MAESTRO_SEM_SALDO]: 'o serviço de IA ficou sem crédito',
  [MOTIVOS.MAESTRO_MODELO_FALHOU]: 'o serviço de IA demorou demais ou estava fora do ar',
  [MOTIVOS.MAESTRO_SEM_RESPOSTA]: 'a IA não conseguiu montar uma resposta',
  [MOTIVOS.MAESTRO_ENVIO_FALHOU]: 'a resposta não saiu pelo WhatsApp',
  [MOTIVOS.MAESTRO_ERRO_INTERNO]: 'deu um erro inesperado no sistema',
  [MOTIVOS.MAESTRO_FALHA_FILA]: 'uma parte do sistema estava fora do ar',
}

export function motivoCurto(motivo: string | null | undefined): string {
  return (motivo && MOTIVO_CURTO[motivo]) || 'deu um problema na hora de responder'
}

/** Se o problema exige o suporte (o restaurante sozinho nao resolve). */
export function precisaDoSuporte(motivo: string | null | undefined): boolean {
  return (
    motivo === MOTIVOS.MAESTRO_SEM_CHAVE ||
    motivo === MOTIVOS.MAESTRO_CHAVE_RECUSADA ||
    motivo === MOTIVOS.MAESTRO_SEM_SALDO
  )
}

export function explicarTurno(t: {
  status: string
  motivo: string | null
  createdAt: Date | string
  respondidoEm: Date | string | null
  pausadoAte: Date | string | null
  bloqueios: number
  httpStatus: number | null
  destino?: string | null
}): Explicacao {
  // Resposta da avaliacao: a IA de atendimento nao tinha que responder.
  if (t.destino === DESTINO_AVALIACAO && t.status !== 'erro') {
    return {
      resultado: 'Avaliação',
      nivel: 'ok',
      porque: 'O cliente estava respondendo a avaliação, então a mensagem foi para a avaliação, e não para a IA de atendimento.',
      oQueFazer: null,
    }
  }
  if (t.destino === DESTINO_AVALIACAO) {
    return {
      resultado: 'Erro na avaliação',
      nivel: 'problema',
      porque: 'A avaliação não recebeu a resposta do cliente (o sistema tentou 3 vezes).',
      oQueFazer: 'Se o cliente estiver esperando, responda pela conversa. Se acontecer de novo, fale com o suporte.',
    }
  }

  if (t.status === 'respondido') {
    return {
      resultado: 'Respondida',
      nivel: 'ok',
      porque: 'A IA recebeu a mensagem e respondeu.',
      oQueFazer: null,
    }
  }

  if (t.status === 'enviado') {
    const idade = Date.now() - new Date(t.createdAt).getTime()
    if (idade < SEM_RESPOSTA_APOS_MS) {
      return {
        resultado: 'Aguardando',
        nivel: 'aviso',
        porque: 'A IA recebeu a mensagem e ainda está preparando a resposta.',
        oQueFazer: null,
      }
    }
    return {
      resultado: 'Sem resposta',
      nivel: 'problema',
      porque: 'A IA recebeu a mensagem, mas não respondeu em 10 minutos.',
      oQueFazer: 'Se o cliente estiver esperando, responda pela conversa. Se acontecer várias vezes, fale com o suporte.',
    }
  }

  if (t.status === 'ignorado') {
    if (t.motivo === MOTIVOS.IA_PAUSADA || t.motivo === MOTIVOS.RESPOSTA_BLOQUEADA) {
      const ate = t.pausadoAte ? ` até ${hora(t.pausadoAte)}` : ' sem prazo (até alguém retomar)'
      return {
        resultado: t.bloqueios > 0 ? 'Bloqueada (pausa)' : 'Não respondida (pausa)',
        nivel: 'aviso',
        porque:
          `A IA estava pausada para este cliente${ate}, normalmente porque um atendente respondeu.` +
          (t.bloqueios > 0
            ? ` A IA tentou responder ${t.bloqueios === 1 ? 'uma vez' : `${t.bloqueios} vezes`}, mas a resposta não foi enviada.`
            : ''),
        oQueFazer: 'Se a IA deve voltar a atender, clique em "Retomar IA" no topo da conversa.',
      }
    }
    if (t.motivo === MOTIVOS.SEM_FLUXO) {
      return {
        resultado: 'Não respondida',
        nivel: 'problema',
        porque: 'A IA ainda não está ligada para este WhatsApp, então ela não respondeu.',
        oQueFazer: 'Responda o cliente pela conversa e fale com o suporte para ligar a IA neste WhatsApp.',
      }
    }
  }

  if (t.status === 'erro') {
    if (t.motivo === MOTIVOS.FLUXO_FORA) {
      return {
        resultado: 'Erro',
        nivel: 'problema',
        porque: 'A IA estava fora do ar e não recebeu a mensagem (o sistema tentou 3 vezes).',
        oQueFazer: 'Responda o cliente pela conversa. Se acontecer de novo, fale com o suporte.',
      }
    }
    if (t.motivo?.startsWith('fluxo: HTTP')) {
      // O codigo do erro fica no texto cru (so o super-admin ve).
      return {
        resultado: 'Erro',
        nivel: 'problema',
        porque: 'A IA deu erro e não recebeu a mensagem (o sistema tentou 3 vezes).',
        oQueFazer: 'Responda o cliente pela conversa. Se acontecer de novo, fale com o suporte.',
      }
    }
  }

  // Maestro: motivos fixos explicados em palavras de quem usa a tela.
  if ((t.status === 'ignorado' || t.status === 'erro') && t.motivo && EXPLICACOES_MAESTRO[t.motivo]) {
    return { ...EXPLICACOES_MAESTRO[t.motivo] }
  }

  // Motivo desconhecido: frase neutra (o texto cru so o super-admin ve na tela).
  if (t.status === 'erro') {
    return {
      resultado: 'Erro',
      nivel: 'problema',
      porque: 'Algo deu errado e a IA não respondeu esta mensagem.',
      oQueFazer: 'Responda o cliente pela conversa. Se acontecer várias vezes, fale com o suporte.',
    }
  }
  return {
    resultado: 'Não respondida',
    nivel: 'aviso',
    porque: 'A IA não respondeu esta mensagem.',
    oQueFazer: 'Se o cliente estiver esperando, responda pela conversa.',
  }
}

/** O turno conta como problema no filtro "Problemas". */
export function ehProblema(e: Explicacao): boolean {
  return e.nivel === 'problema'
}
