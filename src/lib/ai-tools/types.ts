/**
 * Ferramentas da IA: tipos compartilhados entre motor, APIs e telas.
 *
 * Vocabulario:
 *   - ferramenta NATIVA: acao do proprio CRM (transferir, base de conhecimento...),
 *     definida em codigo (native.ts). O restaurante liga/desliga.
 *   - ferramenta de INTEGRACAO: chamada HTTP a um sistema externo, montada pelo
 *     super-admin no catalogo (tabelas integrations / integration_tools).
 */

export type ToolParamType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'time'

/** Parametro que a IA informa (vira JSON Schema da funcao). */
export interface ToolParam {
  key: string
  type: ToolParamType
  description: string
  required?: boolean
  enum?: string[]
}

/** Campo que o restaurante preenche ao ativar uma integracao. */
export interface ConfigField {
  key: string
  label: string
  help?: string
  required?: boolean
  /** Guardado criptografado e mostrado mascarado. */
  secret?: boolean
}

/**
 * Acao no CRM depois que a ferramenta deu certo. Valores aceitam modelos
 * ({{args.x}}, {{resposta.x}}, {{cliente.x}}...).
 */
export type PostAction =
  | {
      type: 'registrar_reserva'
      /** AAAA-MM-DD */
      data?: string
      /** HH:MM */
      hora?: string
      pessoas?: string
      /** Codigo da reserva no sistema externo (guardado em metadata.external_code). */
      codigo?: string
      observacao?: string
      tipo?: 'normal' | 'evento'
    }
  | { type: 'cancelar_reserva_crm'; codigo: string }
  | { type: 'registrar_encaminhamento'; destino: 'humano' | 'evento' }
  | { type: 'adicionar_etiqueta'; etiqueta: string }

export const POST_ACTION_TYPES = [
  'registrar_reserva',
  'cancelar_reserva_crm',
  'registrar_encaminhamento',
  'adicionar_etiqueta',
] as const

/** Definicao no formato de function calling (OpenAI / compativeis). */
export interface FunctionDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, Record<string, unknown>>
      required: string[]
      additionalProperties: false
    }
  }
}

/** Dados da conversa disponiveis nos modelos ({{cliente.nome}} etc.). */
export interface ToolContext {
  empresa: { id: string; nome: string }
  conversa: { id: string | null; codigo: string | null }
  cliente: { id: string | null; nome: string; telefone: string }
  inbox: { id: string | null; nome: string; restaurant_id: string }
  /** Configuracao da integracao do restaurante (descriptografada). */
  config: Record<string, string>
  agora: { data: string; hora: string; amanha: string; iso: string }
  /** Nome da tabela de conhecimento (pgvector) do agente da conversa. */
  knowledge: string | null
}

export interface ExecuteResult {
  ok: boolean
  /** Texto pronto pra devolver a IA (inclusive no erro). */
  result: string
  /** Detalhe tecnico (log). */
  error?: string
  httpStatus?: number
  /** true = chamada repetida em menos de 2 min; devolveu o resultado anterior. */
  repeated?: boolean
}

/** Valor mascarado de segredo nas telas (string igual de volta = "nao mudou"). */
export const SECRET_MASK = '••••••••'
