/**
 * Adapter to replace supabase.functions.invoke() calls with fetch() to Next.js API routes.
 *
 * Usage (in hooks): Replace
 *   const { data, error } = await supabase.functions.invoke('send-message-text', { body: payload })
 * With:
 *   const { data, error } = await invokeFn('send-message-text', payload)
 */

const routeMap: Record<string, string> = {
  // WhatsApp
  'send-message-text': '/api/whatsapp/send-text',
  'send-message-media': '/api/whatsapp/send-media',
  'send-audio-message': '/api/whatsapp/send-audio',
  'send-agent-message': '/api/whatsapp/send-agent',
  'send-reaction': '/api/whatsapp/send-reaction',
  'whatsapp-presence': '/api/whatsapp/presence',

  // Appointments
  'appointments': '/api/appointments',
  'appointments-slots': '/api/appointments/slots',
  'create-appointment': '/api/appointments/create',
  'reschedule-appointment': '/api/appointments/reschedule',
  'get-available-slots': '/api/appointments/available-slots',

  // Google Calendar
  'google-calendar-auth': '/api/calendar/auth',
  'google-calendar-callback': '/api/calendar/callback',
  'disconnect-google-calendar': '/api/calendar/disconnect',
  'sync-google-calendar': '/api/calendar/sync',
  'bulk-sync-google-calendar': '/api/calendar/bulk-sync',

  // Company & Users
  'create-company-with-owner': '/api/company/create',
  'add-user-to-company': '/api/company/add-user',
  'set-user-password': '/api/user/set-password',
  'reset-user-password': '/api/user/reset-password',

  // AI
  'get-ai-config': '/api/ai/config',
  'get-audio-settings': '/api/ai/audio-settings',
  'get-elevenlabs-voices': '/api/ai/elevenlabs-voices',
  'track-ai-usage': '/api/ai/track-usage',
  'update-ai-prompts': '/api/ai/update-prompts',

  // Messaging
  'transcribe-audio': '/api/messaging/transcribe',
  'transfer-conversation': '/api/messaging/transfer',
  'pickup-queue': '/api/messaging/pickup-queue',

  // Presence
  'update-presence': '/api/user/presence',

  // Knowledge
  'sync-knowledge-base': '/api/knowledge/sync',
  'faq-api': '/api/knowledge/faq',
  'notify-faq-upload': '/api/knowledge/notify-upload',

  // Reports
  'generate-daily-report': '/api/reports/daily',
}

interface InvokeFnResult<T = any> {
  data: T | null
  error: string | null
}

export async function invokeFn<T = any>(
  functionName: string,
  body?: any,
  options?: { headers?: Record<string, string> }
): Promise<InvokeFnResult<T>> {
  const route = routeMap[functionName]
  if (!route) {
    console.error(`[invokeFn] Unknown function: ${functionName}`)
    return { data: null, error: `Unknown function: ${functionName}` }
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    }

    const response = await fetch(route, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()

    if (!response.ok) {
      return { data: null, error: data.error || `HTTP ${response.status}` }
    }

    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error' }
  }
}
