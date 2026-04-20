export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          share_id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          share_id: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          share_id?: string
          name?: string
          description?: string | null
          created_at?: string
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
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      answers: {
        Row: {
          id: string
          response_id: string
          candidate_id: string
          value: '○' | '△' | '✕' | '-'
          note: string | null
        }
        Insert: {
          id?: string
          response_id: string
          candidate_id: string
          value: '○' | '△' | '✕' | '-'
          note?: string | null
        }
        Update: {
          id?: string
          response_id?: string
          candidate_id?: string
          value?: '○' | '△' | '✕' | '-'
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
export type Response = Database['public']['Tables']['responses']['Row']
export type Answer = Database['public']['Tables']['answers']['Row']
export type AnswerValue = '○' | '△' | '✕' | '-'
