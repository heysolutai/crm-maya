// ============================================================
// CONFIGURAÇÃO CENTRALIZADA DE IA
// Single source of truth para modelos, preços e defaults
// ============================================================

// === Interfaces ===
export interface AIModel {
  value: string;
  label: string;
  provider: 'openai' | 'anthropic' | 'google';
  category?: string;
}

export interface ModelPricing {
  model: string;
  inputPer1M: number;
  outputPer1M: number;
}

export interface BehaviorSettings {
  response_delay_seconds: number;
  formality_level: 'formal' | 'casual' | 'neutral';
  language: string;
  use_emojis: boolean;
  max_messages_before_transfer: number;
  preferred_model: string;
  typing_indicator_delay_ms: number;
  temperature: number;
  message_debounce_seconds: number;
  audio_response_percentage: number;
}

export interface Prompts {
  prompt_completo?: string;    // PROMPT COMPLETO - campo único
  persona?: string;            // PERSONA - quem é a IA (legado)
  behavior?: string;           // COMPORTAMENTO - como agir (legado)
  attendance_funnel?: string;  // FUNIL DE ATENDIMENTO (legado)
  scheduling_funnel?: string;  // FUNIL DE AGENDAMENTO (legado)
  business_rules?: string;     // REGRAS DE NEGÓCIO (legado)
  first_message: string;       // Mensagem de boas-vindas
}

// === Modelos de IA Disponíveis ===
export const AI_MODELS: AIModel[] = [
  // === OpenAI GPT-5 Series ===
  { value: 'gpt-5-2025-08-07', label: 'GPT-5 (Flagship)', provider: 'openai', category: 'reasoning' },
  { value: 'gpt-5-mini-2025-08-07', label: 'GPT-5 Mini', provider: 'openai', category: 'reasoning' },
  { value: 'gpt-5-nano-2025-08-07', label: 'GPT-5 Nano', provider: 'openai', category: 'reasoning' },
  
  // === OpenAI GPT-4.1 Series ===
  { value: 'gpt-4.1-2025-04-14', label: 'GPT-4.1', provider: 'openai', category: 'general' },
  { value: 'gpt-4.1-mini-2025-04-14', label: 'GPT-4.1 Mini', provider: 'openai', category: 'general' },
  { value: 'gpt-4.1-nano-2025-04-14', label: 'GPT-4.1 Nano', provider: 'openai', category: 'general' },
  
  // === OpenAI O-Series (Reasoning) ===
  { value: 'o3-2025-04-16', label: 'O3 (Reasoning)', provider: 'openai', category: 'reasoning' },
  { value: 'o4-mini-2025-04-16', label: 'O4 Mini (Reasoning)', provider: 'openai', category: 'reasoning' },
  
  // === OpenAI Legacy Models ===
  { value: 'gpt-4o', label: 'GPT-4o (Multimodal)', provider: 'openai', category: 'legacy' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Multimodal)', provider: 'openai', category: 'legacy' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai', category: 'legacy' },
  { value: 'gpt-4', label: 'GPT-4', provider: 'openai', category: 'legacy' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'openai', category: 'legacy' },
  
  // === Google Gemini Models ===
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google', category: 'reasoning' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', category: 'general' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'google', category: 'general' },

  // === Anthropic Claude Models ===
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'anthropic', category: 'general' },
  { value: 'claude-opus-4-1', label: 'Claude Opus 4.1', provider: 'anthropic', category: 'general' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'anthropic', category: 'general' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', provider: 'anthropic', category: 'legacy' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'anthropic', category: 'legacy' },
];

// === Preços por 1 Milhão de Tokens (USD) ===
export const AI_MODEL_PRICING: ModelPricing[] = [
  // === OpenAI GPT-5 Series ===
  { model: 'gpt-5-2025-08-07', inputPer1M: 10.0, outputPer1M: 30.0 },
  { model: 'gpt-5-mini-2025-08-07', inputPer1M: 0.4, outputPer1M: 1.6 },
  { model: 'gpt-5-nano-2025-08-07', inputPer1M: 0.15, outputPer1M: 0.6 },
  
  // === OpenAI GPT-4.1 Series ===
  { model: 'gpt-4.1-2025-04-14', inputPer1M: 5.0, outputPer1M: 15.0 },
  { model: 'gpt-4.1-mini-2025-04-14', inputPer1M: 0.3, outputPer1M: 1.2 },
  { model: 'gpt-4.1-nano-2025-04-14', inputPer1M: 0.1, outputPer1M: 0.4 },
  
  // === OpenAI O-Series (Reasoning) ===
  { model: 'o3-2025-04-16', inputPer1M: 15.0, outputPer1M: 60.0 },
  { model: 'o4-mini-2025-04-16', inputPer1M: 1.1, outputPer1M: 4.4 },
  
  // === OpenAI Legacy ===
  { model: 'gpt-4o', inputPer1M: 2.5, outputPer1M: 10.0 },
  { model: 'gpt-4o-mini', inputPer1M: 0.15, outputPer1M: 0.6 },
  { model: 'gpt-4-turbo', inputPer1M: 10.0, outputPer1M: 30.0 },
  { model: 'gpt-4', inputPer1M: 30.0, outputPer1M: 60.0 },
  { model: 'gpt-3.5-turbo', inputPer1M: 0.5, outputPer1M: 1.5 },
  
  // === Google Gemini ===
  { model: 'gemini-2.5-pro', inputPer1M: 1.25, outputPer1M: 10.0 },
  { model: 'gemini-2.5-flash', inputPer1M: 0.15, outputPer1M: 0.6 },
  { model: 'gemini-2.5-flash-lite', inputPer1M: 0.075, outputPer1M: 0.3 },

  // === Anthropic Claude ===
  { model: 'claude-sonnet-4-5', inputPer1M: 3.0, outputPer1M: 15.0 },
  { model: 'claude-opus-4-1', inputPer1M: 15.0, outputPer1M: 75.0 },
  { model: 'claude-sonnet-4-20250514', inputPer1M: 3.0, outputPer1M: 15.0 },
  { model: 'claude-3-7-sonnet-20250219', inputPer1M: 3.0, outputPer1M: 15.0 },
  { model: 'claude-3-5-haiku-20241022', inputPer1M: 0.8, outputPer1M: 4.0 },
];

// === Valores Padrão Centralizados ===
export const DEFAULT_BEHAVIOR_SETTINGS: BehaviorSettings = {
  response_delay_seconds: 3,
  formality_level: 'casual',
  language: 'pt-BR',
  use_emojis: true,
  max_messages_before_transfer: 10,
  preferred_model: 'gpt-4.1-mini-2025-04-14',
  typing_indicator_delay_ms: 30000,
  temperature: 0.4,
  message_debounce_seconds: 35,
  audio_response_percentage: 0,
};

export const DEFAULT_PROMPTS: Prompts = {
  prompt_completo: '',
  first_message: '',
};

// === Helper Functions ===
export const getModelByValue = (value: string): AIModel | undefined => {
  return AI_MODELS.find(model => model.value === value);
};

export const getModelLabel = (value: string): string => {
  return getModelByValue(value)?.label || value;
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = AI_MODEL_PRICING.find(p => p.model === model);
  
  if (!pricing) {
    console.warn(`Pricing not found for model: ${model}`);
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }
  
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const totalCost = inputCost + outputCost;
  
  return {
    inputCost: Number(inputCost.toFixed(6)),
    outputCost: Number(outputCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
  };
}

export function getModelPricing(model: string): ModelPricing | null {
  return AI_MODEL_PRICING.find(p => p.model === model) || null;
}
