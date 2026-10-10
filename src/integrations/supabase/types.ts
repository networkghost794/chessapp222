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
      app_updates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          published: boolean
          title: string | null
          updated_at: string
          version: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published?: boolean
          title?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published?: boolean
          title?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      bot_stats: {
        Row: {
          bot_id: string
          bot_name: string
          created_at: string
          draws: number
          id: string
          losses: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          bot_id: string
          bot_name: string
          created_at?: string
          draws?: number
          id?: string
          losses?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          bot_id?: string
          bot_name?: string
          created_at?: string
          draws?: number
          id?: string
          losses?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      custom_bots: {
        Row: {
          created_at: string
          created_by: string | null
          dialogue_lines: Json
          elo: number
          endgame_settings: Json
          id: string
          lifetime_losses: number
          lifetime_wins: number
          middlegame_settings: Json
          name: string
          opening_settings: Json
          order_index: number
          profile_pic_url: string | null
          quote: string
          tier: string
          title: string | null
          title_color: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dialogue_lines?: Json
          elo?: number
          endgame_settings?: Json
          id?: string
          lifetime_losses?: number
          lifetime_wins?: number
          middlegame_settings?: Json
          name: string
          opening_settings?: Json
          order_index?: number
          profile_pic_url?: string | null
          quote?: string
          tier?: string
          title?: string | null
          title_color?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dialogue_lines?: Json
          elo?: number
          endgame_settings?: Json
          id?: string
          lifetime_losses?: number
          lifetime_wins?: number
          middlegame_settings?: Json
          name?: string
          opening_settings?: Json
          order_index?: number
          profile_pic_url?: string | null
          quote?: string
          tier?: string
          title?: string | null
          title_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          name: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          name: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          draws: number
          elo_rating: number
          id: string
          losses: number
          placement_done: boolean
          profile_icon: string | null
          status_text: string | null
          title_badge: string | null
          updated_at: string
          username: string
          verified_federation: string | null
          wins: number
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          draws?: number
          elo_rating?: number
          id: string
          losses?: number
          placement_done?: boolean
          profile_icon?: string | null
          status_text?: string | null
          title_badge?: string | null
          updated_at?: string
          username: string
          verified_federation?: string | null
          wins?: number
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          draws?: number
          elo_rating?: number
          id?: string
          losses?: number
          placement_done?: boolean
          profile_icon?: string | null
          status_text?: string | null
          title_badge?: string | null
          updated_at?: string
          username?: string
          verified_federation?: string | null
          wins?: number
        }
        Relationships: []
      }
      title_colors: {
        Row: {
          color: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      title_verifications: {
        Row: {
          claimed_title: string | null
          created_at: string
          federation: string
          federation_id: string
          id: string
          notes: string | null
          official_rating: number
          proof_url: string
          reviewed_at: string | null
          status: string
          user_id: string
          username: string
        }
        Insert: {
          claimed_title?: string | null
          created_at?: string
          federation: string
          federation_id: string
          id?: string
          notes?: string | null
          official_rating: number
          proof_url: string
          reviewed_at?: string | null
          status?: string
          user_id: string
          username: string
        }
        Update: {
          claimed_title?: string | null
          created_at?: string
          federation?: string
          federation_id?: string
          id?: string
          notes?: string | null
          official_rating?: number
          proof_url?: string
          reviewed_at?: string | null
          status?: string
          user_id?: string
          username?: string
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
      user_seen_updates: {
        Row: {
          seen_at: string
          user_id: string
          version: string
        }
        Insert: {
          seen_at?: string
          user_id: string
          version: string
        }
        Update: {
          seen_at?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_owner_role: { Args: { _pin: string }; Returns: boolean }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"]; _uid: string }
        Returns: boolean
      }
      increment_bot_lifetime: {
        Args: { _bot_id: string; _losses: number; _wins: number }
        Returns: undefined
      }
      review_title_verification: {
        Args: { _approve: boolean; _id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["owner", "user"],
    },
  },
} as const
