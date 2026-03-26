import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const baseRedirectUrl = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/app/settings` : '/app/settings';

  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');
    const error = req.nextUrl.searchParams.get('error');

    if (error) return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=${encodeURIComponent(error)}`);
    if (!code || !state) return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=missing_params`);

    let stateData: { company_id: string };
    try { stateData = JSON.parse(atob(state)); } catch { return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=invalid_state`); }

    const companyId = stateData.company_id;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/calendar/callback`;

    if (!clientId || !clientSecret) return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=config_error`);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });

    if (!tokenResponse.ok) return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=token_exchange_failed`);
    const { access_token, refresh_token, expires_in } = await tokenResponse.json();
    if (!access_token || !refresh_token) return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=missing_tokens`);

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
    let connectedEmail = '';
    if (userInfoRes.ok) { connectedEmail = (await userInfoRes.json()).email || ''; }

    const supabase = createAdminClient();
    const { data: company } = await supabase.from('companies').select('name').eq('id', companyId).single();
    if (!company) return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=company_not_found`);

    const calendarName = `Agenda - ${company.name}`;
    const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
      method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: calendarName, description: `Calendário de agendamentos da ${company.name}`, timeZone: 'America/Sao_Paulo' }),
    });

    if (!calRes.ok) return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=calendar_creation_failed`);
    const calendarId = (await calRes.json()).id;

    await supabase.from('google_calendar_connections').delete().eq('company_id', companyId);
    const { error: insertError } = await supabase.from('google_calendar_connections').insert({
      company_id: companyId, calendar_id: calendarId, calendar_name: calendarName,
      access_token, refresh_token, token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      connected_email: connectedEmail, is_active: true, sync_enabled: true, create_meet_links: false,
    });

    if (insertError) return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=save_failed`);
    return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=success`);
  } catch (error) {
    console.error('[Calendar Callback]', error);
    return NextResponse.redirect(`${baseRedirectUrl}?google_calendar=error&message=unknown_error`);
  }
}
