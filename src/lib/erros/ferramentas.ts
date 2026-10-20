/**
 * Tradutor de falhas das FERRAMENTAS da IA (reserva, eventos, base de
 * conhecimento, integracoes do catalogo) pra linguagem do restaurante.
 *
 * O executor (src/lib/ai-tools/executor.ts) grava em AiToolCall.error um texto
 * tecnico ("Sistema externo respondeu 401 | {...}", "configuracao incompleta:
 * ...", "recusado: ...") e o httpStatus. Aqui cada um vira: um titulo curto, o
 * que aconteceu, o que fazer e se alguem precisa agir. O texto cru continua
 * guardado e so o super-admin ve.
 *
 * Nem toda chamada com ok=false e problema: faltar a data da reserva (a IA
 * pergunta ao cliente) ou o evento estar lotado e o atendimento normal. Essas
 * ficam com nivel 'normal' e nao entram no painel "Situação".
 *
 * Arquivo sem dependencias de servidor: pode ser importado pela tela.
 */

export type CodigoFalhaFerramenta =
  | 'faltou_dado'
  | 'recusado'
  | 'desligada'
  | 'nao_configurada'
  | 'id_errado'
  | 'acesso_recusado'
  | 'endereco_errado'
  | 'pedido_invalido'
  | 'limite'
  | 'fora_do_ar'
  | 'base_vazia'
  | 'base_indisponivel'
  | 'desconhecido'

export interface FalhaFerramentaExplicada {
  codigo: CodigoFalhaFerramenta
  /** 'normal' = parte do atendimento (a IA resolve com o cliente). */
  nivel: 'problema' | 'aviso' | 'normal'
  /** Titulo curto pro painel: "O Reserve Maya não respondeu". */
  titulo: string
  /** O que aconteceu, em uma frase simples. */
  motivo: string
  /** O que o restaurante pode fazer (null quando nao precisa fazer nada). */
  oQueFazer: string | null
  /** Quem resolve: o proprio restaurante, o suporte, ou ninguem (normal). */
  quemResolve: 'restaurante' | 'suporte' | 'ninguem'
}

export interface EntradaFalhaFerramenta {
  /** AiToolCall.error (texto tecnico). */
  error: string | null | undefined
  httpStatus?: number | null
  /** Nome do sistema externo ("Reserve Maya"). Null = ferramenta do proprio CRM. */
  sistema?: string | null
  /** Nome amigavel da ferramenta ("Fazer reservas"). */
  ferramenta?: string | null
}

const ONDE_FERRAMENTAS = 'Abra o WhatsApp em Conexões > "Agente de IA" > "Ferramentas"'

function statusDe(e: EntradaFalhaFerramenta, texto: string): number | null {
  if (typeof e.httpStatus === 'number' && e.httpStatus > 0) return e.httpStatus
  const m = /respondeu (\d{3})\b/.exec(texto)
  return m ? Number(m[1]) : null
}

/** Mensagem do sistema externo numa recusa, curta e sem quebras. */
function trechoRecusa(texto: string): string {
  const msg = texto.replace(/^recusado:\s*/i, '').replace(/\s+/g, ' ').trim()
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg
}

