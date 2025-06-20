export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
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
                    body: string | null;
                    created_at: string | null;
                    direction: Database["public"]["Enums"]["email_direction"];
                    message_id: string;
                    sender_email: string;
                    sent_at: string | null;
                    subject: string | null;
                    thread_id: number;
                    updated_at: string | null;
                };
                Insert: {
                    body?: string | null;
                    created_at?: string | null;
                    direction: Database["public"]["Enums"]["email_direction"];
                    message_id: string;
                    sender_email: string;
                    sent_at?: string | null;
                    subject?: string | null;
                    thread_id: number;
                    updated_at?: string | null;
                };
                Update: {
                    body?: string | null;
                    created_at?: string | null;
                    direction?: Database["public"]["Enums"]["email_direction"];
                    message_id?: string;
                    sender_email?: string;
                    sent_at?: string | null;
                    subject?: string | null;
                    thread_id?: number;
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
                    last_history_id: number | null;
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
                    last_history_id?: number | null;
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
                    last_history_id?: number | null;
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
            task_status: "PENDING" | "SENT" | "FOLLOWED_UP" | "COMPLETED";
            user_role: "LEAD" | "MEMBER";
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
    DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof Database },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof Database;
    }
        ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
              Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
        : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
          Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof Database },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof Database;
    }
        ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof Database },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof Database;
    }
        ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof Database },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof Database;
    }
        ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
        : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
    ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
      ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
      : never;

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database;
    }
        ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
        : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
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
            task_status: ["PENDING", "SENT", "FOLLOWED_UP", "COMPLETED"],
            user_role: ["LEAD", "MEMBER"],
        },
    },
} as const;
