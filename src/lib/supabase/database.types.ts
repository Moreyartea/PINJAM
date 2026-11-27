import type {
  AccountStatus,
  ApplicationStatus,
  AssignmentStatus,
  BookingStatus,
  HandoverActorType,
  LoanStatus,
  MaintenanceStatus,
  ProjectorCondition,
  ProjectorPhysicalStatus,
  AccessoriesCondition,
  UnitDisposition,
  UserRole,
} from "@/types/domain";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type EmptyRelationships = [];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_provider_user_id: string | null;
          email: string;
          full_name: string;
          role: UserRole;
          account_status: AccountStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_provider_user_id?: string | null;
          email: string;
          full_name: string;
          role: UserRole;
          account_status?: AccountStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_provider_user_id?: string | null;
          email?: string;
          full_name?: string;
          role?: UserRole;
          account_status?: AccountStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      komting_applications: {
        Row: {
          id: string;
          user_id: string;
          student_id: string;
          class_name: string;
          identity_photo_storage_key: string;
          application_type: "NEW" | "REPLACEMENT";
          status: ApplicationStatus;
          admin_note: string | null;
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          submitted_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          student_id: string;
          class_name: string;
          identity_photo_storage_key: string;
          application_type?: "NEW" | "REPLACEMENT";
          status?: ApplicationStatus;
          admin_note?: string | null;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          submitted_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          student_id?: string;
          class_name?: string;
          identity_photo_storage_key?: string;
          application_type?: "NEW" | "REPLACEMENT";
          status?: ApplicationStatus;
          admin_note?: string | null;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          submitted_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      komting_assignments: {
        Row: {
          id: string;
          user_id: string;
          class_name: string;
          status: AssignmentStatus;
          started_at: string;
          ended_at: string | null;
          created_by: string | null;
          ended_by: string | null;
          end_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          class_name: string;
          status?: AssignmentStatus;
          started_at?: string;
          ended_at?: string | null;
          created_by?: string | null;
          ended_by?: string | null;
          end_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          class_name?: string;
          status?: AssignmentStatus;
          started_at?: string;
          ended_at?: string | null;
          created_by?: string | null;
          ended_by?: string | null;
          end_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      projectors: {
        Row: {
          id: string;
          asset_code: string;
          name: string;
          brand: string | null;
          model: string | null;
          physical_status: ProjectorPhysicalStatus;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          asset_code: string;
          name: string;
          brand?: string | null;
          model?: string | null;
          physical_status?: ProjectorPhysicalStatus;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          asset_code?: string;
          name?: string;
          brand?: string | null;
          model?: string | null;
          physical_status?: ProjectorPhysicalStatus;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      operating_hours: {
        Row: {
          id: string;
          service_date: string;
          timezone: string;
          opens_at: string;
          closes_at: string;
          admin_early_open_at: string | null;
          note: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service_date: string;
          timezone?: string;
          opens_at: string;
          closes_at: string;
          admin_early_open_at?: string | null;
          note?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          service_date?: string;
          timezone?: string;
          opens_at?: string;
          closes_at?: string;
          admin_early_open_at?: string | null;
          note?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      bookings: {
        Row: {
          id: string;
          booking_code: string;
          komting_id: string;
          projector_id: string;
          booking_date: string;
          start_time: string;
          start_at: string;
          estimated_return_at: string;
          status: BookingStatus;
          operating_hours_snapshot: Json;
          pickup_window_start_at: string;
          pickup_window_end_at: string;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_code: string;
          komting_id: string;
          projector_id: string;
          booking_date: string;
          start_time: string;
          start_at?: string;
          estimated_return_at: string;
          status?: BookingStatus;
          operating_hours_snapshot: Json;
          pickup_window_start_at: string;
          pickup_window_end_at: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_code?: string;
          komting_id?: string;
          projector_id?: string;
          booking_date?: string;
          start_time?: string;
          start_at?: string;
          estimated_return_at?: string;
          status?: BookingStatus;
          operating_hours_snapshot?: Json;
          pickup_window_start_at?: string;
          pickup_window_end_at?: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      loans: {
        Row: {
          id: string;
          booking_id: string;
          projector_id: string;
          komting_id: string;
          status: LoanStatus;
          picked_up_at: string;
          pickup_processed_by: string;
          pickup_received_by: HandoverActorType;
          representative_name: string | null;
          returned_at: string | null;
          return_processed_by: string | null;
          return_received_by: HandoverActorType | null;
          return_representative_name: string | null;
          lifecycle_seq: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          projector_id: string;
          komting_id: string;
          status?: LoanStatus;
          picked_up_at?: string;
          pickup_processed_by: string;
          pickup_received_by: HandoverActorType;
          representative_name?: string | null;
          returned_at?: string | null;
          return_processed_by?: string | null;
          return_received_by?: HandoverActorType | null;
          return_representative_name?: string | null;
          lifecycle_seq?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          projector_id?: string;
          komting_id?: string;
          status?: LoanStatus;
          picked_up_at?: string;
          pickup_processed_by?: string;
          pickup_received_by?: HandoverActorType;
          representative_name?: string | null;
          returned_at?: string | null;
          return_processed_by?: string | null;
          return_received_by?: HandoverActorType | null;
          return_representative_name?: string | null;
          lifecycle_seq?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      loan_fines: {
        Row: {
          id: string;
          loan_id: string;
          fine_type: "LATE_RETURN" | "DAMAGE" | "LOSS" | "NONE";
          amount: number;
          overdue_minutes: number;
          status: "PENDING" | "WAIVED" | "PAID" | "EXEMPT";
          calculation_details: Json;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          fine_type: "LATE_RETURN" | "DAMAGE" | "LOSS" | "NONE";
          amount?: number;
          overdue_minutes?: number;
          status?: "PENDING" | "WAIVED" | "PAID" | "EXEMPT";
          calculation_details?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          loan_id?: string;
          fine_type?: "LATE_RETURN" | "DAMAGE" | "LOSS" | "NONE";
          amount?: number;
          overdue_minutes?: number;
          status?: "PENDING" | "WAIVED" | "PAID" | "EXEMPT";
          calculation_details?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      return_inspections: {
        Row: {
          id: string;
          loan_id: string;
          projector_condition: ProjectorCondition;
          accessories_condition: AccessoriesCondition;
          note: string | null;
          evidence_photo_storage_key: string | null;
          unit_disposition: UnitDisposition;
          inspected_by: string;
          inspected_at: string;
          lifecycle_seq: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          loan_id: string;
          projector_condition: ProjectorCondition;
          accessories_condition: AccessoriesCondition;
          note?: string | null;
          evidence_photo_storage_key?: string | null;
          unit_disposition: UnitDisposition;
          inspected_by: string;
          inspected_at?: string;
          lifecycle_seq?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          loan_id?: string;
          projector_condition?: ProjectorCondition;
          accessories_condition?: AccessoriesCondition;
          note?: string | null;
          evidence_photo_storage_key?: string | null;
          unit_disposition?: UnitDisposition;
          inspected_by?: string;
          inspected_at?: string;
          lifecycle_seq?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      maintenance_records: {
        Row: {
          id: string;
          projector_id: string;
          reason: string;
          note: string | null;
          status: MaintenanceStatus;
          created_by: string;
          started_at: string;
          resolution_note: string | null;
          completed_by: string | null;
          completed_at: string | null;
          lifecycle_seq: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          projector_id: string;
          reason: string;
          note?: string | null;
          status?: MaintenanceStatus;
          created_by: string;
          started_at?: string;
          resolution_note?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          lifecycle_seq?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          projector_id?: string;
          reason?: string;
          note?: string | null;
          status?: MaintenanceStatus;
          created_by?: string;
          started_at?: string;
          resolution_note?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          lifecycle_seq?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      qr_tokens: {
        Row: {
          id: string;
          booking_id: string;
          loan_id: string | null;
          token_hash: string;
          scope: "PICKUP" | "RETURN" | "PICKUP_AND_RETURN";
          expires_at: string;
          pickup_used_at: string | null;
          return_used_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          loan_id?: string | null;
          token_hash: string;
          scope?: "PICKUP" | "RETURN" | "PICKUP_AND_RETURN";
          expires_at: string;
          pickup_used_at?: string | null;
          return_used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          loan_id?: string | null;
          token_hash?: string;
          scope?: "PICKUP" | "RETURN" | "PICKUP_AND_RETURN";
          expires_at?: string;
          pickup_used_at?: string | null;
          return_used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      email_outbox: {
        Row: {
          id: string;
          event_type: string;
          recipient: string;
          payload: Json;
          deduplication_key: string;
          status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
          attempt_count: number;
          next_attempt_at: string;
          locked_at: string | null;
          sent_at: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          recipient: string;
          payload?: Json;
          deduplication_key: string;
          status?: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
          attempt_count?: number;
          next_attempt_at?: string;
          locked_at?: string | null;
          sent_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          recipient?: string;
          payload?: Json;
          deduplication_key?: string;
          status?: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
          attempt_count?: number;
          next_attempt_at?: string;
          locked_at?: string | null;
          sent_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      audit_logs: {
        Row: {
          id: string;
          actor_user_id: string | null;
          actor_role: UserRole | "SYSTEM";
          actor_source: "API" | "SYSTEM_JOB";
          action: string;
          entity_type: string;
          entity_id: string;
          before_data: Json | null;
          after_data: Json | null;
          reason: string | null;
          request_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          actor_role: UserRole | "SYSTEM";
          actor_source?: "API" | "SYSTEM_JOB";
          action: string;
          entity_type: string;
          entity_id: string;
          before_data?: Json | null;
          after_data?: Json | null;
          reason?: string | null;
          request_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: EmptyRelationships;
      };
      idempotency_records: {
        Row: {
          id: string;
          idempotency_key: string;
          actor_user_id: string | null;
          route_or_operation: string;
          request_hash: string;
          status: "IN_PROGRESS" | "COMPLETED";
          response_status: number | null;
          response_body: Json | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          actor_user_id?: string | null;
          route_or_operation: string;
          request_hash: string;
          status?: "IN_PROGRESS" | "COMPLETED";
          response_status?: number | null;
          response_body?: Json | null;
          created_at?: string;
          updated_at?: string;
          expires_at: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          actor_user_id?: string | null;
          route_or_operation?: string;
          request_hash?: string;
          status?: "IN_PROGRESS" | "COMPLETED";
          response_status?: number | null;
          response_body?: Json | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string;
        };
        Relationships: EmptyRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_app_user_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      current_app_user_role: {
        Args: Record<string, never>;
        Returns: UserRole | null;
      };
      current_app_user_is_active: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      rpc_admin_approve_komting_application: {
        Args: {
          p_application_id: string;
          p_admin_user_id: string;
          p_admin_note?: string | null;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_admin_reject_komting_application: {
        Args: {
          p_application_id: string;
          p_admin_user_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_admin_approve_komting_replacement: {
        Args: {
          p_application_id: string;
          p_admin_user_id: string;
          p_admin_note?: string | null;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_admin_deactivate_komting_assignment: {
        Args: {
          p_assignment_id: string;
          p_admin_user_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_admin_upsert_operating_hours: {
        Args: {
          p_service_date: string;
          p_opens_at: string;
          p_closes_at: string;
          p_admin_early_open_at?: string | null;
          p_note?: string | null;
          p_admin_user_id: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_admin_deactivate_projector: {
        Args: {
          p_projector_id: string;
          p_admin_user_id: string;
          p_reason?: string | null;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_komting_create_booking: {
        Args: {
          p_komting_user_id: string;
          p_projector_id: string;
          p_booking_date: string;
          p_start_time: string;
          p_estimated_return_at: string;
          p_operating_hours_snapshot: Json;
          p_pickup_window_start_at: string;
          p_pickup_window_end_at: string;
          p_qr_token_hash: string;
          p_qr_expires_at: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_komting_cancel_booking: {
        Args: {
          p_booking_id: string;
          p_komting_user_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_staff_confirm_pickup: {
        Args: {
          p_booking_id: string;
          p_staff_user_id: string;
          p_qr_payload_hash: string;
          p_received_by: string;
          p_representative_name?: string | null;
          p_note?: string | null;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_staff_confirm_return: {
        Args: {
          p_loan_id: string;
          p_staff_user_id: string;
          p_qr_payload_hash: string | null;
          p_returned_by: string;
          p_representative_name?: string | null;
          p_projector_condition?: string;
          p_accessories_condition?: string;
          p_unit_disposition?: string | null;
          p_note?: string | null;
          p_evidence_photo_storage_key?: string | null;
          p_fine_amount?: number;
          p_fine_notes?: string | null;
          p_request_id?: string;
        };
        Returns: Json;
      };
      rpc_claim_email_outbox_batch: {
        Args: {
          p_batch_size?: number;
          p_lock_timeout_seconds?: number;
        };
        Returns: Database["public"]["Tables"]["email_outbox"]["Row"][];
      };
    };
  };
}

export type PublicUserRow = Database["public"]["Tables"]["users"]["Row"];
export type KomtingApplicationRow = Database["public"]["Tables"]["komting_applications"]["Row"];
export type KomtingAssignmentRow = Database["public"]["Tables"]["komting_assignments"]["Row"];
export type ProjectorRow = Database["public"]["Tables"]["projectors"]["Row"];
export type OperatingHoursRow = Database["public"]["Tables"]["operating_hours"]["Row"];
export type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
export type LoanFineRow = Database["public"]["Tables"]["loan_fines"]["Row"];
export type EmailOutboxRow = Database["public"]["Tables"]["email_outbox"]["Row"];
