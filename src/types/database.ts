export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Timestamp = string

export type Database = {
  public: {
    Tables: {
      contracts: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          updated_at: Timestamp | null
          quote_id: string | null
          contract_number: string
          customer_name: string
          customer_email: string | null
          customer_phone: string | null
          first_name: string | null
          last_name: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          province: string | null
          postal_code: string | null
          country: string | null
          company_name: string | null
          start_date: string
          end_date: string | null
          date_of_birth: string | null
          frequency: string
          package_length: number
          participants: number
          total_sessions: number
          price_per_session: number
          subtotal: number
          tax_amount: number
          total_amount: number
          down_payment: number | null
          split_payment: boolean | null
          split_payment_amount: number | null
          discount_percent: number | null
          payment_method: string
          payment_schedule: string
          payment_amount: number | null
          processing_fee: number | null
          status: string | null
          invoice_status: string | null
          square_customer_id: string | null
          square_invoice_id: string | null
          square_payment_link: string | null
          participant_contract_count: number | null
          participant_contract_signed_count: number | null
          notes: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          trainer_id: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          quote_id?: string | null
          contract_number?: string
          customer_name: string
          customer_email?: string | null
          customer_phone?: string | null
          first_name?: string | null
          last_name?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          province?: string | null
          postal_code?: string | null
          country?: string | null
          company_name?: string | null
          start_date: string
          end_date?: string | null
          date_of_birth?: string | null
          frequency: string
          package_length: number
          participants: number
          total_sessions: number
          price_per_session: number
          subtotal: number
          tax_amount: number
          total_amount: number
          down_payment?: number | null
          split_payment?: boolean | null
          split_payment_amount?: number | null
          discount_percent?: number | null
          payment_method: string
          payment_schedule: string
          payment_amount?: number | null
          processing_fee?: number | null
          status?: string | null
          invoice_status?: string | null
          square_customer_id?: string | null
          square_invoice_id?: string | null
          square_payment_link?: string | null
          participant_contract_count?: number | null
          participant_contract_signed_count?: number | null
          notes?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          trainer_id?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          quote_id?: string | null
          contract_number?: string
          customer_name?: string
          customer_email?: string | null
          customer_phone?: string | null
          first_name?: string | null
          last_name?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          province?: string | null
          postal_code?: string | null
          country?: string | null
          company_name?: string | null
          start_date?: string
          end_date?: string | null
          date_of_birth?: string | null
          frequency?: string
          package_length?: number
          participants?: number
          total_sessions?: number
          price_per_session?: number
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          down_payment?: number | null
          split_payment?: boolean | null
          split_payment_amount?: number | null
          discount_percent?: number | null
          payment_method?: string
          payment_schedule?: string
          payment_amount?: number | null
          processing_fee?: number | null
          status?: string | null
          invoice_status?: string | null
          square_customer_id?: string | null
          square_invoice_id?: string | null
          square_payment_link?: string | null
          participant_contract_count?: number | null
          participant_contract_signed_count?: number | null
          notes?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'contracts_quote_id_fkey'
            columns: ['quote_id']
            referencedRelation: 'quotes'
            referencedColumns: ['id']
          }
        ]
      }
      contract_invoice_instances: {
        Row: {
          id: string
          created_at: Timestamp | null
          contract_id: string
          participant_contract_id: string
          square_customer_id: string | null
          square_invoice_id: string | null
          square_invoice_number: string | null
          square_public_url: string | null
          installment_index: number
          installment_total_cents: number
          participant_share_cents: number
          due_date: string
          scheduled_at: string | null
          status: string
          metadata: Json | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          contract_id: string
          participant_contract_id: string
          square_customer_id?: string | null
          square_invoice_id?: string | null
          square_invoice_number?: string | null
          square_public_url?: string | null
          installment_index: number
          installment_total_cents: number
          participant_share_cents: number
          due_date: string
          scheduled_at?: string | null
          status?: string
          metadata?: Json | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          contract_id?: string
          participant_contract_id?: string
          square_customer_id?: string | null
          square_invoice_id?: string | null
          square_invoice_number?: string | null
          square_public_url?: string | null
          installment_index?: number
          installment_total_cents?: number
          participant_share_cents?: number
          due_date?: string
          scheduled_at?: string | null
          status?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'contract_invoice_instances_contract_id_fkey'
            columns: ['contract_id']
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contract_invoice_instances_participant_contract_id_fkey'
            columns: ['participant_contract_id']
            referencedRelation: 'participant_contracts'
            referencedColumns: ['id']
          }
        ]
      }
      invoice_notifications: {
        Row: {
          id: string
          created_at: Timestamp
          invoice_instance_id: string
          contract_id: string
          status: string
          message: string
          read_at: Timestamp | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp
          invoice_instance_id: string
          contract_id: string
          status: string
          message: string
          read_at?: Timestamp | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          created_at?: Timestamp
          invoice_instance_id?: string
          contract_id?: string
          status?: string
          message?: string
          read_at?: Timestamp | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_notifications_invoice_instance_id_fkey'
            columns: ['invoice_instance_id']
            referencedRelation: 'contract_invoice_instances'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_notifications_contract_id_fkey'
            columns: ['contract_id']
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          }
        ]
      }
      participant_contracts: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          updated_at: Timestamp | null
          contract_id: string
          quote_id: string | null
          participant_id: string | null
          participant_index: number
          participant_name: string
          participant_email: string | null
          participant_phone: string | null
          payment_share: number | null
          discount_percent: number | null
          contract_number: string | null
          contract_payload: Json | null
          price_per_session: number | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          payment_schedule: string | null
          payment_method: string | null
          start_date: string | null
          end_date: string | null
          status: string | null
          signature_data: string | null
          signed_date: string | null
          square_invoice_id: string | null
          square_payment_link: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          contract_id: string
          quote_id?: string | null
          participant_id?: string | null
          participant_index: number
          participant_name: string
          participant_email?: string | null
          participant_phone?: string | null
          payment_share?: number | null
          discount_percent?: number | null
          contract_number?: string | null
          contract_payload?: Json | null
          price_per_session?: number | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          payment_schedule?: string | null
          payment_method?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: string | null
          signature_data?: string | null
          signed_date?: string | null
          square_invoice_id?: string | null
          square_payment_link?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          contract_id?: string
          quote_id?: string | null
          participant_id?: string | null
          participant_index?: number
          participant_name?: string
          participant_email?: string | null
          participant_phone?: string | null
          payment_share?: number | null
          discount_percent?: number | null
          contract_number?: string | null
          contract_payload?: Json | null
          price_per_session?: number | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          payment_schedule?: string | null
          payment_method?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: string | null
          signature_data?: string | null
          signed_date?: string | null
          square_invoice_id?: string | null
          square_payment_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'participant_contracts_contract_id_fkey'
            columns: ['contract_id']
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'participant_contracts_quote_id_fkey'
            columns: ['quote_id']
            referencedRelation: 'quotes'
            referencedColumns: ['id']
          }
        ]
      }
      contract_participants: {
        Row: {
          id: string
          created_at: Timestamp | null
          contract_id: string
          participant_index: number
          full_name: string
          email: string | null
          phone: string | null
          payment_share: number | null
          square_customer_id: string | null
          square_invoice_id: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          contract_id: string
          participant_index: number
          full_name: string
          email?: string | null
          phone?: string | null
          payment_share?: number | null
          square_customer_id?: string | null
          square_invoice_id?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          contract_id?: string
          participant_index?: number
          full_name?: string
          email?: string | null
          phone?: string | null
          payment_share?: number | null
          square_customer_id?: string | null
          square_invoice_id?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'contract_participants_contract_id_fkey'
            columns: ['contract_id']
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          }
        ]
      }
      quotes: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          updated_at: Timestamp | null
          customer_name: string
          customer_email: string | null
          customer_phone: string | null
          start_date: string
          participants: number
          frequency: string
          package_length: number
          total_sessions: number
          price_per_session: number
          subtotal: number
          tax_amount: number
          processing_fee: number | null
          total_amount: number
          payment_method: string
          payment_schedule: string
          down_payment: number | null
          discount_percent: number | null
          split_payment: boolean | null
          split_payment_amount: number | null
          status: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          customer_name: string
          customer_email?: string | null
          customer_phone?: string | null
          start_date: string
          participants: number
          frequency: string
          package_length: number
          total_sessions: number
          price_per_session: number
          subtotal: number
          tax_amount: number
          processing_fee?: number | null
          total_amount: number
          payment_method: string
          payment_schedule: string
          down_payment?: number | null
          discount_percent?: number | null
          split_payment?: boolean | null
          split_payment_amount?: number | null
          status?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          customer_name?: string
          customer_email?: string | null
          customer_phone?: string | null
          start_date?: string
          participants?: number
          frequency?: string
          package_length?: number
          total_sessions?: number
          price_per_session?: number
          subtotal?: number
          tax_amount?: number
          processing_fee?: number | null
          total_amount?: number
          payment_method?: string
          payment_schedule?: string
          down_payment?: number | null
          discount_percent?: number | null
          split_payment?: boolean | null
          split_payment_amount?: number | null
          status?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      quote_participants: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          quote_id: string
          participant_index: number
          full_name: string
          email: string | null
          phone: string | null
          payment_share: number | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          quote_id: string
          participant_index: number
          full_name: string
          email?: string | null
          phone?: string | null
          payment_share?: number | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          quote_id?: string
          participant_index?: number
          full_name?: string
          email?: string | null
          phone?: string | null
          payment_share?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'quote_participants_quote_id_fkey'
            columns: ['quote_id']
            referencedRelation: 'quotes'
            referencedColumns: ['id']
          }
        ]
      }
      contract_signatures: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          participant_contract_id: string | null
          signature_data: string | null
          signed_date: string | null
          signer_name: string | null
          signer_email: string | null
          signer_ip: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          participant_contract_id?: string | null
          signature_data?: string | null
          signed_date?: string | null
          signer_name?: string | null
          signer_email?: string | null
          signer_ip?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          participant_contract_id?: string | null
          signature_data?: string | null
          signed_date?: string | null
          signer_name?: string | null
          signer_email?: string | null
          signer_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'contract_signatures_participant_contract_id_fkey'
            columns: ['participant_contract_id']
            referencedRelation: 'participant_contracts'
            referencedColumns: ['id']
          }
        ]
      }
      admin_users: {
        Row: {
          id: string
          created_at: Timestamp | null
          user_id: string
          first_name: string | null
          last_name: string | null
          phone: string | null
          role: string
          is_active: boolean
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          user_id: string
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          role?: string
          is_active?: boolean
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          user_id?: string
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          role?: string
          is_active?: boolean
        }
        Relationships: []
      }
      trainers: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          updated_at: Timestamp | null
          first_name: string | null
          last_name: string | null
          display_name: string
          email: string | null
          phone: string | null
          status: string | null
          bio: string | null
          specialties: Json | null
          hourly_rate: number | null
          salary: number | null
          payment_type: string | null
          avatar_url: string | null
          level: number | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          first_name?: string | null
          last_name?: string | null
          display_name: string
          email?: string | null
          phone?: string | null
          status?: string | null
          bio?: string | null
          specialties?: Json | null
          hourly_rate?: number | null
          salary?: number | null
          payment_type?: string | null
          avatar_url?: string | null
          level?: number | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          first_name?: string | null
          last_name?: string | null
          display_name?: string
          email?: string | null
          phone?: string | null
          status?: string | null
          bio?: string | null
          specialties?: Json | null
          hourly_rate?: number | null
          salary?: number | null
          payment_type?: string | null
          avatar_url?: string | null
          level?: number | null
        }
        Relationships: []
      }
      contract_schedule_entries: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          contract_id: string
          schedule_day: string
          start_time: string
          trainer_id: string
          recurring: boolean | null
          notes: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          contract_id: string
          schedule_day: string
          start_time: string
          trainer_id: string
          recurring?: boolean | null
          notes?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          contract_id?: string
          schedule_day?: string
          start_time?: string
          trainer_id?: string
          recurring?: boolean | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'contract_schedule_entries_contract_id_fkey'
            columns: ['contract_id']
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contract_schedule_entries_trainer_id_fkey'
            columns: ['trainer_id']
            referencedRelation: 'trainers'
            referencedColumns: ['id']
          }
        ]
      }
      trainer_payroll: {
        Row: {
          id: string
          created_at: Timestamp | null
          trainer_id: string
          amount: number
          status: string
          period_start: string | null
          period_end: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          trainer_id: string
          amount?: number
          status?: string
          period_start?: string | null
          period_end?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          trainer_id?: string
          amount?: number
          status?: string
          period_start?: string | null
          period_end?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'trainer_payroll_trainer_id_fkey'
            columns: ['trainer_id']
            referencedRelation: 'trainers'
            referencedColumns: ['id']
          }
        ]
      }
      client_trainer_assignments: {
        Row: {
          id: string
          created_at: Timestamp | null
          client_id: string
          trainer_id: string
          assigned_date: string | null
          unassigned_date: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          client_id: string
          trainer_id: string
          assigned_date?: string | null
          unassigned_date?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          client_id?: string
          trainer_id?: string
          assigned_date?: string | null
          unassigned_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'client_trainer_assignments_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'client_trainer_assignments_trainer_id_fkey'
            columns: ['trainer_id']
            referencedRelation: 'trainers'
            referencedColumns: ['id']
          }
        ]
      }
      clients: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          updated_at: Timestamp | null
          first_name: string
          last_name: string
          email: string
          phone: string | null
          address: string | null
          city: string | null
          province: string | null
          postal_code: string | null
          country: string | null
          company_name: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          notes: string | null
          is_active: boolean | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          first_name: string
          last_name: string
          email: string
          phone?: string | null
          address?: string | null
          city?: string | null
          province?: string | null
          postal_code?: string | null
          country?: string | null
          company_name?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          notes?: string | null
          is_active?: boolean | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          updated_at?: Timestamp | null
          first_name?: string
          last_name?: string
          email?: string
          phone?: string | null
          address?: string | null
          city?: string | null
          province?: string | null
          postal_code?: string | null
          country?: string | null
          company_name?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          notes?: string | null
          is_active?: boolean | null
        }
        Relationships: []
      }
      training_sessions: {
        Row: {
          id: string
          created_at: Timestamp | null
          created_by: string | null
          contract_id: string | null
          trainer_id: string
          session_date: string
          start_time: string
          end_time: string
          session_number: number | null
          session_type: string | null
          status: string | null
          notes: string | null
          class_type: string | null
          team: string | null
          participant_ids: string[] | null
          participants_attended: Json | null
          attendance_notes: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          contract_id?: string | null
          trainer_id: string
          session_date: string
          start_time: string
          end_time: string
          session_number?: number | null
          session_type?: string | null
          status?: string | null
          notes?: string | null
          class_type?: string | null
          team?: string | null
          participant_ids?: string[] | null
          participants_attended?: Json | null
          attendance_notes?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          created_by?: string | null
          contract_id?: string | null
          trainer_id?: string
          session_date?: string
          start_time?: string
          end_time?: string
          session_number?: number | null
          session_type?: string | null
          status?: string | null
          notes?: string | null
          class_type?: string | null
          team?: string | null
          participant_ids?: string[] | null
          participants_attended?: Json | null
          attendance_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'training_sessions_contract_id_fkey'
            columns: ['contract_id']
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'training_sessions_trainer_id_fkey'
            columns: ['trainer_id']
            referencedRelation: 'trainers'
            referencedColumns: ['id']
          }
        ]
      }
      hours: {
        Row: {
          id: string
          created_at: Timestamp | null
          trainer_id: string
          date: string
          day_of_week: string
          opening_time: string | null
          closing_time: string | null
          hours_worked: number | null
          is_closed: boolean
          status: string
          notes: string | null
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          trainer_id: string
          date: string
          day_of_week: string
          opening_time?: string | null
          closing_time?: string | null
          hours_worked?: number | null
          is_closed?: boolean
          status?: string
          notes?: string | null
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          trainer_id?: string
          date?: string
          day_of_week?: string
          opening_time?: string | null
          closing_time?: string | null
          hours_worked?: number | null
          is_closed?: boolean
          status?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'hours_trainer_id_fkey'
            columns: ['trainer_id']
            referencedRelation: 'trainers'
            referencedColumns: ['id']
          }
        ]
      }
      payroll_periods: {
        Row: {
          id: string
          created_at: Timestamp | null
          period_type: string
          start_date: string
          end_date: string
          status: string
          total_amount: number
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          period_type: string
          start_date: string
          end_date: string
          status?: string
          total_amount?: number
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          period_type?: string
          start_date?: string
          end_date?: string
          status?: string
          total_amount?: number
        }
        Relationships: []
      }
      payroll_entries: {
        Row: {
          id: string
          created_at: Timestamp | null
          payroll_period_id: string
          trainer_id: string
          gross_amount: number
          net_amount: number
          status: string
        }
        Insert: {
          id?: string
          created_at?: Timestamp | null
          payroll_period_id: string
          trainer_id: string
          gross_amount?: number
          net_amount?: number
          status?: string
        }
        Update: {
          id?: string
          created_at?: Timestamp | null
          payroll_period_id?: string
          trainer_id?: string
          gross_amount?: number
          net_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payroll_entries_payroll_period_id_fkey'
            columns: ['payroll_period_id']
            referencedRelation: 'payroll_periods'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payroll_entries_trainer_id_fkey'
            columns: ['trainer_id']
            referencedRelation: 'trainers'
            referencedColumns: ['id']
          }
        ]
      }
    },
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
};
