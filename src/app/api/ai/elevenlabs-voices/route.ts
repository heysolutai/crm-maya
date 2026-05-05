import { NextRequest } from 'next/server';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  try {
    const { api_key } = await req.json();

    if (!api_key) {
      return badRequestResponse('API key da ElevenLabs é obrigatória');
    }

    const response = await fetch('https://api.elevenlabs.io/v2/voices', {
      method: 'GET',
      headers: { 'xi-api-key': api_key },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[get-elevenlabs-voices] API error:', response.status, errorText);
      return errorResponse(`Erro ao buscar vozes: ${response.status}`, response.status);
    }

    const data = await response.json();

    const voices = (data.voices || []).map((voice: any) => ({
      voice_id: voice.voice_id,
      name: voice.name,
      category: voice.category || null,
      labels: voice.labels || {},
      preview_url: voice.preview_url || null,
    }));

    return jsonResponse({ voices });
  } catch (error) {
    return handleApiErrorCors(error, '[get-elevenlabs-voices] Error')
  }
}
