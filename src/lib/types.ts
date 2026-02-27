export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          username: string;
          avatar_url: string | null;
          bio: string | null;
          points_balance: number;
          dollar_balance: number;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          username: string;
          avatar_url?: string | null;
          bio?: string | null;
          points_balance?: number;
          dollar_balance?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          username?: string;
          avatar_url?: string | null;
          bio?: string | null;
          points_balance?: number;
          dollar_balance?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string | null;
          raw_markdown: string | null;
          slug: string;
          is_published: boolean;
          summary: string | null;
          validation_score: number | null;
          validation_feedback: string | null;
          ai_detection_label: string | null;
          ai_detection_score: number | null;
          ai_detection_is_likely_ai: boolean | null;
          ai_detection_summary: string | null;
          ai_detection_checked_at: string | null;
          original_file_name: string | null;
          original_file_path: string | null;
          original_file_type: string | null;
          price: number;
          is_exclusive: boolean;
          is_sold: boolean;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content?: string | null;
          raw_markdown?: string | null;
          slug: string;
          is_published?: boolean;
          summary?: string | null;
          description?: string | null;
          validation_score?: number | null;
          validation_feedback?: string | null;
          ai_detection_label?: string | null;
          ai_detection_score?: number | null;
          ai_detection_is_likely_ai?: boolean | null;
          ai_detection_summary?: string | null;
          ai_detection_checked_at?: string | null;
          original_file_name?: string | null;
          original_file_path?: string | null;
          original_file_type?: string | null;
          price?: number;
          is_exclusive?: boolean;
          is_sold?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string | null;
          raw_markdown?: string | null;
          slug?: string;
          is_published?: boolean;
          summary?: string | null;
          description?: string | null;
          validation_score?: number | null;
          validation_feedback?: string | null;
          ai_detection_label?: string | null;
          ai_detection_score?: number | null;
          ai_detection_is_likely_ai?: boolean | null;
          ai_detection_summary?: string | null;
          ai_detection_checked_at?: string | null;
          original_file_name?: string | null;
          original_file_path?: string | null;
          original_file_type?: string | null;
          price?: number;
          is_exclusive?: boolean;
          is_sold?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      note_tags: {
        Row: {
          note_id: string;
          tag_id: string;
        };
        Insert: {
          note_id: string;
          tag_id: string;
        };
        Update: {
          note_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "note_tags_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          note_id: string;
          user_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          note_id: string;
          user_id: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          note_id?: string;
          user_id?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: 'points_purchase' | 'note_bought_points' | 'note_bought_dollars' | 'note_sale' | 'promo_code_redemption';
          amount: number;
          points_amount: number;
          note_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'points_purchase' | 'note_bought_points' | 'note_bought_dollars' | 'note_sale' | 'promo_code_redemption';
          amount?: number;
          points_amount?: number;
          note_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'points_purchase' | 'note_bought_points' | 'note_bought_dollars' | 'note_sale' | 'promo_code_redemption';
          amount?: number;
          points_amount?: number;
          note_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      purchases: {
        Row: {
          id: string;
          buyer_id: string;
          note_id: string;
          price_paid: number;
          payment_method: 'points' | 'dollars';
          created_at: string;
        };
        Insert: {
          id?: string;
          buyer_id: string;
          note_id: string;
          price_paid: number;
          payment_method: 'points' | 'dollars';
          created_at?: string;
        };
        Update: {
          id?: string;
          buyer_id?: string;
          note_id?: string;
          price_paid?: number;
          payment_method?: 'points' | 'dollars';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      user_reviews: {
        Row: {
          id: string;
          reviewer_id: string;
          reviewed_user_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reviewer_id: string;
          reviewed_user_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reviewer_id?: string;
          reviewed_user_id?: string;
          rating?: number;
          comment?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_reviews_reviewed_user_id_fkey";
            columns: ["reviewed_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          domain: string;
          display_name: string;
          discount_percent: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          domain: string;
          display_name: string;
          discount_percent?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          domain?: string;
          display_name?: string;
          discount_percent?: number;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      promo_codes: {
        Row: {
          id: string;
          code: string;
          points_amount: number;
          expires_at: string | null;
          is_active: boolean;
          max_uses: number | null;
          current_uses: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          points_amount: number;
          expires_at?: string | null;
          is_active?: boolean;
          max_uses?: number | null;
          current_uses?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          points_amount?: number;
          expires_at?: string | null;
          is_active?: boolean;
          max_uses?: number | null;
          current_uses?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      promo_code_redemptions: {
        Row: {
          id: string;
          promo_code_id: string;
          user_id: string;
          points_received: number;
          redeemed_at: string;
        };
        Insert: {
          id?: string;
          promo_code_id: string;
          user_id: string;
          points_received: number;
          redeemed_at?: string;
        };
        Update: {
          id?: string;
          promo_code_id?: string;
          user_id?: string;
          points_received?: number;
          redeemed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promo_code_redemptions_promo_code_id_fkey";
            columns: ["promo_code_id"];
            isOneToOne: false;
            referencedRelation: "promo_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promo_code_redemptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type User = Database["public"]["Tables"]["users"]["Row"];
export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type NoteTag = Database["public"]["Tables"]["note_tags"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type Purchase = Database["public"]["Tables"]["purchases"]["Row"];
export type UserReview = Database["public"]["Tables"]["user_reviews"]["Row"];
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type PromoCode = Database["public"]["Tables"]["promo_codes"]["Row"];
export type PromoCodeRedemption = Database["public"]["Tables"]["promo_code_redemptions"]["Row"];

export type NoteWithTags = Note & {
  tags: Tag[];
  users: User;
};

export type NoteWithUser = Note & {
  users: User;
};

export type AIValidation = {
  isValid: boolean;
  feedback: string;
  grammar_score: number;
  accuracy_score?: number;
};

export type AISummary = {
  summary: string;
};

export type AITags = {
  tags: string[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
