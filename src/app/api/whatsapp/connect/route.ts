import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

interface WhatsAppRequest {
  action: 'connect' | 'reconnect' | 'disconnect' | 'delete' | 'update';
  company_id: string;
  instance_id?: string;
}

const WHATSAPP_API_URL = process.env.UAZAPI_BASE_URL || 'https://heysolut.uazapi.com';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    const { agentId, companyId: authCompanyId } = await authenticate(req);

    const ADMIN_TOKEN = process.env.WHATSAPP_ADMIN_TOKEN;
    if (!ADMIN_TOKEN) throw new Error('WHATSAPP_ADMIN_TOKEN não configurado');

    const { action, company_id, instance_id }: WhatsAppRequest = await req.json();
    console.log(`Action: ${action} for company: ${company_id}`);

    // With Bearer: allow super_admin to manage any company, others only their own
    // With API key: only the company that owns the key
    if (agentId) {
      const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: agentId, _role: 'super_admin' });
      if (!isSuperAdmin && authCompanyId !== company_id) throw new Error('Acesso negado a esta empresa');
    } else if (authCompanyId !== company_id) {
      throw new Error('Acesso negado a esta empresa');
    }

    const { data: company } = await supabase.from('companies').select('name').eq('id', company_id).single();
    if (!company) throw new Error('Empresa não encontrada');

    const generateInstanceName = (companyName: string): string =>
      companyName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const instance_name = generateInstanceName(company.name);

    const { data: existingInstance } = await supabase.from('whatsapp_instances').select('*').eq('company_id', company_id).single();

    if (action === 'connect') {
      if (existingInstance) {
        if (!existingInstance.instance_api_key) throw new Error('Instância existente sem API Key. Exclua e crie novamente.');

        const reconnResponse = await fetch(`${existingInstance.api_url}/instance/connect`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': existingInstance.instance_api_key },
          body: JSON.stringify({ phone: '' }),
        });

        if (reconnResponse.status === 409) {
          const statusResp = await fetch(`${existingInstance.api_url}/instance/status`, {
            method: 'GET', headers: { 'Accept': 'application/json', 'token': existingInstance.instance_api_key },
          });
          if (statusResp.ok) {
            const statusData = await statusResp.json();
            const isConnected = statusData.status?.connected === true || statusData.status?.loggedIn === true;
            if (isConnected) {
              await supabase.from('whatsapp_instances').update({ status: 'connected', qr_code: null, error_message: null }).eq('id', existingInstance.id);
              return jsonResponse({ success: true, already_connected: true, message: 'WhatsApp já está conectado!' });
            }
            const existingQR = statusData.instance?.qrcode || statusData.qrcode;
            if (existingQR && existingQR.length > 50) {
              await supabase.from('whatsapp_instances').update({ status: 'connecting', qr_code: existingQR, error_message: null }).eq('id', existingInstance.id);
              return jsonResponse({ success: true, data: { ...existingInstance, qr_code: existingQR, status: 'connecting' }, message: 'QR Code recuperado' });
            }
          }
          throw new Error('Não foi possível gerar QR Code. Tente excluir a instância e criar novamente.');
        }

        if (!reconnResponse.ok) throw new Error(`Erro ao reconectar instância: ${reconnResponse.status}`);

        const reconnData = await reconnResponse.json();
        if (reconnData.loggedIn === true) {
          await supabase.from('whatsapp_instances').update({ status: 'connected', qr_code: null, metadata: reconnData }).eq('id', existingInstance.id);
          return jsonResponse({ success: true, already_connected: true, message: 'WhatsApp já está conectado!' });
        }

        const reconnQR = reconnData.instance?.qrcode;
        if (!reconnQR) throw new Error('QR Code não foi gerado pela API');

        await supabase.from('whatsapp_instances').update({ status: 'connecting', qr_code: reconnQR, metadata: reconnData, error_message: null }).eq('id', existingInstance.id);
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

      const { data: newInstance, error: insertError } = await supabase.from('whatsapp_instances').insert({
        company_id, instance_name, api_url: WHATSAPP_API_URL, instance_api_key: instanceToken, status: 'connecting', qr_code: null, metadata: apiData,
      }).select().single();
      if (insertError) throw insertError;

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
          if (qrCode) await supabase.from('whatsapp_instances').update({ qr_code: qrCode, status: 'connecting' }).eq('id', newInstance.id);
        }
      } catch (e) { console.error('Connect error:', e); }

      return jsonResponse({ success: true, data: { ...newInstance, qr_code: qrCode }, message: 'Instância criada com sucesso', show_qr_modal: true });
    }

    if (action === 'reconnect') {
      if (!instance_id) throw new Error('instance_id é obrigatório para reconnect');

      const { data: targetInstance } = await supabase.from('whatsapp_instances').select('*').eq('id', instance_id).eq('company_id', company_id).single();
      if (!targetInstance) throw new Error('Instância não encontrada');
      if (!targetInstance.instance_api_key) throw new Error('API Key não encontrada');

      const response = await fetch(`${targetInstance.api_url}/instance/connect`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': targetInstance.instance_api_key },
        body: JSON.stringify({ phone: '' }),
      });

      if (response.status === 409) {
        const statusResponse = await fetch(`${targetInstance.api_url}/instance/status`, { method: 'GET', headers: { 'Accept': 'application/json', 'token': targetInstance.instance_api_key } });
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const hasStatusObject = typeof statusData.status === 'object' && statusData.status !== null;
          const isLoggedIn = hasStatusObject ? statusData.status?.loggedIn === true : false;
          const isConnected = hasStatusObject ? statusData.status?.connected === true : false;
          const shouldTreatAsConnected = hasStatusObject ? (isLoggedIn || isConnected) : (statusData.instance?.status === 'connected' || statusData.instance?.status === 'open');

          if (shouldTreatAsConnected) {
            await supabase.from('whatsapp_instances').update({ status: 'connected', qr_code: null, error_message: null }).eq('id', instance_id);
            return jsonResponse({ success: true, already_connected: true, message: 'WhatsApp já está conectado!' });
          }
          const existingQR = statusData.instance?.qrcode || statusData.qrcode;
          if (existingQR && existingQR.length > 50) {
            await supabase.from('whatsapp_instances').update({ status: 'connecting', qr_code: existingQR, error_message: null }).eq('id', instance_id);
            return jsonResponse({ success: true, data: { ...targetInstance, qr_code: existingQR, status: 'connecting' }, message: 'QR Code recuperado' });
          }
        }

        // Restart and retry
        await fetch(`${targetInstance.api_url}/instance/restart`, { method: 'PUT', headers: { 'Accept': 'application/json', 'token': targetInstance.instance_api_key } });
        await new Promise(resolve => setTimeout(resolve, 3000));

        const retryResponse = await fetch(`${targetInstance.api_url}/instance/connect`, {
          method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'token': targetInstance.instance_api_key },
          body: JSON.stringify({ phone: '' }),
        });

        if (retryResponse.ok || retryResponse.status === 409) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const finalStatusResponse = await fetch(`${targetInstance.api_url}/instance/status`, { method: 'GET', headers: { 'Accept': 'application/json', 'token': targetInstance.instance_api_key } });
          if (finalStatusResponse.ok) {
            const finalData = await finalStatusResponse.json();
            const qrCode = finalData.instance?.qrcode || finalData.qrcode;
            if (qrCode && qrCode.length > 50) {
              await supabase.from('whatsapp_instances').update({ status: 'connecting', qr_code: qrCode, error_message: null }).eq('id', instance_id);
              return jsonResponse({ success: true, data: { ...targetInstance, qr_code: qrCode, status: 'connecting' }, message: 'QR Code gerado após restart' });
            }
          }
        }

        if (targetInstance.qr_code && targetInstance.qr_code.length > 50) {
          return jsonResponse({ success: true, data: targetInstance, message: 'Usando QR Code existente' });
        }
        throw new Error('Não foi possível gerar QR Code. Tente excluir a instância e criar novamente.');
      }

      if (!response.ok) throw new Error(`Erro ao conectar instância: ${response.status}`);

      const apiData = await response.json();
      if (apiData.loggedIn === true) {
        await supabase.from('whatsapp_instances').update({ status: 'connected', qr_code: null, metadata: apiData }).eq('id', instance_id);
        return jsonResponse({ success: true, already_connected: true, message: 'WhatsApp já está conectado!' });
      }

      const qrCode = apiData.instance?.qrcode;
      if (!qrCode) throw new Error('QR Code não foi gerado pela API');

      const { data: updatedInstance, error: updateError } = await supabase.from('whatsapp_instances')
        .update({ status: apiData.instance?.status || 'connecting', qr_code: qrCode, metadata: apiData, error_message: null })
        .eq('id', instance_id).select().single();
      if (updateError) throw updateError;

      return jsonResponse({ success: true, data: updatedInstance, message: 'QR Code gerado com sucesso' });
    }

    if (action === 'disconnect') {
      if (!instance_id) throw new Error('instance_id é obrigatório para disconnect');
      const { data: targetInstance } = await supabase.from('whatsapp_instances').select('*').eq('id', instance_id).eq('company_id', company_id).single();
      if (!targetInstance) throw new Error('Instância não encontrada');

      if (targetInstance.instance_api_key) {
        try { await fetch(`${targetInstance.api_url}/instance/logout`, { method: 'DELETE', headers: { 'Accept': 'application/json', 'token': targetInstance.instance_api_key } }); } catch (e) { console.error('Logout error:', e); }
      }

      const { data: updatedInstance, error: updateError } = await supabase.from('whatsapp_instances').update({ status: 'disconnected', qr_code: null }).eq('id', instance_id).select().single();
      if (updateError) throw updateError;
      return jsonResponse({ success: true, data: updatedInstance, message: 'Instância desconectada' });
    }

    if (action === 'delete') {
      if (!instance_id) throw new Error('instance_id é obrigatório para delete');
      const { data: targetInstance } = await supabase.from('whatsapp_instances').select('*').eq('id', instance_id).eq('company_id', company_id).single();
      if (!targetInstance) throw new Error('Instância não encontrada');

      try { await fetch(`${targetInstance.api_url}/instance`, { method: 'DELETE', headers: { 'Accept': 'application/json', 'token': targetInstance.instance_api_key } }); } catch (e) { console.error('Delete API error:', e); }

      const { error: deleteError } = await supabase.from('whatsapp_instances').delete().eq('id', instance_id);
      if (deleteError) throw deleteError;
      return jsonResponse({ success: true, message: 'Instância excluída com sucesso' });
    }

    if (action === 'update') {
      if (!instance_id) throw new Error('instance_id é obrigatório para update');
      const { data: targetInstance } = await supabase.from('whatsapp_instances').select('*').eq('id', instance_id).eq('company_id', company_id).single();
      if (!targetInstance) throw new Error('Instância não encontrada');

      let updatedStatus = targetInstance.status;
      let apiMetadata = targetInstance.metadata;

      if (targetInstance.instance_api_key) {
        try {
          const statusResponse = await fetch(`${targetInstance.api_url}/instance/status`, { method: 'GET', headers: { 'Accept': 'application/json', 'token': targetInstance.instance_api_key } });
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

            apiMetadata = { ...statusData, connected_phone: connectedPhone };

            if (hasStatusObject) {
              updatedStatus = isLoggedIn ? 'connected' : isConnected ? 'connecting' : (apiStatus === 'connecting' || apiStatus === 'qrcode') ? 'connecting' : 'disconnected';
            } else {
              updatedStatus = (apiStatus === 'connected' || apiStatus === 'open') ? 'connected' : (apiStatus === 'connecting' || apiStatus === 'qrcode') ? 'connecting' : 'disconnected';
            }
          }
        } catch (e) { console.error('Status fetch error:', e); }
      }

      const { data: updatedInstance, error: updateError } = await supabase.from('whatsapp_instances')
        .update({ status: updatedStatus, metadata: apiMetadata, ...(updatedStatus === 'connected' ? { qr_code: null } : {}) })
        .eq('id', instance_id).select().single();
      if (updateError) throw updateError;

      return jsonResponse({ success: true, data: updatedInstance, message: 'Status atualizado' });
    }

    throw new Error('Ação inválida');
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }, 400);
  }
}
