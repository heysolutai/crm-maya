import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, unauthorizedResponse, badRequestResponse } from '@/lib/api/cors';

const AI_MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gpt-5-2025-08-07': { inputPer1M: 10.0, outputPer1M: 30.0 },
  'gpt-5-mini-2025-08-07': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'gpt-5-nano-2025-08-07': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4.1-2025-04-14': { inputPer1M: 5.0, outputPer1M: 15.0 },
  'gpt-4.1-mini-2025-04-14': { inputPer1M: 0.3, outputPer1M: 1.2 },
  'gpt-4.1-nano-2025-04-14': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'o3-2025-04-16': { inputPer1M: 15.0, outputPer1M: 60.0 },
  'o4-mini-2025-04-16': { inputPer1M: 1.1, outputPer1M: 4.4 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4-turbo': { inputPer1M: 10.0, outputPer1M: 30.0 },
  'gpt-4': { inputPer1M: 30.0, outputPer1M: 60.0 },
  'gpt-3.5-turbo': { inputPer1M: 0.5, outputPer1M: 1.5 },
  'claude-sonnet-4-5': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-opus-4-1': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-sonnet-4-20250514': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-7-sonnet-20250219': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-haiku-20241022': { inputPer1M: 0.8, outputPer1M: 4.0 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number) {
  const pricing = AI_MODEL_PRICING[model];
  if (!pricing) {
    console.warn(`Pricing not found for model: ${model}`);
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return {
    inputCost: Number(inputCost.toFixed(6)),
    outputCost: Number(outputCost.toFixed(6)),
    totalCost: Number((inputCost + outputCost).toFixed(6)),
  };
}

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req);

    if (!companyId) {
      return unauthorizedResponse('Authentication required');
    }

    const {
      conversation_id,
      message_id,
      model,
      input_tokens,
      output_tokens,
      request_type = 'chat',
      client_id,
      metadata = {},
    } = await req.json();

    if (!model || input_tokens === undefined || output_tokens === undefined) {
      return badRequestResponse('Missing required fields: model, input_tokens, output_tokens');
    }

    const supabase = createAdminClient();
    const costs = calculateCost(model, input_tokens, output_tokens);
    const totalTokens = input_tokens + output_tokens;
    const provider = model.startsWith('claude') ? 'anthropic' : 'openai';

    const { data, error } = await supabase
      .from('ai_token_usage')
      .insert({
        company_id: companyId,
        conversation_id,
        message_id,
        model,
        provider,
        input_tokens,
        output_tokens,
        total_tokens: totalTokens,
        input_cost: costs.inputCost,
        output_cost: costs.outputCost,
        total_cost: costs.totalCost,
        request_type,
        client_id,
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting token usage:', error);
      throw error;
    }

    console.log(`[Token Usage] Tracked: ${model} | ${totalTokens} tokens | $${costs.totalCost}`);

    return jsonResponse({
      success: true,
      data: {
        id: data.id,
        total_tokens: totalTokens,
        total_cost: costs.totalCost,
      },
    });
  } catch (error) {
    console.error('Error in track-ai-usage:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
