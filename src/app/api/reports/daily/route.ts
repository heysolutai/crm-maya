import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  try {
    const { agentId } = await authenticate(req);

    const supabase = createAdminClient();

    const { company_id, report_date, manual_entries, manual_scheduled, manual_scheduled_today, manual_attended } = await req.json();

    if (!company_id || !report_date) {
      return badRequestResponse('company_id and report_date are required');
    }

    const startOfDay = `${report_date}T00:00:00.000Z`;
    const endOfDay = `${report_date}T23:59:59.999Z`;

    const [clientsRes, appointmentsCreatedRes, appointmentsForTodayRes, salesRes] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true })
        .eq('company_id', company_id).gte('created_at', startOfDay).lte('created_at', endOfDay),
      supabase.from('appointments').select('*', { count: 'exact', head: true })
        .eq('company_id', company_id).gte('created_at', startOfDay).lte('created_at', endOfDay),
      supabase.from('appointments').select('*', { count: 'exact', head: true })
        .eq('company_id', company_id).gte('scheduled_for', startOfDay).lte('scheduled_for', endOfDay),
      supabase.from('sales').select('id, total_amount, client_id, clients(first_name, last_name, full_name)')
        .eq('company_id', company_id).gte('created_at', startOfDay).lte('created_at', endOfDay),
    ]);

    const crmEntries = clientsRes.count || 0;
    const crmScheduled = appointmentsCreatedRes.count || 0;
    const crmScheduledToday = appointmentsForTodayRes.count || 0;
    const sales = salesRes.data || [];
    const salesTotalAmount = sales.reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0);
    const salesIds = sales.map((s: any) => s.id);

    const [year, month, day] = report_date.split('-');
    const formattedDate = `${day}/${month}/${year}`;

    const salesLines = sales.length === 0
      ? '• Nenhuma venda registrada'
      : sales.map((s: any) => {
          const name = (s as any).clients?.full_name || (s as any).clients?.first_name || 'Cliente';
          const amount = Number(s.total_amount) || 0;
          return `• ${name} - R$ ${amount.toFixed(2).replace('.', ',')}`;
        }).join('\n');

    const totalFormatted = `R$ ${salesTotalAmount.toFixed(2).replace('.', ',')}`;

    const message = `📊 RELATÓRIO DO DIA - ${formattedDate}

📥 ENTRANTES: CRM(${crmEntries}) Usuário(${manual_entries || 0})
📅 AGENDARAM HOJE: CRM(${crmScheduled}) Usuário(${manual_scheduled || 0})
📋 AGENDADOS PRA HOJE: CRM(${crmScheduledToday}) Usuário(${manual_scheduled_today || 0})
✅ COMPARECERAM: ${manual_attended || 0}

💰 VENDAS:
${salesLines}

💵 TOTAL EM VENDAS: ${totalFormatted}`;

    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .upsert({
        company_id,
        report_date,
        manual_entries: manual_entries || 0,
        manual_scheduled: manual_scheduled || 0,
        manual_scheduled_today: manual_scheduled_today || 0,
        manual_attended: manual_attended || 0,
        crm_entries: crmEntries,
        crm_scheduled: crmScheduled,
        crm_scheduled_today: crmScheduledToday,
        sales_ids: salesIds,
        sales_total: salesTotalAmount,
        created_by: agentId,
      }, { onConflict: 'company_id,report_date' })
      .select()
      .single();

    if (reportError) {
      console.error('[generate-daily-report] Error saving report:', reportError);
      throw reportError;
    }

    let sent = false;
    const { data: company } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', company_id)
      .single();

    const settings = company?.settings as Record<string, any> | null;
    const reportGroupPhone = settings?.report_group_phone;

    if (reportGroupPhone) {
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('company_id', company_id)
        .eq('status', 'connected')
        .limit(1)
        .single();

      if (instance) {
        try {
          const cleanPhone = reportGroupPhone.replace(/[^0-9]/g, '');
          const response = await fetch(`${instance.api_url}/send/text`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.instance_api_key,
            },
            body: JSON.stringify({ number: cleanPhone, text: message }),
          });

          if (response.ok) {
            sent = true;
            await supabase
              .from('daily_reports')
              .update({ sent_at: new Date().toISOString() })
              .eq('id', report.id);
          }
        } catch (whatsappError) {
          console.error('[generate-daily-report] WhatsApp error:', whatsappError);
        }
      }
    }

    return jsonResponse({ success: true, sent, report, message });
  } catch (error: any) {
    console.error('[generate-daily-report] Error:', error);
    return errorResponse(error.message || 'Internal server error');
  }
}
