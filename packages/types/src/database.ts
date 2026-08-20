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
      account_deletions: {
        Row: {
          deleted_at: string
          id: string
          request_id: string | null
          rows_deleted: Json
          storage_objects_deleted: number
          subject_role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          deleted_at?: string
          id?: string
          request_id?: string | null
          rows_deleted?: Json
          storage_objects_deleted?: number
          subject_role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          deleted_at?: string
          id?: string
          request_id?: string | null
          rows_deleted?: Json
          storage_objects_deleted?: number
          subject_role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      activity_events: {
        Row: {
          duration_sec: number | null
          event: string
          id: string
          occurred_at: string
          session_id: string
          tab: string | null
          user_id: string
        }
        Insert: {
          duration_sec?: number | null
          event: string
          id?: string
          occurred_at?: string
          session_id: string
          tab?: string | null
          user_id: string
        }
        Update: {
          duration_sec?: number | null
          event?: string
          id?: string
          occurred_at?: string
          session_id?: string
          tab?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_sessions: {
        Row: {
          id: string
          last_seen_at: string
          platform: string
          started_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_seen_at?: string
          platform: string
          started_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_seen_at?: string
          platform?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_actions: {
        Row: {
          action: string
          actor_id: string | null
          id: string
          occurred_at: string
          request_id: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          id?: string
          occurred_at?: string
          request_id?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          id?: string
          occurred_at?: string
          request_id?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          coach_feedback: string | null
          created_at: string
          current_weight: number
          front_pose_path: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["form_check_status"]
        }
        Insert: {
          back_pose_path?: string | null
          client_id: string
          coach_feedback?: string | null
          created_at?: string
          current_weight: number
          front_pose_path?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["form_check_status"]
        }
        Update: {
          back_pose_path?: string | null
          client_id?: string
          coach_feedback?: string | null
          created_at?: string
          current_weight?: number
          front_pose_path?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["form_check_status"]
        }
        Relationships: [
          {
            foreignKeyName: "form_checks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_checks_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachment_verifications: {
        Row: {
          bucket: string
          mime: string
          object_etag: string
          path: string
          verified_at: string
        }
        Insert: {
          bucket: string
          mime: string
          object_etag: string
          path: string
          verified_at?: string
        }
        Update: {
          bucket?: string
          mime?: string
          object_etag?: string
          path?: string
          verified_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_path: string | null
          client_id: string
          created_at: string
          id: string
          is_read: boolean
          kind: Database["public"]["Enums"]["message_kind"]
          message: string
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          attachment_path?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: Database["public"]["Enums"]["message_kind"]
          message: string
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          attachment_path?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: Database["public"]["Enums"]["message_kind"]
          message?: string
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      nutrition_logs: {
        Row: {
          carb_g: number | null
          client_id: string
          created_at: string
          description: string
          fat_g: number | null
          id: string
          kcal: number | null
          log_date: string
          protein_g: number | null
          updated_at: string
        }
        Insert: {
          carb_g?: number | null
          client_id: string
          created_at?: string
          description: string
          fat_g?: number | null
          id?: string
          kcal?: number | null
          log_date?: string
          protein_g?: number | null
          updated_at?: string
        }
        Update: {
          carb_g?: number | null
          client_id?: string
          created_at?: string
          description?: string
          fat_g?: number | null
          id?: string
          kcal?: number | null
          log_date?: string
          protein_g?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_client_id_fkey"
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
          target_carb_g: number | null
          target_fat_g: number | null
          target_kcal: number | null
          target_protein_g: number | null
          updated_at: string
          version: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          target_carb_g?: number | null
          target_fat_g?: number | null
          target_kcal?: number | null
          target_protein_g?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          target_carb_g?: number | null
          target_fat_g?: number | null
          target_kcal?: number | null
          target_protein_g?: number | null
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
          activity_consent_granted_at: string | null
          activity_consent_revoked_at: string | null
          activity_consent_version: number | null
          avatar_path: string | null
          birth_date: string | null
          created_at: string
          current_streak: number
          email: string | null
          full_name: string
          height_cm: number | null
          id: string
          last_checkin_at: string | null
          nutrition_plan: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          workout_plan: string | null
        }
        Insert: {
          activity_consent_granted_at?: string | null
          activity_consent_revoked_at?: string | null
          activity_consent_version?: number | null
          avatar_path?: string | null
          birth_date?: string | null
          created_at?: string
          current_streak?: number
          email?: string | null
          full_name?: string
          height_cm?: number | null
          id: string
          last_checkin_at?: string | null
          nutrition_plan?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          workout_plan?: string | null
        }
        Update: {
          activity_consent_granted_at?: string | null
          activity_consent_revoked_at?: string | null
          activity_consent_version?: number | null
          avatar_path?: string | null
          birth_date?: string | null
          created_at?: string
          current_streak?: number
          email?: string | null
          full_name?: string
          height_cm?: number | null
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
      progress_entries: {
        Row: {
          arm_cm: number | null
          chest_cm: number | null
          client_id: string
          created_at: string
          entry_date: string
          hip_cm: number | null
          id: string
          notes: string | null
          thigh_cm: number | null
          updated_at: string
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          arm_cm?: number | null
          chest_cm?: number | null
          client_id: string
          created_at?: string
          entry_date?: string
          hip_cm?: number | null
          id?: string
          notes?: string | null
          thigh_cm?: number | null
          updated_at?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          arm_cm?: number | null
          chest_cm?: number | null
          client_id?: string
          created_at?: string
          entry_date?: string
          hip_cm?: number | null
          id?: string
          notes?: string | null
          thigh_cm?: number | null
          updated_at?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "progress_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_photos: {
        Row: {
          angle: Database["public"]["Enums"]["progress_photo_angle"]
          client_id: string
          created_at: string
          id: string
          photo_path: string
          taken_on: string
        }
        Insert: {
          angle: Database["public"]["Enums"]["progress_photo_angle"]
          client_id: string
          created_at?: string
          id?: string
          photo_path: string
          taken_on?: string
        }
        Update: {
          angle?: Database["public"]["Enums"]["progress_photo_angle"]
          client_id?: string
          created_at?: string
          id?: string
          photo_path?: string
          taken_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          exercise_name: string
          id: string
          plan_exercise_id: string | null
          reps: number | null
          rpe: number | null
          set_number: number | null
          weight_kg: number | null
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          exercise_name: string
          id?: string
          plan_exercise_id?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number | null
          weight_kg?: number | null
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          exercise_name?: string
          id?: string
          plan_exercise_id?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number | null
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
          {
            foreignKeyName: "workout_logs_plan_exercise_id_fkey"
            columns: ["plan_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_exercises"
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
      account_deletion_manifest: { Args: { p_user_id: string }; Returns: Json }
      activity_consent_state: { Args: { p_user_id: string }; Returns: string }
      approve_program: {
        Args: { p_approval_id: string; p_client_id: string; p_plan: Json }
        Returns: undefined
      }
      attachment_normalize_etag: { Args: { p_etag: string }; Returns: string }
      avatar_object_owner: { Args: { p_name: string }; Returns: string }
      backfill_form_check_review: {
        Args: never
        Returns: {
          rows_cleaned: number
          rows_demoted: number
          rows_pending: number
          rows_reviewed: number
        }[]
      }
      backfill_form_check_weight_to_progress: {
        Args: never
        Returns: {
          rows_filled: number
          rows_inserted: number
          rows_out_of_range: number
          rows_skipped: number
          source_days: number
        }[]
      }
      backfill_messages_conversation_key: {
        Args: never
        Returns: {
          client_ids_filled: number
          read_ats_filled: number
          rows_skipped: number
        }[]
      }
      backfill_program_approval_review: {
        Args: never
        Returns: {
          rows_cleaned: number
          rows_decided: number
          rows_demoted: number
          rows_pending: number
        }[]
      }
      coach_activity_summary: {
        Args: { p_client_id: string; p_days?: number }
        Returns: {
          day: string
          event_counts: Json
          total_seconds: number
        }[]
      }
      consume_attachment_verification: {
        Args: { p_bucket: string; p_path: string }
        Returns: boolean
      }
      delete_account: {
        Args: {
          p_request_id?: string
          p_storage_objects_deleted?: number
          p_user_id: string
        }
        Returns: Json
      }
      explode_nutrition_day: {
        Args: { p_day: string; p_entry: Json; p_plan_id: string }
        Returns: number
      }
      explode_plan_day: {
        Args: { p_day: string; p_plan_id: string; p_text: string }
        Returns: number
      }
      form_check_entry_date: { Args: { p_created_at: string }; Returns: string }
      grant_activity_consent: {
        Args: { p_user_id: string; p_version: number }
        Returns: Json
      }
      increment_streak: { Args: { user_id: string }; Returns: number }
      is_coach: { Args: { uid?: string }; Returns: boolean }
      is_coach_profile: { Args: { target: string }; Returns: boolean }
      is_end_user_write: { Args: never; Returns: boolean }
      link_coach_action_target: {
        Args: { p_action_id: string; p_target_id: string }
        Returns: boolean
      }
      message_attachment_conversation: {
        Args: { p_name: string }
        Returns: string
      }
      message_attachment_uploader: { Args: { p_name: string }; Returns: string }
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
      post_system_message: {
        Args: { p_client_id: string; p_event_type: string; p_ref_id?: string }
        Returns: {
          attachment_path: string | null
          client_id: string
          created_at: string
          id: string
          is_read: boolean
          kind: Database["public"]["Enums"]["message_kind"]
          message: string
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      profile_role: {
        Args: { uid?: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      progress_photo_owner: { Args: { p_name: string }; Returns: string }
      purge_expired_activity: {
        Args: { p_retention_days?: number }
        Returns: Json
      }
      record_activity: {
        Args: {
          p_duration_sec?: number
          p_event?: string
          p_occurred_at?: string
          p_platform: string
          p_session_id?: string
          p_tab?: string
          p_user_id: string
        }
        Returns: Json
      }
      record_attachment_verification: {
        Args: {
          p_bucket: string
          p_etag: string
          p_mime: string
          p_path: string
        }
        Returns: undefined
      }
      record_coach_action: {
        Args: {
          p_action: string
          p_actor_id: string
          p_request_id?: string
          p_target_id?: string
        }
        Returns: string
      }
      revoke_activity_consent: { Args: { p_user_id: string }; Returns: Json }
      save_nutrition_plan: {
        Args: { p_client_ids: string[]; p_plan: Json }
        Returns: number
      }
      save_workout_plan: {
        Args: { p_client_ids: string[]; p_plan: Json }
        Returns: number
      }
      submit_program_for_approval: {
        Args: { p_client_id: string; p_workout_data: Json }
        Returns: {
          client_id: string
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          workout_data: Json
        }
        SetofOptions: {
          from: "*"
          to: "program_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workout_plan_has_history: {
        Args: { p_plan_id: string }
        Returns: boolean
      }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected"
      form_check_status: "pending" | "reviewed"
      message_kind: "user" | "system"
      progress_photo_angle: "front" | "side" | "back"
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
      form_check_status: ["pending", "reviewed"],
      message_kind: ["user", "system"],
      progress_photo_angle: ["front", "side", "back"],
      user_role: ["coach", "client"],
    },
  },
} as const