export function explicarFalhaFerramenta(e: EntradaFalhaFerramenta): FalhaFerramentaExplicada {
  const texto = (e.error || '').trim()
  const baixo = texto.toLowerCase()
  const sistema = e.sistema?.trim() || null
  const oSistema = sistema ? `o ${sistema}` : 'o sistema'
  const OSistema = sistema ? `O ${sistema}` : 'O sistema'
  const doSistema = sistema ? `do ${sistema}` : 'do sistema'
  const acao = e.ferramenta?.trim() ? `“${e.ferramenta.trim()}”` : 'esta ação'

  // ─── Erros do proprio executor ───
  if (baixo.startsWith('ferramenta inexistente') || baixo.includes('ferramenta inexistente ou desligada')) {
    return {
      codigo: 'desligada',
      nivel: 'aviso',
      titulo: `A IA tentou usar ${acao}, que está desligada`,
      motivo: `Um cliente pediu algo que precisava de ${acao}, mas essa opção está desligada para a IA.`,
      oQueFazer: 'Se quiser que a IA faça isso, abra o WhatsApp em Conexões > "Agente de IA" > "Ferramentas" e ligue a opção. Se não quiser, pode ignorar.',
      quemResolve: 'restaurante',
    }
  }

  if (baixo.startsWith('argumentos invalidos') || /^(nome vazio|pessoas invalido|evento vazio|evento ambiguo)/.test(baixo)) {
    return {
      codigo: 'faltou_dado',
      nivel: 'normal',
      titulo: 'Faltou uma informação do cliente',
      motivo: 'Faltou uma informação do cliente (por exemplo, a data ou o número de pessoas). A IA pede ao cliente e tenta de novo.',
      oQueFazer: null,
      quemResolve: 'ninguem',
    }
  }

  if (baixo.startsWith('configuracao incompleta')) {
    if (baixo.includes('id do restaurante')) {
      return {
        codigo: 'nao_configurada',
        nivel: 'problema',
        titulo: `Falta o ID do restaurante para usar ${oSistema}`,
        motivo: `Este WhatsApp está sem o ID do restaurante, então a IA não conseguiu usar ${oSistema}.`,
        oQueFazer: `${ONDE_FERRAMENTAS} e preencha o "ID do restaurante deste WhatsApp". Se não souber o número, fale com o suporte.`,
        quemResolve: 'restaurante',
      }
    }
    return {
      codigo: 'nao_configurada',
      nivel: 'problema',
      titulo: `Falta configurar ${oSistema}`,
      motivo: `Falta preencher alguma informação ${doSistema}, então a IA não conseguiu usá-lo.`,
      oQueFazer: `${ONDE_FERRAMENTAS} e preencha os campos. Se não souber o que colocar, fale com o suporte.`,
      quemResolve: 'restaurante',
    }
  }

  if (baixo === 'evento nao encontrado' || baixo === 'sem vagas') {
    return {
      codigo: 'recusado',
      nivel: 'normal',
      titulo: baixo === 'sem vagas' ? 'O evento não tinha vagas suficientes' : 'O evento pedido não foi encontrado',
      motivo:
        baixo === 'sem vagas'
          ? 'Não havia vagas suficientes no evento. A IA avisou o cliente.'
          : 'O cliente pediu um evento que não está cadastrado (ou já passou). A IA conferiu com ele.',
      oQueFazer: null,
      quemResolve: 'ninguem',
    }
  }

  if (baixo === 'sem knowledge') {
    return {
      codigo: 'base_vazia',
      nivel: 'aviso',
      titulo: 'A IA procurou uma resposta em "Perguntas e respostas", mas está vazio',
      motivo: 'A IA tentou consultar as perguntas e respostas do restaurante, mas nada foi cadastrado ainda.',
      oQueFazer: 'Abra o WhatsApp em Conexões > "Perguntas e respostas" e cadastre as dúvidas mais comuns dos clientes.',
      quemResolve: 'restaurante',
    }
  }

  if (baixo === 'sem chave openai' || baixo === 'embedding falhou') {
    return {
      codigo: 'base_indisponivel',
      nivel: 'problema',
      titulo: 'A consulta às "Perguntas e respostas" falhou',
      motivo: 'A IA não conseguiu consultar as perguntas e respostas do restaurante, então não teve como responder com elas.',
      oQueFazer: 'Fale com o suporte.',
      quemResolve: 'suporte',
    }
  }

  // ─── Resposta do sistema externo ───
  const status = statusDe(e, texto)

  if (baixo.startsWith('recusado')) {
    const msg = trechoRecusa(texto)
    if (/restaurant.{0,30}(not found|invalid|inexist)|restaurante.{0,30}(n[aã]o encontrad|inv[aá]lid|inexist)/i.test(msg)) {
      return {
        codigo: 'id_errado',
        nivel: 'problema',
        titulo: `${OSistema} não reconheceu o ID do restaurante`,
        motivo: `${OSistema} não encontrou o restaurante com o ID cadastrado neste WhatsApp, então a ação não foi feita.`,
        oQueFazer: `${ONDE_FERRAMENTAS} e confira o "ID do restaurante deste WhatsApp". Se não souber o número certo, fale com o suporte.`,
        quemResolve: 'restaurante',
      }
    }
    if (/unauthori[sz]ed|forbidden|api.?key|invalid.{0,10}token|chave/i.test(msg)) {
      return acessoRecusado(OSistema, doSistema)
    }
    return {
      codigo: 'recusado',
      nivel: 'normal',
      titulo: `${OSistema} recusou o pedido`,
      motivo: `${OSistema} respondeu, mas não aceitou o pedido${msg && msg !== 'pedido recusado' ? `: “${msg}”` : ''}. A IA explicou ao cliente.`,
      oQueFazer: null,
      quemResolve: 'ninguem',
    }
  }

  if (status === 401 || status === 403 || /\bunauthori[sz]ed\b|\bforbidden\b/i.test(texto)) {
    return acessoRecusado(OSistema, doSistema)
  }

  if (
    status === 404 ||
    /path absoluto|destino interno bloqueado|so pode chamar urls https|url da integracao invalida|redirecionamento|resolver o endereco/i.test(texto)
  ) {
    return {
      codigo: 'endereco_errado',
      nivel: 'problema',
      titulo: `O endereço ${doSistema} está errado no CRM`,
      motivo: `O CRM tentou falar com ${oSistema} num endereço que não existe ou não é permitido, então a ação não foi feita.`,
      oQueFazer: 'Fale com o suporte para corrigir a integração.',
      quemResolve: 'suporte',
    }
  }

  if (status === 429) {
    return {
      codigo: 'limite',
      nivel: 'aviso',
      titulo: `${OSistema} pediu para esperar`,
      motivo: `${OSistema} recebeu muitos pedidos em pouco tempo e pediu para esperar.`,
      oQueFazer: 'Costuma voltar sozinho em alguns minutos. Se continuar, fale com o suporte.',
      quemResolve: 'suporte',
    }
  }

  if (status !== null && status >= 400 && status < 500) {
    return {
      codigo: 'pedido_invalido',
      nivel: 'problema',
      titulo: `${OSistema} não aceitou o pedido da IA`,
      motivo: `${OSistema} não entendeu o pedido que o CRM enviou para ${acao}, então a ação não foi feita.`,
      oQueFazer: 'Fale com o suporte para revisar esta ação.',
      quemResolve: 'suporte',
    }
  }

  if ((status !== null && status >= 500) || /indispon[ií]vel|tempo esgotado|falha de rede|timeout|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(texto)) {
    return {
      codigo: 'fora_do_ar',
      nivel: 'problema',
      titulo: `${OSistema} não respondeu`,
      motivo: `${OSistema} não respondeu (fora do ar ou muito lento), então a IA não conseguiu fazer ${acao} e ofereceu um atendente ao cliente.`,
      oQueFazer: 'Confira se o cliente ainda precisa de ajuda e responda pela conversa. Costuma voltar sozinho; se continuar, fale com o suporte.',
      quemResolve: 'suporte',
    }
  }

  return {
    codigo: 'desconhecido',
    nivel: 'problema',
    titulo: `A ação ${acao} não funcionou`,
    motivo: `A IA tentou fazer ${acao}, mas não deu certo, e ofereceu um atendente ao cliente.`,
    oQueFazer: 'Confira se o cliente ainda precisa de ajuda e responda pela conversa. Se continuar acontecendo, fale com o suporte.',
    quemResolve: 'suporte',
  }
}

function acessoRecusado(OSistema: string, doSistema: string): FalhaFerramentaExplicada {
  return {
    codigo: 'acesso_recusado',
    nivel: 'problema',
    titulo: `${OSistema} recusou o acesso da IA`,
    motivo: `${OSistema} não aceitou a chave de acesso do CRM (inválida, vencida ou não cadastrada), então a ação não foi feita.`,
    oQueFazer: `Fale com o suporte para atualizar a chave de acesso ${doSistema}.`,
    quemResolve: 'suporte',
  }
}
