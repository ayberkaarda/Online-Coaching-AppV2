export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      daily_logs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          log_date: string
          macros: Json
          sodium_mg: number | null
          water_lt: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          log_date?: string
          macros?: Json
          sodium_mg?: number | null
          water_lt?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          log_date?: string
          macros?: Json
          sodium_mg?: number | null
          water_lt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          body_part: string | null
          equipment: string | null
          gif_url: string | null
          id: number
          image: string | null
          name: string
          target: string | null
        }
        Insert: {
          body_part?: string | null
          equipment?: string | null
          gif_url?: string | null
          id?: number
          image?: string | null
          name: string
          target?: string | null
        }
        Update: {
          body_part?: string | null
          equipment?: string | null
          gif_url?: string | null
          id?: number
          image?: string | null
          name?: string
          target?: string | null
        }
        Relationships: []
      }
      food_database: {
        Row: {
          calories_per_100g: number
          id: number
          name: string
        }
        Insert: {
          calories_per_100g: number
          id?: number
          name: string
        }
        Update: {
          calories_per_100g?: number
          id?: number
          name?: string
        }
        Relationships: []
      }
      form_checks: {
        Row: {
          back_pose_path: string | null
          client_id: string
          created_at: string
          current_weight: number
          front_pose_path: string | null
          id: string
          notes: string | null
        }
        Insert: {
          back_pose_path?: string | null
          client_id: string
          created_at?: string
          current_weight: number
          front_pose_path?: string | null
          id?: string
          notes?: string | null
        }
        Update: {
          back_pose_path?: string | null
          client_id?: string
          created_at?: string
          current_weight?: number
          front_pose_path?: string | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_checks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plan_meals: {
        Row: {
          day: string
          description: string
          id: string
          kcal: number | null
          plan_id: string
          position: number
        }
        Insert: {
          day: string
          description: string
          id?: string
          kcal?: number | null
          plan_id: string
          position?: number
        }
        Update: {
          day?: string
          description?: string
          id?: string
          kcal?: number | null
          plan_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_meals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plans: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
          version: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          current_streak: number
          email: string | null
          full_name: string
          id: string
          last_checkin_at: string | null
          nutrition_plan: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          workout_plan: string | null
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          current_streak?: number
          email?: string | null
          full_name?: string
          id: string
          last_checkin_at?: string | null
          nutrition_plan?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          workout_plan?: string | null
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          current_streak?: number
          email?: string | null
          full_name?: string
          id?: string
          last_checkin_at?: string | null
          nutrition_plan?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          workout_plan?: string | null
        }
        Relationships: []
      }
      program_approvals: {
        Row: {
          client_id: string
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          workout_data: Json
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          workout_data: Json
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          workout_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "program_approvals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_approvals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          client_id: string
          created_at: string
          exercise_name: string
          id: string
          reps: number | null
          rpe: number | null
          weight_kg: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          exercise_name: string
          id?: string
          reps?: number | null
          rpe?: number | null
          weight_kg?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          exercise_name?: string
          id?: string
          reps?: number | null
          rpe?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plan_exercises: {
        Row: {
          day: string
          id: string
          name: string | null
          plan_id: string
          position: number
          raw_line: string
          target_reps: number | null
          target_sets: number | null
          target_weight_kg: number | null
          video_url: string | null
        }
        Insert: {
          day: string
          id?: string
          name?: string | null
          plan_id: string
          position: number
          raw_line: string
          target_reps?: number | null
          target_sets?: number | null
          target_weight_kg?: number | null
          video_url?: string | null
        }
        Update: {
          day?: string
          id?: string
          name?: string | null
          plan_id?: string
          position?: number
          raw_line?: string
          target_reps?: number | null
          target_sets?: number | null
          target_weight_kg?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_plan_exercises_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
          version: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      explode_nutrition_day: {
        Args: { p_day: string; p_entry: Json; p_plan_id: string }
        Returns: number
      }
      explode_plan_day: {
        Args: { p_day: string; p_plan_id: string; p_text: string }
        Returns: number
      }
      increment_streak: { Args: { user_id: string }; Returns: number }
      is_coach: { Args: { uid?: string }; Returns: boolean }
      is_coach_profile: { Args: { target: string }; Returns: boolean }
      migrate_nutrition_plans_from_profiles: {
        Args: never
        Returns: {
          meals_inserted: number
          profiles_converted: number
        }[]
      }
      migrate_workout_plans_from_profiles: {
        Args: never
        Returns: {
          exercises_inserted: number
          profiles_converted: number
        }[]
      }
      profile_role: {
        Args: { uid?: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      save_nutrition_plan: {
        Args: { p_client_ids: string[]; p_plan: Json }
        Returns: number
      }
      save_workout_plan: {
        Args: { p_client_ids: string[]; p_plan: Json }
        Returns: number
      }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected"
      user_role: "coach" | "client"
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
      approval_status: ["pending", "approved", "rejected"],
      user_role: ["coach", "client"],
    },
  },
} as const

