import type { ConfigField, PostAction, ToolParam, ToolParamType } from '@/lib/ai-tools/types';

/**
 * Tipos e utilitarios da tela "Integrações da IA" (super-admin).
 * Espelham o que /api/admin/integrations devolve.
 */

/** Mesmo valor de MASK em src/lib/ai-tools/secrets.ts (que so roda no servidor). */
export { SECRET_MASK as MASK } from '@/lib/ai-tools/types';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type PostActionType = PostAction['type'];

export interface AdminTool {
  id: string;
  integrationId: string;
  name: string;
  label: string;
  aiDescription: string;
  promptHint: string | null;
  parameters: ToolParam[];
  method: string;
  path: string;
  bodyTemplate: unknown;
  responseTemplate: string | null;
  postActions: PostAction[];
  isWrite: boolean;
  isActive: boolean;
  sortOrder: number;
  /** Restaurantes com a integração ativa e esta ferramenta ligada. */
  companiesUsing: number;
}

export interface AdminIntegration {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  segment: string | null;
  icon: string | null;
  /** 'http' = ferramentas montadas aqui; 'mcp' = servidor MCP (ferramentas vêm dele). */
  kind: 'http' | 'mcp';
  baseUrl: string;
  /** { nome: MASK }: o valor real nunca chega na tela. */
  headers: Record<string, string>;
  configFields: ConfigField[];
  testToolName: string | null;
  testArgs: Record<string, unknown> | null;
  isActive: boolean;
  companiesUsing: number;
  tools: AdminTool[];
}

export interface IntegrationsResponse {
  integrations: AdminIntegration[];
  /** Nomes das ferramentas nativas do CRM (reservados). */
  reservedNames: string[];
}

export interface ToolTestResult {
  ok: boolean;
  result: string;
  error: string | null;
  httpStatus: number | null;
}

export interface CompanyOption {
  id: string;
  name: string;
}

export const PARAM_TYPE_OPTIONS: { value: ToolParamType; label: string }[] = [
  { value: 'string', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'boolean', label: 'Sim/não' },
  { value: 'date', label: 'Data' },
  { value: 'time', label: 'Hora' },
];

export function paramTypeLabel(type: ToolParamType): string {
  return PARAM_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export const SEGMENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'otica', label: 'Ótica' },
  { value: 'outro', label: 'Outro' },
];

export function segmentLabel(segment: string | null): string {
  if (!segment) return 'Todos os segmentos';
  return SEGMENT_OPTIONS.find((o) => o.value === segment)?.label ?? segment;
}

export const POST_ACTION_META: Record<PostActionType, { label: string; help: string }> = {
  registrar_reserva: {
    label: 'Registrar reserva no CRM',
    help: 'Cria a reserva no dashboard do restaurante (com o código do sistema externo).',
  },
  cancelar_reserva_crm: {
    label: 'Cancelar reserva no CRM',
    help: 'Marca como cancelada a reserva do CRM com este código externo.',
  },
  registrar_encaminhamento: {
    label: 'Registrar encaminhamento',
    help: 'Conta um encaminhamento (para humano ou evento) nos relatórios da conversa.',
  },
  adicionar_etiqueta: {
    label: 'Adicionar etiqueta na conversa',
    help: 'Coloca uma etiqueta na conversa (se ainda não tiver).',
  },
};

export const POST_ACTION_TYPES: PostActionType[] = [
  'registrar_reserva',
  'cancelar_reserva_crm',
  'registrar_encaminhamento',
  'adicionar_etiqueta',
];

let seq = 0;
/** Id local para linhas de formulario (key do React). */
export function uid(): string {
  seq += 1;
  return `r${Date.now().toString(36)}${seq.toString(36)}`;
}

/** "Reserve Maya" -> "reserve-maya" */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const SLUG_RE = /^[a-z0-9-]{2,40}$/;
export const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
export const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

/** Le { error } de uma resposta de erro da API. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
      return (data as { error: string }).error;
    }
  } catch {
    // corpo nao e JSON
  }
  return fallback;
}

/** Datas de hoje/amanha no fuso de Sao Paulo (AAAA-MM-DD), como o servidor. */
export function datasSaoPaulo(): { data: string; amanha: string } {
  const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const now = new Date();
  return { data: fmt(now), amanha: fmt(new Date(now.getTime() + 24 * 60 * 60 * 1000)) };
}

/** Exemplo de argumentos a partir dos parametros (pro teste do restaurante). */
export function sampleArgs(params: ToolParam[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params) {
    switch (p.type) {
      case 'date':
        out[p.key] = '{{agora.amanha}}';
        break;
      case 'time':
        out[p.key] = '20:00';
        break;
      case 'integer':
      case 'number':
        out[p.key] = 2;
        break;
      case 'boolean':
        out[p.key] = false;
        break;
      default:
        out[p.key] = p.enum?.[0] ?? '';
    }
  }
  return out;
}
