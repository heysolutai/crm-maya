import type { Funil } from './funis'

/**
 * Regras que todo restaurante ganha na primeira vez (editaveis na tela). As
 * chaves (key) sao o que a IA usa para escolher: nao mude uma existente.
 *
 * Cada regra diz QUANDO usar e QUANDO NAO usar: o "nao" e o que evita a IA
 * encaminhar errado (ex.: reserva comum de aniversario nao e evento).
 */

export interface RegraPadrao {
  funnel: Funil
  key: string
  name: string
  tag: string
  trigger: string
  notWhen: string
  examples: string[]
  collectFields: string[]
  /** Frase que abre o pedido de dados (modo "tudo de uma vez"). */
  askMessage?: string
  responseMessage: string
  pauseAi: boolean
  isSystem?: boolean
}

/** Chave da regra automatica de falha da IA (Maestro sem conseguir responder). */
export const REGRA_FALHA_IA = 'falha_ia'

/** Categoria usada quando a IA (ou um fluxo antigo) nao diz qual. */
export const REGRA_ATENDIMENTO_PADRAO = 'duvida_sem_resposta'

/** Regra de eventos usada pelo encaminhar_para_eventos. */
export const REGRA_EVENTO_PADRAO = 'evento_personalizado'

export const REGRAS_PADRAO: RegraPadrao[] = [
  {
    funnel: 'eventos',
    key: REGRA_EVENTO_PADRAO,
    name: 'Evento personalizado',
    tag: 'Evento personalizado',
    trigger:
      'O cliente quer um evento fora da reserva normal: aniversário ou comemoração com cardápio fechado, evento corporativo, palestra, casamento, confraternização, fechar o espaço (ou parte dele) ou um grupo maior do que o sistema de reservas aceita.',
    notWhen:
      'Reserva comum de mesa, mesmo que seja para comemorar um aniversário, sem cardápio fechado nem espaço exclusivo e dentro do limite de pessoas do sistema de reservas: isso é reserva normal, use as ferramentas de reserva. Reserva para um evento especial da programação da casa (show, réveillon, data comemorativa, com reserva paga) também é reserva.',
    examples: [
      'Quero fazer meu aniversário aí com cardápio fechado',
      'Vocês fazem evento para empresa?',
      'Dá para fechar o espaço num sábado?',
    ],
    collectFields: ['Tipo de evento', 'Data', 'Número de pessoas', 'Orçamento'],
    askMessage: 'Que legal! Para eu passar para a nossa equipe de eventos, me manda por favor:',
    responseMessage: 'Perfeito, {nome}! Anotei tudo: {resumo}. Nossa equipe de eventos vai falar com você para montar a proposta.',
    pauseAi: true,
  },
  {
    funnel: 'atendimento',
    key: 'pediu_atendente',
    name: 'Pediu um atendente',
    tag: 'Atendimento humano',
    trigger: 'O cliente pede, com essas palavras ou parecidas, para falar com uma pessoa, um atendente, o gerente ou o dono.',
    notWhen: 'O cliente só cumprimenta ("oi", "tem alguém aí?" no começo da conversa) ou faz uma pergunta que você consegue responder com a base ou as ferramentas.',
    examples: ['Quero falar com um atendente', 'Me passa para uma pessoa, por favor', 'Quero falar com o gerente'],
    collectFields: [],
    responseMessage: 'Claro, {nome}! Já chamei alguém da nossa equipe para continuar com você. É só aguardar um instante.',
    pauseAi: true,
  },
  {
    funnel: 'atendimento',
    key: REGRA_ATENDIMENTO_PADRAO,
    name: 'Dúvida sem resposta',
    tag: 'Dúvida sem resposta',
    trigger: 'Você consultou a base de conhecimento e as ferramentas e não achou a resposta, ou uma ferramenta falhou duas vezes seguidas.',
    notWhen: 'Antes de consultar a base de conhecimento e as ferramentas. Nunca use para fugir de uma pergunta que dá para responder.',
    examples: ['Vocês aceitam vale-refeição?', 'Tem cadeira para bebê?'],
    collectFields: [],
    responseMessage: 'Boa pergunta, {nome}! Vou confirmar com a equipe e já te retornamos por aqui.',
    pauseAi: true,
  },
  {
    funnel: 'atendimento',
    key: 'reclamacao',
    name: 'Reclamação',
    tag: 'Reclamação',
    trigger: 'O cliente reclama ou mostra insatisfação com a visita, o atendimento, a comida, a entrega ou a cobrança.',
    notWhen: 'Elogio, sugestão, ou dúvida sobre a conta sem insatisfação.',
    examples: ['Fui muito mal atendido ontem', 'A comida veio fria', 'Cobraram errado na minha conta'],
    collectFields: ['O que aconteceu'],
    responseMessage: 'Sinto muito por isso, {nome}. Já passei para o responsável, que vai falar com você em seguida.',
    pauseAi: true,
  },
  {
    funnel: 'atendimento',
    key: 'problema_reserva',
    name: 'Problema com reserva ou pagamento',
    tag: 'Problema com reserva',
    trigger:
      'Problema com uma reserva ou pagamento que as ferramentas não resolvem: não encontra a reserva, cobrança errada, sinal pago sem confirmação, pedido de reembolso.',
    notWhen: 'Fazer, consultar, alterar ou cancelar uma reserva que as ferramentas de reserva conseguem resolver.',
    examples: ['Paguei o sinal e não recebi a confirmação', 'Quero o reembolso da minha reserva'],
    collectFields: ['Data da reserva ou código'],
    responseMessage: 'Entendi, {nome}. Já passei para a equipe verificar a sua reserva e te retornamos por aqui.',
    pauseAi: true,
  },
  {
    funnel: 'atendimento',
    key: 'outros_assuntos',
    name: 'Outros assuntos',
    tag: 'Outros assuntos',
    trigger: 'Assuntos que não são atendimento ao cliente: vaga de emprego, fornecedor, parceria, imprensa, divulgação.',
    notWhen: 'Clientes querendo reservar, pedir ou tirar dúvidas sobre a casa.',
    examples: ['Vocês estão contratando?', 'Sou fornecedor de bebidas'],
    collectFields: ['Assunto'],
    responseMessage: 'Obrigado pelo contato, {nome}! Vou repassar para o responsável.',
    pauseAi: true,
  },
  {
    funnel: 'atendimento',
    key: REGRA_FALHA_IA,
    name: 'Falha técnica da IA',
    tag: 'Falha da IA',
    trigger: 'Automático: a IA não conseguiu responder por um problema técnico e passou a conversa para a equipe.',
    notWhen: '',
    examples: [],
    collectFields: [],
    responseMessage: '',
    pauseAi: true,
    isSystem: true,
  },
]
