export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
    // Allows to automatically instanciate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "12.2.12 (cd3cf9e)";
    };
    graphql_public: {
        Tables: {
            [_ in never]: never;
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            graphql: {
                Args: {
                    operationName?: string;
                    query?: string;
                    variables?: Json;
                    extensions?: Json;
                };
                Returns: Json;
            };
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
    public: {
        Tables: {
            contact_tasks: {
                Row: {
                    created_at: string | null;
                    due_date: string | null;
                    id: number;
                    notes: string | null;
                    owner_id: string | null;
                    sponsor_email: string;
                    status: Database["public"]["Enums"]["task_status"];
                    updated_at: string | null;
                };
                Insert: {
                    created_at?: string | null;
                    due_date?: string | null;
                    id?: number;
                    notes?: string | null;
                    owner_id?: string | null;
                    sponsor_email: string;
                    status?: Database["public"]["Enums"]["task_status"];
                    updated_at?: string | null;
                };
                Update: {
                    created_at?: string | null;
                    due_date?: string | null;
                    id?: number;
                    notes?: string | null;
                    owner_id?: string | null;
                    sponsor_email?: string;
                    status?: Database["public"]["Enums"]["task_status"];
                    updated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "contact_tasks_owner_id_fkey";
                        columns: ["owner_id"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "contact_tasks_sponsor_email_fkey";
                        columns: ["sponsor_email"];
                        isOneToOne: false;
                        referencedRelation: "sponsors";
                        referencedColumns: ["sponsor_email"];
                    },
                ];
            };
            email_threads: {
                Row: {
                    created_at: string | null;
                    id: number;
                    task_id: number;
                    thread_id: string;
                    updated_at: string | null;
                };
                Insert: {
                    created_at?: string | null;
                    id?: number;
                    task_id: number;
                    thread_id: string;
                    updated_at?: string | null;
                };
                Update: {
                    created_at?: string | null;
                    id?: number;
                    task_id?: number;
                    thread_id?: string;
                    updated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "email_threads_task_id_fkey";
                        columns: ["task_id"];
                        isOneToOne: false;
                        referencedRelation: "contact_tasks";
                        referencedColumns: ["id"];
                    },
                ];
            };
            emails: {
                Row: {
                    bcc_recipients: string[] | null;
                    body: string | null;
                    cc_recipients: string[] | null;
                    created_at: string | null;
                    direction: Database["public"]["Enums"]["email_direction"];
                    gmail_message_id: string;
                    rfc_in_reply_to: string | null;
                    rfc_message_id: string | null;
                    rfc_references: string | null;
                    sender_email: string;
                    sent_at: string | null;
                    subject: string | null;
                    thread_id: number;
                    to_recipients: string[] | null;
                    updated_at: string | null;
                };
                Insert: {
                    bcc_recipients?: string[] | null;
                    body?: string | null;
                    cc_recipients?: string[] | null;
                    created_at?: string | null;
                    direction: Database["public"]["Enums"]["email_direction"];
                    gmail_message_id: string;
                    rfc_in_reply_to?: string | null;
                    rfc_message_id?: string | null;
                    rfc_references?: string | null;
                    sender_email: string;
                    sent_at?: string | null;
                    subject?: string | null;
                    thread_id: number;
                    to_recipients?: string[] | null;
                    updated_at?: string | null;
                };
                Update: {
                    bcc_recipients?: string[] | null;
                    body?: string | null;
                    cc_recipients?: string[] | null;
                    created_at?: string | null;
                    direction?: Database["public"]["Enums"]["email_direction"];
                    gmail_message_id?: string;
                    rfc_in_reply_to?: string | null;
                    rfc_message_id?: string | null;
                    rfc_references?: string | null;
                    sender_email?: string;
                    sent_at?: string | null;
                    subject?: string | null;
                    thread_id?: number;
                    to_recipients?: string[] | null;
                    updated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "emails_thread_id_fkey";
                        columns: ["thread_id"];
                        isOneToOne: false;
                        referencedRelation: "email_threads";
                        referencedColumns: ["id"];
                    },
                ];
            };
            profiles: {
                Row: {
                    created_at: string | null;
                    gmail_refresh: string | null;
                    gmail_token: string | null;
                    id: string;
                    last_history_id: string | null;
                    last_synced_at: string | null;
                    name: string;
                    role: Database["public"]["Enums"]["user_role"];
                    updated_at: string | null;
                };
                Insert: {
                    created_at?: string | null;
                    gmail_refresh?: string | null;
                    gmail_token?: string | null;
                    id: string;
                    last_history_id?: string | null;
                    last_synced_at?: string | null;
                    name: string;
                    role: Database["public"]["Enums"]["user_role"];
                    updated_at?: string | null;
                };
                Update: {
                    created_at?: string | null;
                    gmail_refresh?: string | null;
                    gmail_token?: string | null;
                    id?: string;
                    last_history_id?: string | null;
                    last_synced_at?: string | null;
                    name?: string;
                    role?: Database["public"]["Enums"]["user_role"];
                    updated_at?: string | null;
                };
                Relationships: [];
            };
            sponsors: {
                Row: {
                    company_name: string | null;
                    created_at: string | null;
                    notes: string | null;
                    sponsor_email: string;
                    sponsor_name: string;
                    status: Database["public"]["Enums"]["sponsor_status"];
                    updated_at: string | null;
                };
                Insert: {
                    company_name?: string | null;
                    created_at?: string | null;
                    notes?: string | null;
                    sponsor_email: string;
                    sponsor_name: string;
                    status?: Database["public"]["Enums"]["sponsor_status"];
                    updated_at?: string | null;
                };
                Update: {
                    company_name?: string | null;
                    created_at?: string | null;
                    notes?: string | null;
                    sponsor_email?: string;
                    sponsor_name?: string;
                    status?: Database["public"]["Enums"]["sponsor_status"];
                    updated_at?: string | null;
                };
                Relationships: [];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            email_direction: "OUTBOUND" | "INBOUND";
            sponsor_status: "PENDING_EMAIL" | "CONTACTED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED";
            task_status: "PENDING" | "SENT" | "FOLLOWED_UP" | "COMPLETED" | "REPLIED" | "BUMP_1" | "BUMP_2" | "BUMP_3";
            user_role: "LEAD" | "MEMBER";
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
    DefaultSchemaTableNameOrOptions extends
        | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
              DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
          DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
          Row: infer R;
      }
        ? R
        : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
      ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R;
        }
          ? R
          : never
      : never;

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
          Insert: infer I;
      }
        ? I
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
      ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
            Insert: infer I;
        }
          ? I
          : never
      : never;

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
          Update: infer U;
      }
        ? U
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
      ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
            Update: infer U;
        }
          ? U
          : never
      : never;

export type Enums<
    DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
        : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
      ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
      : never;

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
        : never = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
      ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
      : never;

export const Constants = {
    graphql_public: {
        Enums: {},
    },
    public: {
        Enums: {
            email_direction: ["OUTBOUND", "INBOUND"],
            sponsor_status: ["PENDING_EMAIL", "CONTACTED", "REJECTED", "NEED_PAYMENT", "CONFIRMED"],
            task_status: ["PENDING", "SENT", "FOLLOWED_UP", "COMPLETED", "REPLIED", "BUMP_1", "BUMP_2", "BUMP_3"],
            user_role: ["LEAD", "MEMBER"],
        },
    },
} as const;
