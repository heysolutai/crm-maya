export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_configurations: {
        Row: {
          api_keys: Json | null
          behavior_settings: Json | null
          company_id: string
          conditions: Json | null
          created_at: string | null
          created_by: string
          follow_up_enabled: boolean
          follow_up_stages: Json | null
          id: string
          is_active: boolean | null
          knowledge: string | null
          memory_key: string | null
          n8n_webhook_url: string | null
          name: string
          prompts: Json | null
          updated_at: string | null
          variables: Json | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          api_keys?: Json | null
          behavior_settings?: Json | null
          company_id: string
          conditions?: Json | null
          created_at?: string | null
          created_by: string
          follow_up_enabled?: boolean
          follow_up_stages?: Json | null
          id?: string
          is_active?: boolean | null
          knowledge?: string | null
          memory_key?: string | null
          n8n_webhook_url?: string | null
          name: string
          prompts?: Json | null
          updated_at?: string | null
          variables?: Json | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          api_keys?: Json | null
          behavior_settings?: Json | null
          company_id?: string
          conditions?: Json | null
          created_at?: string | null
          created_by?: string
          follow_up_enabled?: boolean
          follow_up_stages?: Json | null
          id?: string
          is_active?: boolean | null
          knowledge?: string | null
          memory_key?: string | null
          n8n_webhook_url?: string | null
          name?: string
          prompts?: Json | null
          updated_at?: string | null
          variables?: Json | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_configurations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_configurations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ai_configurations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_configurations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_configurations_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_token_usage: {
        Row: {
          client_id: string | null
          company_id: string
          conversation_id: string | null
          created_at: string | null
          id: string
          input_cost: number | null
          input_tokens: number
          message_id: string | null
          metadata: Json | null
          model: string
          output_cost: number | null
          output_tokens: number
          provider: string
          request_type: string | null
          total_cost: number | null
          total_tokens: number
        }
        Insert: {
          client_id?: string | null
          company_id: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          input_cost?: number | null
          input_tokens?: number
          message_id?: string | null
          metadata?: Json | null
          model: string
          output_cost?: number | null
          output_tokens?: number
          provider: string
          request_type?: string | null
          total_cost?: number | null
          total_tokens?: number
        }
        Update: {
          client_id?: string | null
          company_id?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          input_cost?: number | null
          input_tokens?: number
          message_id?: string | null
          metadata?: Json | null
          model?: string
          output_cost?: number | null
          output_tokens?: number
          provider?: string
          request_type?: string | null
          total_cost?: number | null
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_token_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_token_usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_token_usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ai_token_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_token_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "v_active_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_token_usage_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily: {
        Row: {
          company_id: string
          created_at: string | null
          date: string
          id: string
          metrics: Json
        }
        Insert: {
          company_id: string
          created_at?: string | null
          date: string
          id?: string
          metrics?: Json
        }
        Update: {
          company_id?: string
          created_at?: string | null
          date?: string
          id?: string
          metrics?: Json
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      api_keys: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key: string
          last_used_at: string | null
          name: string
          permissions: Json | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key: string
          last_used_at?: string | null
          name: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key?: string
          last_used_at?: string | null
          name?: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      appointments: {
        Row: {
          assigned_to: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          google_event_id: string | null
          id: string
          location: string | null
          meeting_url: string | null
          metadata: Json | null
          notes: string | null
          patient_name: string | null
          reminder_sent: boolean | null
          reminder_sent_at: string | null
          scheduled_for: string
          status: Database["public"]["Enums"]["appointment_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          notes?: string | null
          patient_name?: string | null
          reminder_sent?: boolean | null
          reminder_sent_at?: string | null
          scheduled_for: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          notes?: string | null
          patient_name?: string | null
          reminder_sent?: boolean | null
          reminder_sent_at?: string | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_otica_2: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      client_funnel_history: {
        Row: {
          client_id: string
          duration_minutes: number | null
          entered_at: string | null
          id: string
          left_at: string | null
          moved_by: string | null
          notes: string | null
          stage_id: string
        }
        Insert: {
          client_id: string
          duration_minutes?: number | null
          entered_at?: string | null
          id?: string
          left_at?: string | null
          moved_by?: string | null
          notes?: string | null
          stage_id: string
        }
        Update: {
          client_id?: string
          duration_minutes?: number | null
          entered_at?: string | null
          id?: string
          left_at?: string | null
          moved_by?: string | null
          notes?: string | null
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_funnel_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_funnel_history_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_funnel_history_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_funnel_history_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          client_id: string
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          note: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          note: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "client_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: Json | null
          ai_paused: boolean | null
          assigned_to: string | null
          avatar_url: string | null
          birth_date: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          custom_fields: Json | null
          document_number: string | null
          email: string | null
          first_name: string
          full_name: string | null
          gender: string | null
          id: string
          is_active: boolean | null
          last_name: string | null
          phone: string | null
          secondary_phone: string | null
          source: string | null
          pipeline_id: string | null
          stage_id: string | null
          tags: string[] | null
          updated_at: string | null
          whatsapp_lid: string | null
        }
        Insert: {
          address?: Json | null
          ai_paused?: boolean | null
          assigned_to?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          document_number?: string | null
          email?: string | null
          first_name: string
          full_name?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          phone?: string | null
          pipeline_id?: string | null
          secondary_phone?: string | null
          source?: string | null
          stage_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          whatsapp_lid?: string | null
        }
        Update: {
          address?: Json | null
          ai_paused?: boolean | null
          assigned_to?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          document_number?: string | null
          email?: string | null
          first_name?: string
          full_name?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          phone?: string | null
          pipeline_id?: string | null
          secondary_phone?: string | null
          source?: string | null
          stage_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          whatsapp_lid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: Json | null
          created_at: string | null
          document_number: string | null
          email: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          phone: string | null
          plan_id: string | null
          settings: Json | null
          subscription_expires_at: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          trade_name: string | null
          trial_ends_at: string | null
          updated_at: string | null
          whatsapp_instance_name: string | null
        }
        Insert: {
          address?: Json | null
          created_at?: string | null
          document_number?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          phone?: string | null
          plan_id?: string | null
          settings?: Json | null
          subscription_expires_at?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          trade_name?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          whatsapp_instance_name?: string | null
        }
        Update: {
          address?: Json | null
          created_at?: string | null
          document_number?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          phone?: string | null
          plan_id?: string | null
          settings?: Json | null
          subscription_expires_at?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          trade_name?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          whatsapp_instance_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      company_faqs: {
        Row: {
          answer: string
          category: string | null
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          keywords: string[] | null
          order_position: number | null
          question: string
          updated_at: string | null
        }
        Insert: {
          answer: string
          category?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          order_position?: number | null
          question: string
          updated_at?: string | null
        }
        Update: {
          answer?: string
          category?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          order_position?: number | null
          question?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_faqs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_faqs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      configuração_padrão: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      conversation_notes: {
        Row: {
          company_id: string
          conversation_id: string
          created_at: string | null
          created_by: string
          id: string
          note: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          conversation_id: string
          created_at?: string | null
          created_by: string
          id?: string
          note: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          conversation_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          note?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "v_active_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_handled: boolean | null
          channel: Database["public"]["Enums"]["communication_channel"]
          client_id: string
          company_id: string
          created_at: string | null
          department_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          friendly_id: string | null
          id: string
          metadata: Json | null
          satisfaction_score: number | null
          stage: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["conversation_status"] | null
          summary: string | null
          tags: string[] | null
          transferred_to: string | null
          updated_at: string | null
        }
        Insert: {
          ai_handled?: boolean | null
          channel: Database["public"]["Enums"]["communication_channel"]
          client_id: string
          company_id: string
          created_at?: string | null
          department_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          friendly_id?: string | null
          id?: string
          metadata?: Json | null
          satisfaction_score?: number | null
          stage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"] | null
          summary?: string | null
          tags?: string[] | null
          transferred_to?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_handled?: boolean | null
          channel?: Database["public"]["Enums"]["communication_channel"]
          client_id?: string
          company_id?: string
          created_at?: string | null
          department_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          friendly_id?: string | null
          id?: string
          metadata?: Json | null
          satisfaction_score?: number | null
          stage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"] | null
          summary?: string | null
          tags?: string[] | null
          transferred_to?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "conversations_transferred_to_fkey"
            columns: ["transferred_to"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_transferred_to_fkey"
            columns: ["transferred_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          crm_entries: number | null
          crm_scheduled: number | null
          crm_scheduled_today: number | null
          id: string
          manual_attended: number | null
          manual_entries: number | null
          manual_scheduled: number | null
          manual_scheduled_today: number | null
          report_date: string
          sales_ids: string[] | null
          sales_total: number | null
          sent_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          crm_entries?: number | null
          crm_scheduled?: number | null
          crm_scheduled_today?: number | null
          id?: string
          manual_attended?: number | null
          manual_entries?: number | null
          manual_scheduled?: number | null
          manual_scheduled_today?: number | null
          report_date?: string
          sales_ids?: string[] | null
          sales_total?: number | null
          sent_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          crm_entries?: number | null
          crm_scheduled?: number | null
          crm_scheduled_today?: number | null
          id?: string
          manual_attended?: number | null
          manual_entries?: number | null
          manual_scheduled?: number | null
          manual_scheduled_today?: number | null
          report_date?: string
          sales_ids?: string[] | null
          sales_total?: number | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      follow_up_jobs: {
        Row: {
          attempts: number
          client_id: string
          company_id: string
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          last_attempt_at: string | null
          message_text: string
          scheduled_for: string
          stage_order: number
          status: string
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          attempts?: number
          client_id: string
          company_id: string
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          message_text: string
          scheduled_for: string
          stage_order: number
          status?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          attempts?: number
          client_id?: string
          company_id?: string
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          message_text?: string
          scheduled_for?: string
          stage_order?: number
          status?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "follow_up_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "v_active_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_jobs_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_final: boolean | null
          name: string
          order_position: number
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_final?: boolean | null
          name: string
          order_position: number
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_final?: boolean | null
          name?: string
          order_position?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      departments: {
        Row: {
          id: string
          company_id: string
          name: string
          description: string | null
          color: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          description?: string | null
          color?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          description?: string | null
          color?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      department_members: {
        Row: {
          id: string
          department_id: string
          user_id: string
          role: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          department_id: string
          user_id: string
          role?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          department_id?: string
          user_id?: string
          role?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          id: string
          company_id: string
          department_id: string | null
          name: string
          description: string | null
          color: string | null
          is_default: boolean | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          department_id?: string | null
          name: string
          description?: string | null
          color?: string | null
          is_default?: boolean | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          department_id?: string | null
          name?: string
          description?: string | null
          color?: string | null
          is_default?: boolean | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          id: string
          pipeline_id: string
          name: string
          description: string | null
          color: string | null
          order_position: number
          is_default: boolean | null
          is_final: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          pipeline_id: string
          name: string
          description?: string | null
          color?: string | null
          order_position: number
          is_default?: boolean | null
          is_final?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          pipeline_id?: string
          name?: string
          description?: string | null
          color?: string | null
          order_position?: number
          is_default?: boolean | null
          is_final?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          access_token: string
          calendar_id: string
          calendar_name: string
          company_id: string
          connected_email: string | null
          create_meet_links: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          refresh_token: string
          sync_enabled: boolean | null
          token_expires_at: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          calendar_id: string
          calendar_name: string
          company_id: string
          connected_email?: string | null
          create_meet_links?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          refresh_token: string
          sync_enabled?: boolean | null
          token_expires_at: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          calendar_id?: string
          calendar_name?: string
          company_id?: string
          connected_email?: string | null
          create_meet_links?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          refresh_token?: string
          sync_enabled?: boolean | null
          token_expires_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      know_centraldosoculos: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_clinicafocovisao: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_cllinicaverbem: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_familiaotica: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_gabrielclinica: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_gabrielteste: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_logicsellai: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_lucasgestor: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_matrizoticameninadosolhos: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_miletoinfoprodutoraiz: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_opticasaldanha: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_otica2: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticabreno: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticacarolsaomiguelpaulista: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticadglass: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticaellys: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticaemunah: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticagomes: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticairacema: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticalandvision: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticamancinni: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticamancinniexame: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticameninadosolhos: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticamillys: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticapremium: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticaprime: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticareis: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticareiseclinicafocovisao: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticascabofriense: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticasdeise: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticashouse: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticasola: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticasprecobom: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticasvictoria: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticaviarico: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticavideres: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_oticavivazz: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_planettascotters: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_projetoinstitutovisao: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_trafegopagoclimatizacao: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_trafegopagothales: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      know_vpaotica: {
        Row: {
          embedding: string | null
          id: string
          metadata: Json | null
          text: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text?: string | null
        }
        Relationships: []
      }
      lead_distribution_state: {
        Row: {
          company_id: string
          department_id: string | null
          id: string
          last_assigned_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          department_id?: string | null
          id?: string
          last_assigned_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          department_id?: string | null
          id?: string
          last_assigned_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_distribution_state_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_distribution_state_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      memory_centraldosoculos: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_clinicafocovisao: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_cllinicaverbem: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_familiaotica: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_gabrielclinica: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_gabrielteste: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_legadoreal: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_logicsell: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_lucasgestor: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_miletoinfoprodutoraiz: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_opticasaldanha: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticabreno: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticacarolsaomiguelpaulista: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticadglass: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticaemunah: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticagomes: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticairacema: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticalandvision: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticalegadoreal: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticamancinni: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticamancinniexame: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticameninadosolhos: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticamillys: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticapremium: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticaprime: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticareis: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticascabofriense: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticasdeise: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticasello: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticasemunah: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticashouse: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticasola: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticasprecobom: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticaviarico: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticavideres: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_oticavivazz: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_trafegopagoclimatizacao: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_trafegopagothales: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      memory_vpaotica: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_confidence: number | null
          conversation_id: string
          created_at: string | null
          id: string
          intent_detected: string | null
          is_read: boolean | null
          media_url: string | null
          message_text: string
          message_type: string | null
          metadata: Json | null
          quoted_message_id: string | null
          read_at: string | null
          read_status: string | null
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          sentiment: string | null
          uaz_message_id: string | null
        }
        Insert: {
          ai_confidence?: number | null
          conversation_id: string
          created_at?: string | null
          id?: string
          intent_detected?: string | null
          is_read?: boolean | null
          media_url?: string | null
          message_text: string
          message_type?: string | null
          metadata?: Json | null
          quoted_message_id?: string | null
          read_at?: string | null
          read_status?: string | null
          sender_id?: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          sentiment?: string | null
          uaz_message_id?: string | null
        }
        Update: {
          ai_confidence?: number | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          intent_detected?: string | null
          is_read?: boolean | null
          media_url?: string | null
          message_text?: string
          message_type?: string | null
          metadata?: Json | null
          quoted_message_id?: string | null
          read_at?: string | null
          read_status?: string | null
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["sender_type"]
          sentiment?: string | null
          uaz_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "v_active_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_cycle: string | null
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_ai_conversations: number | null
          max_clients: number | null
          max_users: number | null
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          billing_cycle?: string | null
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_ai_conversations?: number | null
          max_clients?: number | null
          max_users?: number | null
          name: string
          price: number
          updated_at?: string | null
        }
        Update: {
          billing_cycle?: string | null
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_ai_conversations?: number | null
          max_clients?: number | null
          max_users?: number | null
          name?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          company_id: string
          cost: number | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_service: boolean | null
          metadata: Json | null
          name: string
          price: number
          sku: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          company_id: string
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_service?: boolean | null
          metadata?: Json | null
          name: string
          price: number
          sku?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_service?: boolean | null
          metadata?: Json | null
          name?: string
          price?: number
          sku?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      reminders: {
        Row: {
          appointment_id: string | null
          attempts: number
          client_id: string
          company_id: string
          conversation_id: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          message_text: string
          reminder_offset_minutes: number | null
          reminder_type: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          attempts?: number
          client_id: string
          company_id: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          message_text: string
          reminder_offset_minutes?: number | null
          reminder_type?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          client_id?: string
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          message_text?: string
          reminder_offset_minutes?: number | null
          reminder_type?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "reminders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "v_active_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          appointments_access: string
          can_edit_settings: boolean
          company_id: string
          conversation_access: string
          created_at: string | null
          crm_access: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          sales_access: string
          updated_at: string | null
        }
        Insert: {
          appointments_access?: string
          can_edit_settings?: boolean
          company_id: string
          conversation_access?: string
          created_at?: string | null
          crm_access?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          sales_access?: string
          updated_at?: string | null
        }
        Update: {
          appointments_access?: string
          can_edit_settings?: boolean
          company_id?: string
          conversation_access?: string
          created_at?: string | null
          crm_access?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          sales_access?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      sales: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          company_id: string
          created_at: string | null
          discount_amount: number | null
          id: string
          items: Json
          metadata: Json | null
          notes: string | null
          payment_method: string | null
          payment_terms: string | null
          sale_number: string
          sold_by: string
          status: string | null
          subtotal: number
          tax_amount: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          company_id: string
          created_at?: string | null
          discount_amount?: number | null
          id?: string
          items?: Json
          metadata?: Json | null
          notes?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          sale_number: string
          sold_by: string
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          company_id?: string
          created_at?: string | null
          discount_amount?: number | null
          id?: string
          items?: Json
          metadata?: Json | null
          notes?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          sale_number?: string
          sold_by?: string
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sales_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_notes: string | null
          company_id: string
          created_at: string | null
          created_by: string
          description: string
          id: string
          priority: string
          resolved_at: string | null
          resolved_by: string | null
          screenshot_paths: string[] | null
          status: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          company_id: string
          created_at?: string | null
          created_by: string
          description: string
          id?: string
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_paths?: string[] | null
          status?: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string
          description?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_paths?: string[] | null
          status?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "user_roles_public_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_public_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          is_online: boolean | null
          last_seen_at: string | null
          phone: string | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          is_online?: boolean | null
          last_seen_at?: string | null
          phone?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          is_online?: boolean | null
          last_seen_at?: string | null
          phone?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          admin_token: string | null
          api_url: string
          company_id: string
          created_at: string | null
          error_message: string | null
          id: string
          instance_api_key: string | null
          instance_name: string
          is_active: boolean | null
          last_connected_at: string | null
          metadata: Json | null
          qr_code: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_token?: string | null
          api_url: string
          company_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          instance_api_key?: string | null
          instance_name: string
          is_active?: boolean | null
          last_connected_at?: string | null
          metadata?: Json | null
          qr_code?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_token?: string | null
          api_url?: string
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          instance_api_key?: string | null
          instance_name?: string
          is_active?: boolean | null
          last_connected_at?: string | null
          metadata?: Json | null
          qr_code?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
    }
    Views: {
      team_member_profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_active_conversations: {
        Row: {
          ai_handled: boolean | null
          channel: Database["public"]["Enums"]["communication_channel"] | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          company_id: string | null
          duration_seconds: number | null
          id: string | null
          last_message: string | null
          message_count: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["conversation_status"] | null
          transferred_to_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_metrics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_company_metrics: {
        Row: {
          active_conversations: number | null
          company_id: string | null
          company_name: string | null
          new_clients_30d: number | null
          total_clients: number | null
          upcoming_appointments: number | null
        }
        Insert: {
          active_conversations?: never
          company_id?: string | null
          company_name?: string | null
          new_clients_30d?: never
          total_clients?: never
          upcoming_appointments?: never
        }
        Update: {
          active_conversations?: never
          company_id?: string | null
          company_name?: string | null
          new_clients_30d?: never
          total_clients?: never
          upcoming_appointments?: never
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_daily_metrics: {
        Args: { p_company_id: string; p_date: string }
        Returns: undefined
      }
      check_appointment_conflict: {
        Args: {
          p_assigned_to?: string
          p_company_id: string
          p_duration_minutes: number
          p_exclude_appointment_id?: string
          p_scheduled_for: string
        }
        Returns: {
          conflicting_appointment_id: string
          conflicting_client_name: string
          has_conflict: boolean
        }[]
      }
      create_company_and_assign_admin: {
        Args: {
          p_company_email: string
          p_company_name: string
          p_user_id: string
        }
        Returns: string
      }
      create_company_policies: {
        Args: { table_name: string }
        Returns: undefined
      }
      create_company_with_defaults: {
        Args: { p_email: string; p_name: string; p_plan_id?: string }
        Returns: string
      }
      create_company_with_owner:
        | {
            Args: {
              p_company_email: string
              p_company_name: string
              p_owner_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_company_email: string
              p_company_name: string
              p_owner_id: string
            }
            Returns: string
          }
      delete_company_cascade: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_pending_follow_ups: { Args: never; Returns: undefined }
      process_pending_reminders: { Args: never; Returns: undefined }
      seed_test_data: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "super_admin" | "company_admin" | "manager" | "agent" | "viewer"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      communication_channel:
        | "whatsapp"
        | "telegram"
        | "webchat"
        | "instagram"
        | "facebook"
        | "email"
        | "sms"
      conversation_status: "active" | "waiting" | "closed" | "transferred"
      sender_type: "client" | "ai" | "agent" | "system"
      subscription_status: "trial" | "active" | "suspended" | "cancelled"
      user_role:
        | "super_admin"
        | "company_admin"
        | "manager"
        | "agent"
        | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "company_admin", "manager", "agent", "viewer"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      communication_channel: [
        "whatsapp",
        "telegram",
        "webchat",
        "instagram",
        "facebook",
        "email",
        "sms",
      ],
      conversation_status: ["active", "waiting", "closed", "transferred"],
      sender_type: ["client", "ai", "agent", "system"],
      subscription_status: ["trial", "active", "suspended", "cancelled"],
      user_role: ["super_admin", "company_admin", "manager", "agent", "viewer"],
    },
  },
} as const
