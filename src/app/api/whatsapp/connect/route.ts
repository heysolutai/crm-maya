import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

interface WhatsAppRequest {
  action: 'connect' | 'reconnect' | 'disconnect' | 'delete' | 'update';
  company_id: string;
  instance_id?: string;
}

const WHATSAPP_API_URL = process.env.UAZAPI_BASE_URL || 'https://heysolut.uazapi.com';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId: authCompanyId } = await authenticate(req);

    const ADMIN_TOKEN = process.env.WHATSAPP_ADMIN_TOKEN;
    if (!ADMIN_TOKEN) throw new Error('WHATSAPP_ADMIN_TOKEN não configurado');

    const { action, company_id, instance_id }: WhatsAppRequest = await req.json();
    console.log(`Action: ${action} for company: ${company_id}`);

    // With Bearer: allow super_admin to manage any company, others only their own
    // With API key: only the company that owns the key
    if (agentId) {
      const isSuperAdmin = await prisma.userRole.findFirst({
        where: { userId: agentId, role: 'super_admin' },
      });
      if (!isSuperAdmin && authCompanyId !== company_id) throw new Error('Acesso negado a esta empresa');
    } else if (authCompanyId !== company_id) {
      throw new Error('Acesso negado a esta empresa');
    }

    const company = await prisma.company.findUnique({
      where: { id: company_id },
      select: { name: true },
    });
    if (!company) throw new Error('Empresa não encontrada');

    const generateInstanceName = (companyName: string): string =>
      companyName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const instance_name = generateInstanceName(company.name);

    const existingInstance = await prisma.whatsappInstance.findFirst({
      where: { companyId: company_id },
    });

    if (action === 'connect') {
      if (existingInstance) {
        if (!existingInstance.instanceApiKey) throw new Error('Instância existente sem API Key. Exclua e crie novamente.');

        const reconnResponse = await fetch(`${existingInstance.apiUrl}/instance/connect`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': existingInstance.instanceApiKey },
          body: JSON.stringify({ phone: '' }),
        });

        if (reconnResponse.status === 409) {
          const statusResp = await fetch(`${existingInstance.apiUrl}/instance/status`, {
            method: 'GET', headers: { 'Accept': 'application/json', 'token': existingInstance.instanceApiKey },
          });
          if (statusResp.ok) {
            const statusData = await statusResp.json();
            const isConnected = statusData.status?.connected === true || statusData.status?.loggedIn === true;
            if (isConnected) {
              await prisma.whatsappInstance.update({ where: { id: existingInstance.id }, data: { status: 'connected', qrCode: null, errorMessage: null } });
              return jsonResponse({ success: true, already_connected: true, message: 'WhatsApp já está conectado!' });
            }
            const existingQR = statusData.instance?.qrcode || statusData.qrcode;
            if (existingQR && existingQR.length > 50) {
              await prisma.whatsappInstance.update({ where: { id: existingInstance.id }, data: { status: 'connecting', qrCode: existingQR, errorMessage: null } });
              return jsonResponse({ success: true, data: { ...existingInstance, qr_code: existingQR, status: 'connecting' }, message: 'QR Code recuperado' });
            }
          }
          throw new Error('Não foi possível gerar QR Code. Tente excluir a instância e criar novamente.');
        }

        if (!reconnResponse.ok) throw new Error(`Erro ao reconectar instância: ${reconnResponse.status}`);

        const reconnData = await reconnResponse.json();
        if (reconnData.loggedIn === true) {
          await prisma.whatsappInstance.update({ where: { id: existingInstance.id }, data: { status: 'connected', qrCode: null, metadata: reconnData } });
          return jsonResponse({ success: true, already_connected: true, message: 'WhatsApp já está conectado!' });
        }

        const reconnQR = reconnData.instance?.qrcode;
        if (!reconnQR) throw new Error('QR Code não foi gerado pela API');

        await prisma.whatsappInstance.update({ where: { id: existingInstance.id }, data: { status: 'connecting', qrCode: reconnQR, metadata: reconnData, errorMessage: null } });
        return jsonResponse({ success: true, data: { ...existingInstance, qr_code: reconnQR, status: 'connecting' }, message: 'QR Code gerado com sucesso (instância existente)', show_qr_modal: true });
      }

      // Create new instance
      const response = await fetch(`${WHATSAPP_API_URL}/instance/init`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'admintoken': ADMIN_TOKEN },
        body: JSON.stringify({ name: instance_name, systemName: 'apilocal', adminField01: `Instancia da Empresa ${company.name}`, adminField02: company_id }),
      });

      if (!response.ok) throw new Error(`Erro ao criar instância: ${response.status}`);

      const apiData = await response.json();
      const instanceToken = apiData.token || apiData.instance?.token;
      if (!instanceToken) throw new Error('Token não foi retornado pela API');

      const newInstance = await prisma.whatsappInstance.create({
        data: {
          companyId: company_id, instanceName: instance_name, apiUrl: WHATSAPP_API_URL, instanceApiKey: instanceToken, status: 'connecting', qrCode: null, metadata: apiData,
        },
      });

      // Configure webhook
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      try {
        await fetch(`${WHATSAPP_API_URL}/webhook`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': instanceToken },
          body: JSON.stringify({ action: 'add', enabled: true, url: `${appUrl}/api/webhooks/whatsapp`, events: ['messages', 'messages_update'], excludeMessages: ['isGroupYes'] }),
        });
      } catch (e) { console.error('Webhook config error:', e); }

      // Generate QR Code
      let qrCode = null;
      try {
        const connectResponse = await fetch(`${WHATSAPP_API_URL}/instance/connect`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': instanceToken },
          body: JSON.stringify({ phone: '' }),
        });
        if (connectResponse.ok) {
          const connectData = await connectResponse.json();
          qrCode = connectData.instance?.qrcode;
          if (qrCode) await prisma.whatsappInstance.update({ where: { id: newInstance.id }, data: { qrCode, status: 'connecting' } });
        }
      } catch (e) { console.error('Connect error:', e); }

      return jsonResponse({ success: true, data: { ...newInstance, qr_code: qrCode }, message: 'Instância criada com sucesso', show_qr_modal: true });
    }

    if (action === 'reconnect') {
      if (!instance_id) throw new Error('instance_id é obrigatório para reconnect');

      const targetInstance = await prisma.whatsappInstance.findFirst({
        where: { id: instance_id, companyId: company_id },
      });
      if (!targetInstance) {
        // Polling pode pegar IDs stale (instancia recriada/migrada).
        // Retornamos 404 limpo em vez de throw — evita poluir log com stack trace.
        return jsonResponse({ success: false, error: 'Instância não encontrada', code: 'INSTANCE_NOT_FOUND' }, 404);
      }
      if (!targetInstance.instanceApiKey) throw new Error('API Key não encontrada');

      const response = await fetch(`${targetInstance.apiUrl}/instance/connect`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': targetInstance.instanceApiKey },
        body: JSON.stringify({ phone: '' }),
      });

      if (response.status === 409) {
        const statusResponse = await fetch(`${targetInstance.apiUrl}/instance/status`, { method: 'GET', headers: { 'Accept': 'application/json', 'token': targetInstance.instanceApiKey } });
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const hasStatusObject = typeof statusData.status === 'object' && statusData.status !== null;
          const isLoggedIn = hasStatusObject ? statusData.status?.loggedIn === true : false;
          const isConnected = hasStatusObject ? statusData.status?.connected === true : false;
          const shouldTreatAsConnected = hasStatusObject ? (isLoggedIn || isConnected) : (statusData.instance?.status === 'connected' || statusData.instance?.status === 'open');

          if (shouldTreatAsConnected) {
            await prisma.whatsappInstance.update({ where: { id: instance_id }, data: { status: 'connected', qrCode: null, errorMessage: null } });
            return jsonResponse({ success: true, already_connected: true, message: 'WhatsApp já está conectado!' });
          }
          const existingQR = statusData.instance?.qrcode || statusData.qrcode;
          if (existingQR && existingQR.length > 50) {
            await prisma.whatsappInstance.update({ where: { id: instance_id }, data: { status: 'connecting', qrCode: existingQR, errorMessage: null } });
            return jsonResponse({ success: true, data: { ...targetInstance, qr_code: existingQR, status: 'connecting' }, message: 'QR Code recuperado' });
          }
        }

        // Restart and retry
        await fetch(`${targetInstance.apiUrl}/instance/restart`, { method: 'PUT', headers: { 'Accept': 'application/json', 'token': targetInstance.instanceApiKey } });
        await new Promise(resolve => setTimeout(resolve, 3000));

        const retryResponse = await fetch(`${targetInstance.apiUrl}/instance/connect`, {
          method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': targetInstance.instanceApiKey },
          body: JSON.stringify({ phone: '' }),
        });

        if (retryResponse.ok || retryResponse.status === 409) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const finalStatusResponse = await fetch(`${targetInstance.apiUrl}/instance/status`, { method: 'GET', headers: { 'Accept': 'application/json', 'token': targetInstance.instanceApiKey } });
          if (finalStatusResponse.ok) {
            const finalData = await finalStatusResponse.json();
            const qrCode = finalData.instance?.qrcode || finalData.qrcode;
            if (qrCode && qrCode.length > 50) {
              await prisma.whatsappInstance.update({ where: { id: instance_id }, data: { status: 'connecting', qrCode, errorMessage: null } });
              return jsonResponse({ success: true, data: { ...targetInstance, qr_code: qrCode, status: 'connecting' }, message: 'QR Code gerado após restart' });
            }
          }
        }

        if (targetInstance.qrCode && targetInstance.qrCode.length > 50) {
          return jsonResponse({ success: true, data: targetInstance, message: 'Usando QR Code existente' });
        }
        throw new Error('Não foi possível gerar QR Code. Tente excluir a instância e criar novamente.');
      }

      if (!response.ok) throw new Error(`Erro ao conectar instância: ${response.status}`);

      const apiData = await response.json();
      if (apiData.loggedIn === true) {
        await prisma.whatsappInstance.update({ where: { id: instance_id }, data: { status: 'connected', qrCode: null, metadata: apiData } });
        return jsonResponse({ success: true, already_connected: true, message: 'WhatsApp já está conectado!' });
      }

      const qrCode = apiData.instance?.qrcode;
      if (!qrCode) throw new Error('QR Code não foi gerado pela API');

      const updatedInstance = await prisma.whatsappInstance.update({
        where: { id: instance_id },
        data: { status: apiData.instance?.status || 'connecting', qrCode, metadata: apiData, errorMessage: null },
      });

      return jsonResponse({ success: true, data: updatedInstance, message: 'QR Code gerado com sucesso' });
    }

    if (action === 'disconnect') {
      if (!instance_id) throw new Error('instance_id é obrigatório para disconnect');
      const targetInstance = await prisma.whatsappInstance.findFirst({ where: { id: instance_id, companyId: company_id } });
      if (!targetInstance) {
        // Polling pode pegar IDs stale (instancia recriada/migrada).
        // Retornamos 404 limpo em vez de throw — evita poluir log com stack trace.
        return jsonResponse({ success: false, error: 'Instância não encontrada', code: 'INSTANCE_NOT_FOUND' }, 404);
      }

      if (targetInstance.instanceApiKey) {
        try { await fetch(`${targetInstance.apiUrl}/instance/logout`, { method: 'DELETE', headers: { 'Accept': 'application/json', 'token': targetInstance.instanceApiKey } }); } catch (e) { console.error('Logout error:', e); }
      }

      const updatedInstance = await prisma.whatsappInstance.update({ where: { id: instance_id }, data: { status: 'disconnected', qrCode: null } });
      return jsonResponse({ success: true, data: updatedInstance, message: 'Instância desconectada' });
    }

    if (action === 'delete') {
      if (!instance_id) throw new Error('instance_id é obrigatório para delete');
      const targetInstance = await prisma.whatsappInstance.findFirst({ where: { id: instance_id, companyId: company_id } });
      if (!targetInstance) {
        // Polling pode pegar IDs stale (instancia recriada/migrada).
        // Retornamos 404 limpo em vez de throw — evita poluir log com stack trace.
        return jsonResponse({ success: false, error: 'Instância não encontrada', code: 'INSTANCE_NOT_FOUND' }, 404);
      }

      try { await fetch(`${targetInstance.apiUrl}/instance`, { method: 'DELETE', headers: { 'Accept': 'application/json', 'token': targetInstance.instanceApiKey || '' } }); } catch (e) { console.error('Delete API error:', e); }

      await prisma.whatsappInstance.delete({ where: { id: instance_id } });
      return jsonResponse({ success: true, message: 'Instância excluída com sucesso' });
    }

    if (action === 'update') {
      if (!instance_id) throw new Error('instance_id é obrigatório para update');
      const targetInstance = await prisma.whatsappInstance.findFirst({ where: { id: instance_id, companyId: company_id } });
      if (!targetInstance) {
        // Polling pode pegar IDs stale (instancia recriada/migrada).
        // Retornamos 404 limpo em vez de throw — evita poluir log com stack trace.
        return jsonResponse({ success: false, error: 'Instância não encontrada', code: 'INSTANCE_NOT_FOUND' }, 404);
      }

      let updatedStatus = targetInstance.status;
      let apiMetadata = targetInstance.metadata;

      if (targetInstance.instanceApiKey) {
        try {
          const statusResponse = await fetch(`${targetInstance.apiUrl}/instance/status`, { method: 'GET', headers: { 'Accept': 'application/json', 'token': targetInstance.instanceApiKey || '' } });
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            const apiStatus = statusData.instance?.status;
            const hasStatusObject = typeof statusData.status === 'object' && statusData.status !== null;
            const isLoggedIn = hasStatusObject ? statusData.status?.loggedIn === true : false;
            const isConnected = hasStatusObject ? statusData.status?.connected === true : false;

            let connectedPhone: string | null = null;
            for (const source of [statusData.instance?.phone, statusData.instance?.me, statusData.instance?.owner, statusData.status?.jid, statusData.phone, statusData.owner]) {
              if (source && typeof source === 'string' && source.length > 5) {
                connectedPhone = source.replace(/@.*$/, '').replace(/\D/g, '');
                if (connectedPhone.length >= 10) break;
                connectedPhone = null;
              }
            }

            // Preserva catalogBusinessId se já estava salvo no metadata
            const existingMeta = (targetInstance.metadata as Record<string, unknown>) || {};
            apiMetadata = { ...statusData, connected_phone: connectedPhone, ...(existingMeta.catalogBusinessId ? { catalogBusinessId: existingMeta.catalogBusinessId } : {}) };

            if (hasStatusObject) {
              updatedStatus = isLoggedIn ? 'connected' : isConnected ? 'connecting' : (apiStatus === 'connecting' || apiStatus === 'qrcode') ? 'connecting' : 'disconnected';
            } else {
              updatedStatus = (apiStatus === 'connected' || apiStatus === 'open') ? 'connected' : (apiStatus === 'connecting' || apiStatus === 'qrcode') ? 'connecting' : 'disconnected';
            }
          }
        } catch (e) { console.error('Status fetch error:', e); }
      }

      const updatedInstance = await prisma.whatsappInstance.update({
        where: { id: instance_id },
        data: { status: updatedStatus, metadata: apiMetadata ?? undefined, ...(updatedStatus === 'connected' ? { qrCode: null } : {}) },
      });

      return jsonResponse({ success: true, data: updatedInstance, message: 'Status atualizado' });
    }

    throw new Error('Ação inválida');
  } catch (error) {
    return handleApiErrorCors(error, 'Error')
  }
}
