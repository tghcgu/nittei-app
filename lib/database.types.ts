export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          share_id: string
          name: string
          description: string | null
          answer_choices: AnswerChoiceSet
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          share_id: string
          name: string
          description?: string | null
          answer_choices?: AnswerChoiceSet
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          share_id?: string
          name?: string
          description?: string | null
          answer_choices?: AnswerChoiceSet
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          id: string
          event_id: string
          date: string
          time_label: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          event_id: string
          date: string
          time_label?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          event_id?: string
          date?: string
          time_label?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      responses: {
        Row: {
          id: string
          event_id: string
          name: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      answers: {
        Row: {
          id: string
          response_id: string
          candidate_id: string
          value: AnswerValue
          note: string | null
        }
        Insert: {
          id?: string
          response_id: string
          candidate_id: string
          value: AnswerValue
          note?: string | null
        }
        Update: {
          id?: string
          response_id?: string
          candidate_id?: string
          value?: AnswerValue
          note?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// 便利な型エイリアス
export type Event = Database['public']['Tables']['events']['Row']
export type Candidate = Database['public']['Tables']['candidates']['Row']
export type Answer = Database['public']['Tables']['answers']['Row']
export type AnswerValue = '◎' | '○' | '△' | '✕' | '-'
// 主催者が選ぶ回答の選択肢セット（伝助と同じ3種類）
export type AnswerChoiceSet = '○△✕' | '○✕' | '◎○△✕'
