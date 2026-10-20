/**
 * Modo simples do "O que enviar" (corpo da chamada) das ferramentas.
 *
 * Monta o MESMO bodyTemplate (objeto JSON com modelos {{...}}) que a API ja
 * aceita, sem o usuario escrever variaveis:
 *  - cada parametro vai com a propria chave: "date": "{{args.date}}";
 *  - dados do CRM marcados: "restaurant_id": "{{inbox.restaurant_id}}"...;
 *  - campos fixos: "action": "check_availability".
 *
 * Funcoes puras (sem React, sem imports) pra ler e montar o corpo.
 * Regra: so abre no modo simples o corpo que, montado de novo, fica
 * EXATAMENTE igual ao salvo. O resto fica no modo avancado, sem perder nada.
 */

export type CrmFieldId = 'telefone' | 'nome' | 'restaurante' | 'conversa';

export interface CrmFieldMeta {
  id: CrmFieldId;
  /** Modelo enviado (string exata). */
  template: string;
  label: string;
  help: string;
  defaultKey: string;
}

export const CRM_FIELDS: readonly CrmFieldMeta[] = [
  {
    id: 'telefone',
    template: '{{cliente.telefone}}',
    label: 'Telefone do cliente',
    help: 'O número do WhatsApp da conversa (só números).',
    defaultKey: 'customer_phone',
  },
  {
    id: 'nome',
    template: '{{cliente.nome}}',
    label: 'Nome do cliente',
    help: 'O nome do cliente salvo no CRM.',
    defaultKey: 'customer_name',
  },
  {
    id: 'restaurante',
    template: '{{inbox.restaurant_id}}',
    label: 'ID do restaurante (do WhatsApp)',
    help: 'Preenchido nas configurações da conexão de WhatsApp do restaurante.',
    defaultKey: 'restaurant_id',
  },
  {
    id: 'conversa',
    template: '{{conversa.id}}',
    label: 'Código da conversa',
    help: 'Identifica a conversa no CRM. Só existe em conversa de verdade (no teste fica faltando).',
    defaultKey: 'conversation_id',
  },
];

export interface CrmChoice {
  enabled: boolean;
  /** Nome do campo no corpo enviado. */
  key: string;
}

/** Tipo do valor fixo: o valor sai no JSON como texto, numero ou sim/nao. */
export type FixedKind = 'text' | 'number' | 'boolean';

export interface FixedRow {
  uid: string;
  key: string;
  /** Sempre texto no formulario; 'true'/'false' quando kind = boolean. */
  value: string;
  kind: FixedKind;
}

export interface BodyBuilderState {
  crm: Record<CrmFieldId, CrmChoice>;
  fixed: FixedRow[];
  /** Ordem das chaves no corpo salvo (pra salvar igual ao que veio). */
  order: string[];
}

export type BodyValue = string | number | boolean;

export interface BodyEntry {
  key: string;
  value: BodyValue;
  source: 'fixed' | 'crm' | 'param';
}

export type ParseResult = { ok: true; builder: BodyBuilderState } | { ok: false; reason: string };

