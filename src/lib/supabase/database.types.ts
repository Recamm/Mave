export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type RefundRow = {
  amount: number;
  amount_text: string;
  client_operation_id: string;
  created_at: string;
  deleted_at: string | null;
  expense_id: string;
  id: string;
  received_on: string;
  updated_at: string;
  user_id: string;
  version: number;
};

type MovementConflictRow = {
  chosen_revision_id: string | null;
  id: string;
  movement_id: string;
  opened_at: string;
  resolved_at: string | null;
  status: 'open' | 'resolved';
  user_id: string;
};

type MovementConflictRevisionRow = {
  action: 'create' | 'update' | 'delete';
  amount: number;
  amount_text: string;
  captured_at: string;
  category_id: string;
  conflict_id: string;
  currency: 'ARS' | 'USD';
  expected_version: number;
  financial_account_id: string | null;
  id: string;
  kind: 'income' | 'expense';
  note: string | null;
  occurred_on: string;
  source: 'server' | 'client';
  user_id: string;
};

type TransferRow = {
  amount: number;
  amount_text: string;
  client_operation_id: string;
  created_at: string;
  destination_account_id: string;
  id: string;
  occurred_on: string;
  source_account_id: string;
  user_id: string;
};

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          name: string;
          source: 'default' | 'custom';
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          source?: 'default' | 'custom';
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          source?: 'default' | 'custom';
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      financial_accounts: {
        Row: {
          created_at: string;
          currency: 'ARS' | 'USD';
          id: string;
          kind: 'cash' | 'bank' | 'wallet' | 'other';
          name: string;
          opening_balance: number | null;
          opening_balance_text: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          currency: 'ARS' | 'USD';
          id?: string;
          kind: 'cash' | 'bank' | 'wallet' | 'other';
          name: string;
          opening_balance?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          currency?: 'ARS' | 'USD';
          id?: string;
          kind?: 'cash' | 'bank' | 'wallet' | 'other';
          name?: string;
          opening_balance?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          created_at: string;
          currency: 'ARS' | 'USD';
          id: string;
          name: string;
          target_amount: number;
          target_amount_text: string;
          target_date: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          currency: 'ARS' | 'USD';
          id?: string;
          name: string;
          target_amount: string;
          target_date?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          currency?: 'ARS' | 'USD';
          id?: string;
          name?: string;
          target_amount?: string;
          target_date?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      goal_contributions: {
        Row: {
          amount: number;
          amount_text: string;
          contributed_on: string;
          created_at: string;
          goal_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          amount: string;
          contributed_on: string;
          created_at?: string;
          goal_id: string;
          id?: string;
          user_id?: string;
        };
        Update: {
          amount?: string;
          contributed_on?: string;
          created_at?: string;
          goal_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      movements: {
        Row: {
          amount: number;
          amount_text: string;
          category_id: string;
          client_operation_id: string;
          created_at: string;
          currency: 'ARS' | 'USD';
          deleted_at: string | null;
          financial_account_id: string | null;
          id: string;
          kind: 'income' | 'expense';
          note: string | null;
          occurred_on: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          amount: string;
          category_id: string;
          client_operation_id?: string;
          created_at?: string;
          currency: 'ARS' | 'USD';
          deleted_at?: string | null;
          financial_account_id?: string | null;
          id?: string;
          kind: 'income' | 'expense';
          note?: string | null;
          occurred_on: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          amount?: string;
          category_id?: string;
          client_operation_id?: string;
          created_at?: string;
          currency?: 'ARS' | 'USD';
          deleted_at?: string | null;
          financial_account_id?: string | null;
          id?: string;
          kind?: 'income' | 'expense';
          note?: string | null;
          occurred_on?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      movement_conflicts: {
        Row: MovementConflictRow;
        Insert: {
          chosen_revision_id?: string | null;
          id?: string;
          movement_id: string;
          opened_at?: string;
          resolved_at?: string | null;
          status?: 'open' | 'resolved';
          user_id?: string;
        };
        Update: {
          chosen_revision_id?: string | null;
          id?: string;
          movement_id?: string;
          opened_at?: string;
          resolved_at?: string | null;
          status?: 'open' | 'resolved';
          user_id?: string;
        };
        Relationships: [];
      };
      movement_conflict_revisions: {
        Row: MovementConflictRevisionRow;
        Insert: {
          action: 'create' | 'update' | 'delete';
          amount: string;
          captured_at?: string;
          category_id: string;
          conflict_id: string;
          currency: 'ARS' | 'USD';
          expected_version: number;
          financial_account_id?: string | null;
          id?: string;
          kind: 'income' | 'expense';
          note?: string | null;
          occurred_on: string;
          source: 'server' | 'client';
          user_id?: string;
        };
        Update: {
          action?: 'create' | 'update' | 'delete';
          amount?: string;
          captured_at?: string;
          category_id?: string;
          conflict_id?: string;
          currency?: 'ARS' | 'USD';
          expected_version?: number;
          financial_account_id?: string | null;
          id?: string;
          kind?: 'income' | 'expense';
          note?: string | null;
          occurred_on?: string;
          source?: 'server' | 'client';
          user_id?: string;
        };
        Relationships: [];
      };
      refunds: {
        Row: RefundRow;
        Insert: {
          amount: string;
          client_operation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          expense_id: string;
          id?: string;
          received_on: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          amount?: string;
          client_operation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          expense_id?: string;
          id?: string;
          received_on?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      transfers: {
        Row: TransferRow;
        Insert: {
          amount: string;
          client_operation_id?: string;
          created_at?: string;
          destination_account_id: string;
          id?: string;
          occurred_on: string;
          source_account_id: string;
          user_id?: string;
        };
        Update: {
          amount?: string;
          client_operation_id?: string;
          created_at?: string;
          destination_account_id?: string;
          id?: string;
          occurred_on?: string;
          source_account_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      record_refund: {
        Args: {
          p_action: 'create' | 'update' | 'delete';
          p_amount: string | null;
          p_expected_version: number | null;
          p_expense_id: string | null;
          p_operation_id: string;
          p_received_on: string | null;
          p_refund_id: string | null;
        };
        Returns: RefundRow;
      };
      apply_movement_change: {
        Args: {
          p_action: 'create' | 'update' | 'delete';
          p_expected_version: number | null;
          p_movement_id: string;
          p_operation_id: string;
          p_payload: Json | null;
        };
        Returns: Json;
      };
      resolve_movement_conflict: {
        Args: {
          p_conflict_id: string;
          p_operation_id: string;
          p_revision_id: string;
        };
        Returns: Json;
      };
      record_transfer: {
        Args: {
          p_amount: string;
          p_destination_account_id: string;
          p_occurred_on: string;
          p_operation_id: string;
          p_source_account_id: string;
        };
        Returns: TransferRow;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
