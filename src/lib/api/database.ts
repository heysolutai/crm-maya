import { createAdminClient } from '@/lib/supabase/admin';
import type { WhatsAppInstance } from './types';

function getSupabase() {
  return createAdminClient();
}

export async function getWhatsAppInstance(companyId: string): Promise<WhatsAppInstance> {
  const supabase = getSupabase();
  const { data: instance, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single();

  if (error || !instance) {
    throw new Error(`WhatsApp instance not found for company ${companyId}`);
  }

  return instance;
}

export async function findOrCreateConversation(
  phone: string,
  companyId: string
): Promise<string> {
  const supabase = getSupabase();
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  // Buscar cliente por phone OU whatsapp_lid (LID do WhatsApp)
  // Prioriza o mais antigo para evitar duplicatas
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .eq('company_id', companyId)
    .or(`phone.eq.${cleanPhone},whatsapp_lid.eq.${cleanPhone}`)
    .order('created_at', { ascending: true })
    .limit(1);

  let client = clients?.[0] || null;

  if (!client) {
    const { data: newClient } = await supabase
      .from('clients')
      .insert({
        phone: cleanPhone,
        company_id: companyId,
        first_name: cleanPhone,
        source: 'whatsapp',
      })
      .select('id')
      .single();

    client = newClient;
  }

  if (!client) {
    throw new Error('Failed to find or create client');
  }

  let { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('client_id', client.id)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    const { data: newConversation } = await supabase
      .from('conversations')
      .insert({
        client_id: client.id,
        company_id: companyId,
        status: 'active',
        channel: 'whatsapp',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    conversation = newConversation;
  }

  if (!conversation) {
    throw new Error('Failed to find or create conversation');
  }

  return conversation.id;
}

export async function saveMessage(
  conversationId: string,
  messageText: string,
  messageType: string,
  fromAI: boolean,
  agentId: string | null,
  mediaUrl?: string,
  metadata?: any
) {
  const supabase = getSupabase();
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: fromAI ? 'ai' : 'agent',
      sender_id: fromAI ? null : agentId,
      message_text: messageText,
      message_type: messageType,
      media_url: mediaUrl,
      read_status: 'sent',
      metadata: {
        ...metadata,
        ai_generated: fromAI,
        processed_by: fromAI ? 'ai_system' : 'agent',
        sent_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (error || !message) {
    console.error('[Database] Error saving message:', error);
    throw new Error('Failed to save message to database');
  }

  return message;
}

export async function updateMessageMetadata(messageId: string, metadata: any) {
  const supabase = getSupabase();
  // Fetch current metadata and merge
  const { data: existing } = await supabase
    .from('messages')
    .select('metadata')
    .eq('id', messageId)
    .single();
  const merged = { ...((existing?.metadata as any) || {}), ...metadata };
  await supabase
    .from('messages')
    .update({ metadata: merged as any })
    .eq('id', messageId);
}

export async function getUAZMessageId(messageId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('messages')
    .select('uaz_message_id')
    .eq('id', messageId)
    .maybeSingle();

  return data?.uaz_message_id || null;
}

export async function getClientPhoneByConversationId(conversationId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('conversations')
    .select('client_id')
    .eq('id', conversationId)
    .single();

  if (!data?.client_id) return null;

  const { data: client } = await supabase
    .from('clients')
    .select('phone')
    .eq('id', data.client_id)
    .single();

  return client?.phone || null;
}

export async function assignNextAgent(companyId: string): Promise<string | null> {
  const supabase = getSupabase();
  try {
    const { data: agents, error: agentsError } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (agentsError || !agents || agents.length === 0) {
      console.log('[Round-Robin] No active agents found for company:', companyId);
      return null;
    }

    const validRoles = ['agent', 'manager', 'company_admin'] as const;
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', agents.map(a => a.id))
      .in('role', validRoles);

    if (!rolesData || rolesData.length === 0) {
      console.log('[Round-Robin] No agents with valid roles found');
      return null;
    }

    const agentIds = [...new Set(rolesData.map(r => r.user_id))].sort();

    if (agentIds.length === 0) {
      return null;
    }

    const { data: state } = await supabase
      .from('lead_distribution_state')
      .select('last_assigned_user_id')
      .eq('company_id', companyId)
      .maybeSingle();

    let nextIndex = 0;
    if (state?.last_assigned_user_id) {
      const lastIndex = agentIds.indexOf(state.last_assigned_user_id);
      nextIndex = (lastIndex + 1) % agentIds.length;
    }

    const nextAgentId = agentIds[nextIndex];

    await supabase
      .from('lead_distribution_state')
      .upsert({
        company_id: companyId,
        last_assigned_user_id: nextAgentId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id' });

    console.log('[Round-Robin] Assigned agent:', nextAgentId, 'index:', nextIndex, 'of', agentIds.length);
    return nextAgentId;
  } catch (error) {
    console.error('[Round-Robin] Error:', error);
    return null;
  }
}

export async function assignNextAgentInDepartment(
  companyId: string,
  departmentId: string
): Promise<string | null> {
  const supabase = getSupabase();
  try {
    // 1. Get department members
    const { data: members, error: membersError } = await supabase
      .from('department_members')
      .select('user_id')
      .eq('department_id', departmentId);

    if (membersError || !members || members.length === 0) {
      console.log('[Dept Round-Robin] No members in department:', departmentId);
      return null;
    }

    const memberUserIds = members.map(m => m.user_id);

    // 2. Filter by is_active = true AND is_online = true
    const { data: onlineAgents, error: agentsError } = await supabase
      .from('users')
      .select('id')
      .in('id', memberUserIds)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('is_online', true)
      .order('id', { ascending: true });

    if (agentsError || !onlineAgents || onlineAgents.length === 0) {
      console.log('[Dept Round-Robin] No online active agents in department:', departmentId);
      return null;
    }

    // 3. Filter by valid roles
    const validRoles = ['agent', 'manager', 'company_admin'] as const;
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', onlineAgents.map(a => a.id))
      .in('role', validRoles);

    if (!rolesData || rolesData.length === 0) {
      console.log('[Dept Round-Robin] No agents with valid roles online in department:', departmentId);
      return null;
    }

    const agentIds = [...new Set(rolesData.map(r => r.user_id))].sort();
    if (agentIds.length === 0) return null;

    // 4. Get department-specific round-robin state
    const { data: state } = await supabase
      .from('lead_distribution_state')
      .select('last_assigned_user_id')
      .eq('company_id', companyId)
      .eq('department_id', departmentId)
      .maybeSingle();

    let nextIndex = 0;
    if (state?.last_assigned_user_id) {
      const lastIndex = agentIds.indexOf(state.last_assigned_user_id);
      nextIndex = (lastIndex + 1) % agentIds.length;
    }

    const nextAgentId = agentIds[nextIndex];

    // 5. Upsert department-specific state
    if (state) {
      await supabase
        .from('lead_distribution_state')
        .update({
          last_assigned_user_id: nextAgentId,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
        .eq('department_id', departmentId);
    } else {
      await supabase
        .from('lead_distribution_state')
        .insert({
          company_id: companyId,
          department_id: departmentId,
          last_assigned_user_id: nextAgentId,
          updated_at: new Date().toISOString(),
        });
    }

    console.log('[Dept Round-Robin] Assigned agent:', nextAgentId, 'in dept:', departmentId, 'index:', nextIndex, 'of', agentIds.length);
    return nextAgentId;
  } catch (error) {
    console.error('[Dept Round-Robin] Error:', error);
    return null;
  }
}

export async function pauseClientAIByConversation(conversationId: string): Promise<boolean> {
  const supabase = getSupabase();
  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('client_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation?.client_id) {
      console.warn('[AI Pause] No client found for conversation:', conversationId);
      return false;
    }

    const { error } = await supabase
      .from('clients')
      .update({ ai_paused: true })
      .eq('id', conversation.client_id);

    if (error) {
      console.error('[AI Pause] Error pausing AI:', error);
      return false;
    }

    console.log('[AI Pause] AI automatically paused for client:', conversation.client_id);
    return true;
  } catch (error) {
    console.error('[AI Pause] Exception:', error);
    return false;
  }
}