let seq = 0;
function rowId(): string {
  seq += 1;
  return `b${Date.now().toString(36)}${seq.toString(36)}`;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function emptyBuilder(): BodyBuilderState {
  const crm = {} as Record<CrmFieldId, CrmChoice>;
  for (const f of CRM_FIELDS) crm[f.id] = { enabled: false, key: f.defaultKey };
  return { crm, fixed: [], order: [] };
}

export function newFixedRow(): FixedRow {
  return { uid: rowId(), key: '', value: '', kind: 'text' };
}

/** GET e DELETE nunca enviam corpo (src/lib/ai-tools/http.ts). */
export function methodSendsBody(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'DELETE';
}

function cleanKeys(paramKeys: string[]): string[] {
  const out: string[] = [];
  for (const k of paramKeys) {
    const key = k.trim();
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

function fixedValue(row: FixedRow): BodyValue {
  if (row.kind === 'boolean') return row.value === 'true';
  if (row.kind === 'number') {
    const text = row.value.trim();
    const n = Number(text);
    return text !== '' && Number.isFinite(n) ? n : row.value;
  }
  return row.value;
}

/** Tudo o que vai no corpo, na ordem de envio. Chaves vazias ficam de fora. */
export function builderEntries(b: BodyBuilderState, paramKeys: string[]): BodyEntry[] {
  const entries: BodyEntry[] = [];
  for (const row of b.fixed) entries.push({ key: row.key.trim(), value: fixedValue(row), source: 'fixed' });
  for (const f of CRM_FIELDS) {
    const c = b.crm[f.id];
    if (c.enabled) entries.push({ key: c.key.trim(), value: f.template, source: 'crm' });
  }
  for (const p of cleanKeys(paramKeys)) entries.push({ key: p, value: `{{args.${p}}}`, source: 'param' });

  // Ferramenta ja salva: mantem a ordem original; chaves novas vao pro fim.
  const pos = (key: string) => {
    const i = b.order.indexOf(key);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return entries
    .filter((e) => e.key)
    .map((e, i) => ({ e, i }))
    .sort((x, y) => pos(x.e.key) - pos(y.e.key) || x.i - y.i)
    .map((x) => x.e);
}

/**
 * Corpo (bodyTemplate) montado. null = sem corpo (GET/DELETE ou nada a enviar).
 * Chave repetida: vale a primeira (a validacao impede salvar assim).
 */
export function serializeBuilder(
  b: BodyBuilderState,
  paramKeys: string[],
  method: string
): Record<string, BodyValue> | null {
  if (!methodSendsBody(method)) return null;
  const pairs: [string, BodyValue][] = [];
  const seen = new Set<string>();
  for (const e of builderEntries(b, paramKeys)) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    pairs.push([e.key, e.value]);
  }
  // fromEntries cria propriedades proprias (ate "__proto__"), sem prototype.
  return pairs.length ? Object.fromEntries(pairs) : null;
}

/** Igualdade de JSON sem ligar pra ordem das chaves. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameJson(v, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra);
  if (ka.length !== Object.keys(rb).length) return false;
  return ka.every((k) => hasOwn(rb, k) && sameJson(ra[k], rb[k]));
}

const ARG_RE = /^\{\{args\.([A-Za-z_][A-Za-z0-9_]*)\}\}$/;

function fail(reason: string): ParseResult {
  return { ok: false, reason };
}

/**
 * Le um bodyTemplate salvo pro modo simples. Nao cabe (ok: false, com o
 * motivo em portugues simples) quando:
 *  - nao e um objeto simples (lista, objeto dentro de objeto, null);
 *  - usa alternativas, {{config.x}}, {{agora.x}}, texto misturado com {{...}};
 *  - um parametro vai com outro nome ou nao vai;
 *  - GET/DELETE com corpo salvo (nao e enviado, mas nao apagamos sozinhos);
 *  - montar de novo nao da exatamente o mesmo JSON.
 */
export function parseBuilder(value: unknown, paramKeys: string[], method: string): ParseResult {
  const params = cleanKeys(paramKeys);
  const body = value === undefined ? null : value;

  if (!methodSendsBody(method)) {
    if (body === null) return { ok: true, builder: emptyBuilder() };
    return fail(
      `Com ${method.toUpperCase()} nada é enviado no corpo, mas esta ferramenta tem um corpo salvo. Apague o corpo ou troque o método para POST.`
    );
  }

  if (body === null) {
    if (!params.length) return { ok: true, builder: emptyBuilder() };
    return fail(
      `O corpo está vazio, mas no modo simples o que a IA pergunta ao cliente (${params.join(', ')}) é sempre enviado.`
    );
  }
  if (Array.isArray(body)) return fail('O corpo é uma lista [...], e o modo simples só monta campos {...}.');
  if (typeof body !== 'object') return fail('O corpo não é um conjunto de campos {...}.');

  const obj = body as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (!keys.length) return fail('O corpo é um objeto vazio {}, e o modo simples não envia corpo quando não há campos.');

  const b = emptyBuilder();
  b.order = keys;
  const sent = new Set<string>();

  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string') {
      const arg = ARG_RE.exec(v);
      if (arg) {
        const p = arg[1];
        if (!params.includes(p)) return fail(`O campo "${key}" usa "${p}", que não está em "O que a IA pergunta ao cliente".`);
        if (p !== key) return fail(`"${p}" é enviado com outro nome ("${key}"). No modo simples cada dado vai com o próprio nome.`);
        sent.add(p);
        continue;
      }
      const crm = CRM_FIELDS.find((f) => f.template === v);
      if (crm) {
        if (b.crm[crm.id].enabled) return fail(`"${crm.label}" é enviado mais de uma vez.`);
        b.crm[crm.id] = { enabled: true, key };
        continue;
      }
      if (v.includes('{{')) {
        return fail(`O campo "${key}" usa variáveis ou alternativas que o modo simples não monta (${v}).`);
      }
      b.fixed.push({ uid: rowId(), key, value: v, kind: 'text' });
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      b.fixed.push({ uid: rowId(), key, value: String(v), kind: 'number' });
    } else if (typeof v === 'boolean') {
      b.fixed.push({ uid: rowId(), key, value: v ? 'true' : 'false', kind: 'boolean' });
    } else if (v === null) {
      return fail(`O campo "${key}" está vazio (null).`);
    } else {
      return fail(`O campo "${key}" tem uma lista ou outros campos dentro.`);
    }
  }

  const missing = params.filter((p) => !sent.has(p));
  if (missing.length) {
    return fail(
      `${missing.map((p) => `"${p}"`).join(', ')} não ${missing.length === 1 ? 'é enviado' : 'são enviados'} no corpo (ou ${missing.length === 1 ? 'vai' : 'vão'} com outro valor). No modo simples tudo o que a IA pergunta é enviado.`
    );
  }

  // Rede de seguranca: so aceita se montar de novo der o mesmo JSON.
  if (!sameJson(serializeBuilder(b, params, method), body)) {
    return fail('O modo simples não consegue montar este corpo exatamente igual.');
  }
  return { ok: true, builder: b };
}

/** Problema de um campo fixo (ou null). */
export function fixedRowProblem(row: FixedRow): string | null {
  if (!row.key.trim()) return 'Dê um nome ao campo';
  if (row.kind === 'number' && (row.value.trim() === '' || !Number.isFinite(Number(row.value.trim())))) {
    return 'Use só números';
  }
  if (row.kind === 'text' && row.value.includes('{{')) return 'Campo fixo não aceita {{ }}: use o modo avançado';
  return null;
}

/** Nomes que aparecem mais de uma vez no corpo. */
export function duplicateKeys(b: BodyBuilderState, paramKeys: string[]): Set<string> {
  const count = new Map<string, number>();
  for (const e of builderEntries(b, paramKeys)) count.set(e.key, (count.get(e.key) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
}

/** O que impede salvar no modo simples (vazio = ok). */
export function builderProblems(b: BodyBuilderState, paramKeys: string[], method: string): string[] {
  if (!methodSendsBody(method)) return [];
  const problems: string[] = [];
  for (const row of b.fixed) {
    const p = fixedRowProblem(row);
    if (p) problems.push(row.key.trim() ? `Campo fixo "${row.key.trim()}": ${p}` : `Campo fixo: ${p}`);
  }
  for (const f of CRM_FIELDS) {
    if (b.crm[f.id].enabled && !b.crm[f.id].key.trim()) problems.push(`Dê um nome ao campo de "${f.label}"`);
  }
  for (const k of duplicateKeys(b, paramKeys)) problems.push(`O nome "${k}" aparece mais de uma vez no que é enviado`);
  return problems;
}
