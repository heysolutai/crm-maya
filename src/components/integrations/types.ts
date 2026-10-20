/**
 * Ferramentas do agente de IA (Conexões › Agente de IA › Ferramentas): formato devolvido por
 * GET/PUT /api/integrations e POST /api/integrations/test.
 */

/** Mesmo texto que o servidor usa para segredo salvo (src/lib/ai-tools/secrets.ts). */
export { SECRET_MASK } from '@/lib/ai-tools/types';

export interface NativeToolState {
  name: string;
  label: string;
  help: string;
  isWrite: boolean;
  enabled: boolean;
}

export interface IntegrationConfigField {
  key: string;
  label: string;
  help?: string;
  required?: boolean;
  secret?: boolean;
}

export interface IntegrationToolOption {
  name: string;
  label: string;
  isWrite: boolean;
}

export interface IntegrationLastTest {
  at: string;
  ok: boolean;
  /** Frase amigável quando o teste falhou. */
  error: string | null;
}

export interface IntegrationState {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  configFields: IntegrationConfigField[];
  /** Valores salvos (segredos vêm como SECRET_MASK). */
  config: Record<string, string>;
  enabled: boolean;
  enabledTools: string[];
  tools: IntegrationToolOption[];
  hasTest: boolean;
  needsRestaurantId: boolean;
  lastTest: IntegrationLastTest | null;
  /** Falha da IA com esta integração nas últimas 24h que ainda não voltou a funcionar. */
  problemaRecente?: IntegrationProblem | null;
  /** De onde vem a configuração (catálogo do super-admin). Só chega para o super-admin. */
  origem?: IntegrationOrigin;
}

export interface IntegrationOrigin {
  href: string;
  /** Host do endereço cadastrado. */
  endereco: string;
  temChave: boolean;
}

export interface IntegrationProblem {
  titulo: string;
  motivo: string;
  oQueFazer: string | null;
  vezes: number;
  /** "hoje às 20:13" */
  quando: string;
  ferramentas: string[];
}

export interface RestaurantIdState {
  inboxId: string;
  name: string;
  restaurantId: string | null;
}

export interface IntegrationsState {
  canEdit: boolean;
  native: NativeToolState[];
  integrations: IntegrationState[];
  restaurantIds: RestaurantIdState[];
}

export interface IntegrationSavePayload {
  integrationId: string;
  enabled?: boolean;
  config?: Record<string, string>;
  enabledTools?: string[];
}

export interface IntegrationTestResult {
  ok: boolean;
  message: string;
  at: string;
}
