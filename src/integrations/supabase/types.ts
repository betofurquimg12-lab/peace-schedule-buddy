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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agenda_settings: {
        Row: {
          created_at: string
          end_time: string
          google_sync_email: string | null
          google_sync_enabled: boolean
          id: string
          owner_id: string
          reminder_app_enabled: boolean
          reminder_app_minutes: number
          reminder_email_before_enabled: boolean
          reminder_email_before_minutes: number
          reminder_email_day_before_enabled: boolean
          reminder_email_day_before_minutes: number
          reminder_popup_enabled: boolean
          reminder_popup_minutes: number
          slot_minutes: number
          start_time: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          end_time?: string
          google_sync_email?: string | null
          google_sync_enabled?: boolean
          id?: string
          owner_id: string
          reminder_app_enabled?: boolean
          reminder_app_minutes?: number
          reminder_email_before_enabled?: boolean
          reminder_email_before_minutes?: number
          reminder_email_day_before_enabled?: boolean
          reminder_email_day_before_minutes?: number
          reminder_popup_enabled?: boolean
          reminder_popup_minutes?: number
          slot_minutes?: number
          start_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          end_time?: string
          google_sync_email?: string | null
          google_sync_enabled?: boolean
          id?: string
          owner_id?: string
          reminder_app_enabled?: boolean
          reminder_app_minutes?: number
          reminder_email_before_enabled?: boolean
          reminder_email_before_minutes?: number
          reminder_email_day_before_enabled?: boolean
          reminder_email_day_before_minutes?: number
          reminder_popup_enabled?: boolean
          reminder_popup_minutes?: number
          slot_minutes?: number
          start_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          external_summary: string | null
          google_etag: string | null
          google_event_id: string | null
          google_updated_at: string | null
          id: string
          last_synced_at: string | null
          meet_link: string | null
          modality: Database["public"]["Enums"]["appointment_modality"]
          notes: string | null
          patient_id: string | null
          price: number
          recurrence: Database["public"]["Enums"]["recurrence_type"]
          recurrence_end_date: string | null
          recurrence_group_id: string | null
          reminder_sent_at: string | null
          source: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          ends_at: string
          external_summary?: string | null
          google_etag?: string | null
          google_event_id?: string | null
          google_updated_at?: string | null
          id?: string
          last_synced_at?: string | null
          meet_link?: string | null
          modality?: Database["public"]["Enums"]["appointment_modality"]
          notes?: string | null
          patient_id?: string | null
          price?: number
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_end_date?: string | null
          recurrence_group_id?: string | null
          reminder_sent_at?: string | null
          source?: string
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          ends_at?: string
          external_summary?: string | null
          google_etag?: string | null
          google_event_id?: string | null
          google_updated_at?: string | null
          id?: string
          last_synced_at?: string | null
          meet_link?: string | null
          modality?: Database["public"]["Enums"]["appointment_modality"]
          notes?: string | null
          patient_id?: string | null
          price?: number
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_end_date?: string | null
          recurrence_group_id?: string | null
          reminder_sent_at?: string | null
          source?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          patient_id: string | null
          type: Database["public"]["Enums"]["finance_entry_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          patient_id?: string | null
          type: Database["public"]["Enums"]["finance_entry_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          patient_id?: string | null
          type?: Database["public"]["Enums"]["finance_entry_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          key: string
          owner_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          key: string
          owner_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          key?: string
          owner_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          active: boolean
          address: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          default_session_price: number
          email: string | null
          full_name: string
          history: string | null
          id: string
          main_complaint: string | null
          notes: string | null
          phone: string | null
          responsible_name: string | null
          responsible_phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_session_price?: number
          email?: string | null
          full_name: string
          history?: string | null
          id?: string
          main_complaint?: string | null
          notes?: string | null
          phone?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_session_price?: number
          email?: string | null
          full_name?: string
          history?: string | null
          id?: string
          main_complaint?: string | null
          notes?: string | null
          phone?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string | null
        }
        Insert: {
          amount: number
          appointment_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_patient_clinical: {
        Args: { _patient_id: string }
        Returns: {
          history: string
          main_complaint: string
          notes: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_clinic_member: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "secretary"
      appointment_modality: "in_person" | "online"
      appointment_status: "scheduled" | "done" | "canceled" | "no_show"
      finance_entry_type: "credit" | "debit"
      payment_method: "pix" | "cash" | "card" | "transfer" | "other"
      recurrence_type: "none" | "weekly" | "biweekly"
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
      app_role: ["owner", "secretary"],
      appointment_modality: ["in_person", "online"],
      appointment_status: ["scheduled", "done", "canceled", "no_show"],
      finance_entry_type: ["credit", "debit"],
      payment_method: ["pix", "cash", "card", "transfer", "other"],
      recurrence_type: ["none", "weekly", "biweekly"],
    },
  },
} as const
