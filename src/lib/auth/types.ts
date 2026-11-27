import type { KomtingAssignmentSummary, UserProfile, UserRole } from "@/types/domain";
import type { KomtingAssignmentRow, PublicUserRow } from "@/lib/supabase/database.types";

export interface SupabaseAuthIdentity {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

export interface AuthenticatedUserContext {
  authUserId: string;
  user: UserProfile;
  rawUser: PublicUserRow;
  komtingAssignment: KomtingAssignmentSummary | null;
}

export interface ActiveKomtingContext extends AuthenticatedUserContext {
  user: UserProfile & { role: "KOMTING" };
  komtingAssignment: KomtingAssignmentSummary & { status: "ACTIVE" };
}

export type SessionLookupFailureReason =
  "UNAUTHENTICATED" | "INVALID_SESSION" | "PROFILE_NOT_FOUND";

export type SessionContextResult =
  | {
      authenticated: true;
      context: AuthenticatedUserContext;
    }
  | {
      authenticated: false;
      reason: SessionLookupFailureReason;
      context: null;
    };

export type AuthSyncResult =
  | {
      status: "SYNCED";
      profile: PublicUserRow;
    }
  | {
      status: "NOT_FOUND";
      profile: null;
    };

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  user: UserProfile;
  session: {
    expires_at: string | null;
  };
}

export interface RequireAuthenticatedOptions {
  /**
   * When true, allows PENDING_VERIFICATION / INACTIVE / REJECTED profiles
   * (strictly for self-inspection routes like profile status if needed).
   * Defaults to false: only ACTIVE accounts pass.
   */
  allowNonActive?: boolean;
}

export interface AuthUserRepository {
  findByAuthProviderUserId(authProviderUserId: string): Promise<PublicUserRow | null>;
  linkUnlinkedUserByEmail(
    normalizedEmail: string,
    authProviderUserId: string
  ): Promise<PublicUserRow | null>;
  updateEmail(userId: string, normalizedEmail: string): Promise<PublicUserRow | null>;
  findActiveKomtingAssignment(userId: string): Promise<KomtingAssignmentRow | null>;
}

export type AllowedRoles = readonly UserRole[];
