import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId: company_id } = await authenticate(req);

    const { report_date, manual_entries, manual_scheduled, manual_scheduled_today, manual_attended } = await req.json();

    if (!company_id || !report_date) {
      return badRequestResponse('company_id and report_date are required');
    }

    const startOfDay = new Date(`${report_date}T00:00:00.000Z`);
    const endOfDay = new Date(`${report_date}T23:59:59.999Z`);

    const [crmEntries, crmScheduled, crmScheduledToday, sales] = await Promise.all([
      prisma.client.count({
        where: { companyId: company_id, createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      prisma.appointment.count({
        where: { companyId: company_id, createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      prisma.appointment.count({
        where: { companyId: company_id, scheduledFor: { gte: startOfDay, lte: endOfDay } },
      }),
      prisma.sale.findMany({
        where: { companyId: company_id, createdAt: { gte: startOfDay, lte: endOfDay } },
        select: { id: true, totalAmount: true, clientId: true, client: { select: { firstName: true, lastName: true, fullName: true } } },
      }),
    ]);

    const salesTotalAmount = sales.reduce((sum: number, s: any) => sum + (Number(s.totalAmount) || 0), 0);
    const salesIds = sales.map((s: any) => s.id);

    const [year, month, day] = report_date.split('-');
    const formattedDate = `${day}/${month}/${year}`;

    const salesLines = sales.length === 0
      ? '• Nenhuma venda registrada'
      : sales.map((s: any) => {
          const name = s.client?.fullName || s.client?.firstName || 'Cliente';
          const amount = Number(s.totalAmount) || 0;
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

    const existingReport = await prisma.dailyReport.findFirst({
      where: { companyId: company_id, reportDate: new Date(report_date) },
    });

    const reportData = {
      manualEntries: manual_entries || 0,
      manualScheduled: manual_scheduled || 0,
      manualScheduledToday: manual_scheduled_today || 0,
      manualAttended: manual_attended || 0,
      crmEntries,
      crmScheduled,
      crmScheduledToday,
      salesIds,
      salesTotal: salesTotalAmount,
      createdBy: agentId,
    };

    const report = existingReport
      ? await prisma.dailyReport.update({
          where: { id: existingReport.id },
          data: reportData,
        })
      : await prisma.dailyReport.create({
          data: {
            companyId: company_id,
            reportDate: new Date(report_date),
            ...reportData,
          },
        });

    let sent = false;
    const company = await prisma.company.findUnique({
      where: { id: company_id },
      select: { settings: true },
    });

    const settings = company?.settings as Record<string, any> | null;
    const reportGroupPhone = settings?.report_group_phone;

    if (reportGroupPhone) {
      const instance = await prisma.inbox.findFirst({
        where: { companyId: company_id, status: 'connected' },
      });

      if (instance) {
        try {
          const cleanPhone = reportGroupPhone.replace(/[^0-9]/g, '');
          const response = await fetch(`${instance.apiUrl}/send/text`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.instanceApiKey ?? '',
            },
            body: JSON.stringify({ number: cleanPhone, text: message }),
          });

          if (response.ok) {
            sent = true;
            await prisma.dailyReport.update({
              where: { id: report.id },
              data: { sentAt: new Date() },
            });
          }
        } catch (whatsappError) {
          console.error('[generate-daily-report] WhatsApp error:', whatsappError);
        }
      }
    }

    return jsonResponse({ success: true, sent, report, message });
  } catch (error) {
    return handleApiErrorCors(error, '[generate-daily-report] Error')
  }
}
