import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET as adminAppsGetRoute } from "@/app/api/v1/admin/komting/applications/route";
import { POST as adminApproveRoute } from "@/app/api/v1/admin/komting/applications/[applicationId]/approve/route";
import { POST as adminApproveReplacementRoute } from "@/app/api/v1/admin/komting/applications/[applicationId]/approve-replacement/route";
import { POST as adminRejectRoute } from "@/app/api/v1/admin/komting/applications/[applicationId]/reject/route";
import { GET as adminAppDetailRoute } from "@/app/api/v1/admin/komting/applications/[applicationId]/route";
import { POST as adminDeactivateRoute } from "@/app/api/v1/admin/komting/assignments/[assignmentId]/deactivate/route";
import { GET as myAppGetRoute } from "@/app/api/v1/komting/applications/me/route";
import { POST as komtingAppPostRoute } from "@/app/api/v1/komting/applications/route";
import { GET as meGetRoute, PATCH as mePatchRoute } from "@/app/api/v1/me/route";
import { AuthError } from "@/lib/auth/errors";
import {
  requireActiveKomting,
  requireAdmin,
  requireAuthenticatedUser,
  requireRole,
} from "@/lib/auth/guards";
import type { SessionDependencies } from "@/lib/auth/session";
import type { AuthClientLike } from "@/lib/auth/session";
import type { AuthenticatedUserContext, AuthUserRepository } from "@/lib/auth/types";
import {
  approveKomtingApplication,
  approveKomtingReplacement,
  deactivateKomtingAssignment,
  getAdminKomtingApplicationDetail,
  getMyKomtingApplication,
  listAdminKomtingApplications,
  rejectKomtingApplication,
  submitKomtingApplication,
  type KomtingWorkflowRepository,
} from "@/lib/komting/komting-service";
import { getMyProfile, updateMyProfile, type ProfileRepository } from "@/lib/profile/me-service";
import {
  validateIdentityImageFile,
  type IdentityStorageAdapter,
} from "@/lib/storage/identity-storage";
import type {
  KomtingApplicationRow,
  KomtingAssignmentRow,
  PublicUserRow,
} from "@/lib/supabase/database.types";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function makeUserRow(overrides: Partial<PublicUserRow> = {}): PublicUserRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    auth_provider_user_id: "auth-1",
    email: "user@example.test",
    full_name: "Test User",
    role: "KOMTING",
    account_status: "ACTIVE",
    created_at: "2026-11-26T00:00:00Z",
    updated_at: "2026-11-26T00:00:00Z",
    ...overrides,
  };
}

function makeContext(
  overrides: {
    user?: Partial<PublicUserRow>;
    assignment?: KomtingAssignmentRow | null;
  } = {}
): AuthenticatedUserContext {
  const rawUser = makeUserRow(overrides.user);
  const assignment = overrides.assignment ?? null;

  return {
    authUserId: rawUser.auth_provider_user_id ?? "auth-1",
    rawUser,
    komtingAssignment: assignment
      ? {
          id: assignment.id,
          user_id: assignment.user_id,
          class_name: assignment.class_name,
          status: assignment.status,
          started_at: assignment.started_at,
          ended_at: assignment.ended_at,
        }
      : null,
    user: {
      id: rawUser.id,
      email: rawUser.email,
      full_name: rawUser.full_name,
      role: rawUser.role,
      account_status: rawUser.account_status,
      created_at: rawUser.created_at,
      komting_assignment: assignment
        ? {
            id: assignment.id,
            user_id: assignment.user_id,
            class_name: assignment.class_name,
            status: assignment.status,
            started_at: assignment.started_at,
            ended_at: assignment.ended_at,
          }
        : null,
    },
  };
}

function makeBearerDeps(
  userRow: PublicUserRow,
  assignment: KomtingAssignmentRow | null = null
): SessionDependencies {
  const authClient: AuthClientLike = {
    auth: {
      async getUser() {
        return {
          data: {
            user: {
              id: userRow.auth_provider_user_id ?? "auth-1",
              email: userRow.email,
              email_confirmed_at: "2026-11-26T00:00:00Z",
            },
          },
          error: null,
        };
      },
      async signInWithPassword() {
        return { data: { user: null, session: null }, error: { message: "unused" } };
      },
      async signOut() {
        return { error: null };
      },
    },
  };

  const repo: AuthUserRepository = {
    async findByAuthProviderUserId(id) {
      return userRow.auth_provider_user_id === id ? userRow : null;
    },
    async linkUnlinkedUserByEmail() {
      return null;
    },
    async updateEmail() {
      return userRow;
    },
    async findActiveKomtingAssignment(userId) {
      return assignment && assignment.user_id === userId && assignment.status === "ACTIVE"
        ? assignment
        : null;
    },
  };

  return {
    createBearerClient: () => authClient,
    userRepository: repo,
  };
}

function makeMemoryWorkflowState() {
  const users: PublicUserRow[] = [
    makeUserRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      auth_provider_user_id: "auth-admin",
      email: "admin@example.test",
      full_name: "Admin Test",
      role: "ADMIN",
    }),
    makeUserRow({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      auth_provider_user_id: "auth-staff",
      email: "staff@example.test",
      full_name: "Staff Test",
      role: "STAFF",
    }),
    makeUserRow({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      auth_provider_user_id: "auth-k1",
      email: "komting1@example.test",
      full_name: "Komting Satu",
      role: "KOMTING",
    }),
    makeUserRow({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      auth_provider_user_id: "auth-k2",
      email: "komting2@example.test",
      full_name: "Komting Dua",
      role: "KOMTING",
    }),
  ];
  const applications: KomtingApplicationRow[] = [];
  const assignments: KomtingAssignmentRow[] = [];
  const uploadedKeys = new Set<string>();

  const storage: IdentityStorageAdapter = {
    async uploadIdentityPhoto({ userId, file }) {
      await validateIdentityImageFile(file);
      const key = `applications/${userId}/${crypto.randomUUID()}.jpg`;
      uploadedKeys.add(key);
      return { storageKey: key };
    },
    async createSignedPhotoUrl(storageKey) {
      return uploadedKeys.has(storageKey)
        ? `https://signed.example.test/${storageKey}?token=short`
        : null;
    },
    async deleteIdentityPhoto(storageKey) {
      uploadedKeys.delete(storageKey);
    },
  };

  const repository: KomtingWorkflowRepository = {
    async hasActiveAssignmentForUser(userId) {
      return assignments.some((a) => a.user_id === userId && a.status === "ACTIVE");
    },
    async hasActiveAssignmentForClass(className) {
      const normalized = className.trim().toLowerCase();
      return assignments.some(
        (a) => a.class_name.trim().toLowerCase() === normalized && a.status === "ACTIVE"
      );
    },
    async hasActiveApplicationForUser(userId) {
      return applications.some(
        (a) =>
          a.user_id === userId &&
          [
            "PENDING_EMAIL_VERIFICATION",
            "PENDING_VERIFICATION",
            "PENDING_REVIEW",
            "PENDING_REPLACEMENT_NOTICE",
          ].includes(a.status)
      );
    },
    async createApplication({
      userId,
      studentId,
      className,
      identityPhotoStorageKey,
      applicationType,
    }) {
      const row: KomtingApplicationRow = {
        id: crypto.randomUUID(),
        user_id: userId,
        student_id: studentId,
        class_name: className,
        identity_photo_storage_key: identityPhotoStorageKey,
        application_type: applicationType,
        status: "PENDING_VERIFICATION",
        admin_note: null,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      applications.push(row);
      return row;
    },
    async getLatestApplicationForUser(userId) {
      const app = [...applications].reverse().find((a) => a.user_id === userId);
      if (!app) return null;
      const u = users.find((x) => x.id === userId);
      return { application: app, fullName: u?.full_name ?? "", email: u?.email ?? "" };
    },
    async listApplications({ status, page, pageSize }) {
      const filtered = status ? applications.filter((a) => a.status === status) : applications;
      const start = (page - 1) * pageSize;
      const slice = filtered.slice(start, start + pageSize);
      return {
        items: slice.map((a) => {
          const u = users.find((x) => x.id === a.user_id);
          return { application: a, fullName: u?.full_name ?? "", email: u?.email ?? "" };
        }),
        totalItems: filtered.length,
      };
    },
    async getApplicationById(applicationId) {
      const app = applications.find((a) => a.id === applicationId);
      if (!app) return null;
      const u = users.find((x) => x.id === app.user_id);
      return { application: app, fullName: u?.full_name ?? "", email: u?.email ?? "" };
    },
    async approveApplicationAtomic({ applicationId, adminUserId, adminNote }) {
      const app = applications.find((a) => a.id === applicationId);
      if (!app)
        throw new AuthError({
          status: 404,
          code: "NOT_FOUND",
          message: "Pengajuan tidak ditemukan.",
        });
      if (app.status !== "PENDING_VERIFICATION" && app.status !== "PENDING_REVIEW") {
        throw new AuthError({
          status: 409,
          code: "APPLICATION_STATUS_INVALID",
          message: "Status tidak valid.",
        });
      }
      if (
        app.application_type === "REPLACEMENT" ||
        assignments.some(
          (a) =>
            a.class_name.toLowerCase() === app.class_name.toLowerCase() && a.status === "ACTIVE"
        )
      ) {
        throw new AuthError({
          status: 409,
          code: "CLASS_ALREADY_HAS_ACTIVE_KOMTING",
          message: "Kelas sudah memiliki komting aktif.",
        });
      }
      if (assignments.some((a) => a.user_id === app.user_id && a.status === "ACTIVE")) {
        throw new AuthError({
          status: 409,
          code: "STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT",
          message: "Mahasiswa sudah aktif.",
        });
      }

      app.status = "APPROVED";
      app.admin_note = adminNote;
      app.reviewed_by = adminUserId;
      app.reviewed_at = new Date().toISOString();

      const assign: KomtingAssignmentRow = {
        id: crypto.randomUUID(),
        user_id: app.user_id,
        class_name: app.class_name,
        status: "ACTIVE",
        started_at: new Date().toISOString(),
        ended_at: null,
        created_by: adminUserId,
        ended_by: null,
        end_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      assignments.push(assign);

      return {
        application_id: app.id,
        status: "APPROVED",
        assignment: { id: assign.id, status: "ACTIVE", class_name: assign.class_name },
      };
    },
    async rejectApplicationAtomic({ applicationId, adminUserId, reason }) {
      const app = applications.find((a) => a.id === applicationId);
      if (!app)
        throw new AuthError({
          status: 404,
          code: "NOT_FOUND",
          message: "Pengajuan tidak ditemukan.",
        });
      if (
        app.status !== "PENDING_VERIFICATION" &&
        app.status !== "PENDING_REVIEW" &&
        app.status !== "PENDING_REPLACEMENT_NOTICE"
      ) {
        throw new AuthError({
          status: 409,
          code: "APPLICATION_STATUS_INVALID",
          message: "Status tidak valid.",
        });
      }

      app.status = "REJECTED";
      app.rejection_reason = reason;
      app.reviewed_by = adminUserId;
      app.reviewed_at = new Date().toISOString();
      const u = users.find((x) => x.id === app.user_id);

      return {
        application_id: app.id,
        full_name: u?.full_name,
        email: u?.email,
        student_id: app.student_id,
        class_name: app.class_name,
        application_type: app.application_type,
        status: app.status,
        submitted_at: app.submitted_at,
        admin_note: app.admin_note,
        rejection_reason: app.rejection_reason,
      };
    },
    async approveReplacementAtomic({ applicationId, adminUserId, adminNote }) {
      const app = applications.find((a) => a.id === applicationId);
      if (!app)
        throw new AuthError({
          status: 404,
          code: "NOT_FOUND",
          message: "Pengajuan tidak ditemukan.",
        });
      if (
        app.status !== "PENDING_VERIFICATION" &&
        app.status !== "PENDING_REVIEW" &&
        app.status !== "PENDING_REPLACEMENT_NOTICE"
      ) {
        throw new AuthError({
          status: 409,
          code: "APPLICATION_STATUS_INVALID",
          message: "Status tidak valid.",
        });
      }
      if (assignments.some((a) => a.user_id === app.user_id && a.status === "ACTIVE")) {
        throw new AuthError({
          status: 409,
          code: "STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT",
          message: "Mahasiswa sudah aktif.",
        });
      }

      const oldAssign = assignments.find(
        (a) => a.class_name.toLowerCase() === app.class_name.toLowerCase() && a.status === "ACTIVE"
      );
      if (oldAssign) {
        oldAssign.status = "REPLACED";
        oldAssign.ended_at = new Date().toISOString();
        oldAssign.ended_by = adminUserId;
        oldAssign.end_reason = adminNote ?? "Replaced";
      }

      app.status = "APPROVED";
      app.admin_note = adminNote;
      app.reviewed_by = adminUserId;
      app.reviewed_at = new Date().toISOString();

      const newAssign: KomtingAssignmentRow = {
        id: crypto.randomUUID(),
        user_id: app.user_id,
        class_name: app.class_name,
        status: "ACTIVE",
        started_at: new Date().toISOString(),
        ended_at: null,
        created_by: adminUserId,
        ended_by: null,
        end_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      assignments.push(newAssign);

      return {
        application_id: app.id,
        status: "APPROVED",
        assignment: { id: newAssign.id, status: "ACTIVE", class_name: newAssign.class_name },
      };
    },
    async deactivateAssignmentAtomic({ assignmentId, adminUserId, reason }) {
      const assign = assignments.find((a) => a.id === assignmentId);
      if (!assign)
        throw new AuthError({
          status: 404,
          code: "NOT_FOUND",
          message: "Assignment tidak ditemukan.",
        });
      if (assign.status !== "ACTIVE") {
        throw new AuthError({
          status: 409,
          code: "ASSIGNMENT_NOT_ACTIVE",
          message: "Sudah nonaktif.",
        });
      }
      assign.status = "INACTIVE";
      assign.ended_at = new Date().toISOString();
      assign.ended_by = adminUserId;
      assign.end_reason = reason;
      return { success: true };
    },
  };

  return { users, applications, assignments, uploadedKeys, storage, repository };
}

describe("BE-2 Route Handlers: Unauthenticated & Authorization Boundaries", () => {
  it("rejects unauthenticated requests across all BE-2 routes with 401 AUTH_REQUIRED", async () => {
    const req = (url: string, method = "GET") =>
      new Request(url, { method, headers: { Authorization: "Basic invalid" } });

    const responses = await Promise.all([
      meGetRoute(req("http://localhost:3000/api/v1/me")),
      mePatchRoute(req("http://localhost:3000/api/v1/me", "PATCH")),
      komtingAppPostRoute(req("http://localhost:3000/api/v1/komting/applications", "POST")),
      myAppGetRoute(req("http://localhost:3000/api/v1/komting/applications/me")),
      adminAppsGetRoute(req("http://localhost:3000/api/v1/admin/komting/applications")),
      adminAppDetailRoute(
        req(
          "http://localhost:3000/api/v1/admin/komting/applications/11111111-1111-4111-8111-111111111111"
        ),
        {
          params: Promise.resolve({ applicationId: "11111111-1111-4111-8111-111111111111" }),
        }
      ),
      adminApproveRoute(
        req(
          "http://localhost:3000/api/v1/admin/komting/applications/11111111-1111-4111-8111-111111111111/approve",
          "POST"
        ),
        { params: Promise.resolve({ applicationId: "11111111-1111-4111-8111-111111111111" }) }
      ),
      adminRejectRoute(
        req(
          "http://localhost:3000/api/v1/admin/komting/applications/11111111-1111-4111-8111-111111111111/reject",
          "POST"
        ),
        { params: Promise.resolve({ applicationId: "11111111-1111-4111-8111-111111111111" }) }
      ),
      adminApproveReplacementRoute(
        req(
          "http://localhost:3000/api/v1/admin/komting/applications/11111111-1111-4111-8111-111111111111/approve-replacement",
          "POST"
        ),
        { params: Promise.resolve({ applicationId: "11111111-1111-4111-8111-111111111111" }) }
      ),
      adminDeactivateRoute(
        req(
          "http://localhost:3000/api/v1/admin/komting/assignments/11111111-1111-4111-8111-111111111111/deactivate",
          "POST"
        ),
        { params: Promise.resolve({ assignmentId: "11111111-1111-4111-8111-111111111111" }) }
      ),
    ]);

    for (const res of responses) {
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "AUTH_REQUIRED");
    }
  });

  it("enforces role and account_status guards for STAFF, KOMTING (with/without assignment), ADMIN, and INACTIVE", async () => {
    const req = new Request("http://localhost:3000/api/v1/test", {
      headers: { Authorization: "Bearer valid.jwt" },
    });

    const inactive = makeUserRow({ role: "KOMTING", account_status: "INACTIVE" });
    await assert.rejects(
      () => requireAuthenticatedUser(req, undefined, makeBearerDeps(inactive)),
      (err: unknown) =>
        err instanceof AuthError && err.status === 403 && err.code === "ACCOUNT_NOT_ACTIVE"
    );

    const staff = makeUserRow({ role: "STAFF" });
    const staffCtx = await requireAuthenticatedUser(req, undefined, makeBearerDeps(staff));
    assert.equal(staffCtx.user.role, "STAFF");
    await assert.rejects(
      () => requireRole(["KOMTING"], req, makeBearerDeps(staff)),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );
    await assert.rejects(
      () => requireAdmin(req, makeBearerDeps(staff)),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );

    const komtingNoAssign = makeUserRow({ role: "KOMTING" });
    const komtingCtx = await requireRole(["KOMTING"], req, makeBearerDeps(komtingNoAssign));
    assert.equal(komtingCtx.user.role, "KOMTING");
    await assert.rejects(
      () => requireActiveKomting(req, makeBearerDeps(komtingNoAssign)),
      (err: unknown) =>
        err instanceof AuthError && err.status === 403 && err.code === "KOMTING_ASSIGNMENT_REQUIRED"
    );
    await assert.rejects(
      () => requireAdmin(req, makeBearerDeps(komtingNoAssign)),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );

    const admin = makeUserRow({ role: "ADMIN" });
    const adminCtx = await requireAdmin(req, makeBearerDeps(admin));
    assert.equal(adminCtx.user.role, "ADMIN");
    await assert.rejects(
      () => requireRole(["KOMTING"], req, makeBearerDeps(admin)),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );
  });
});

describe("BE-2 User Profile (/api/v1/me)", () => {
  it("returns profile without auth_provider_user_id and updates only allowlisted full_name", async () => {
    const ctx = makeContext({
      user: {
        id: "user-me-1",
        auth_provider_user_id: "secret-provider-uid",
        email: "staff@example.test",
        full_name: "Nama Lama",
        role: "STAFF",
      },
    });

    const profile = getMyProfile(ctx);
    assert.equal(profile.id, "user-me-1");
    assert.equal("auth_provider_user_id" in profile, false);

    let updatedName = "";
    const repo: ProfileRepository = {
      async updateFullName({ fullName }) {
        updatedName = fullName;
        return makeUserRow({
          id: "user-me-1",
          email: "staff@example.test",
          full_name: fullName,
          role: "STAFF",
        });
      },
    };

    // Mass-assignment attempt (role / account_status) must be rejected
    await assert.rejects(
      () =>
        updateMyProfile(
          ctx,
          { full_name: "Nama Baru", role: "ADMIN", account_status: "INACTIVE" },
          "req_1",
          repo
        ),
      (err: unknown) =>
        err instanceof AuthError && err.status === 400 && err.code === "INVALID_REQUEST"
    );
    assert.equal(updatedName, "");

    const updated = await updateMyProfile(ctx, { full_name: "  Nama Baru  " }, "req_2", repo);
    assert.equal(updated.full_name, "Nama Baru");
    assert.equal(updated.role, "STAFF");
  });
});

describe("BE-2 KOMTING Application, Approval, Rejection, Replacement & Deactivation", () => {
  it("validates image magic bytes and rejects invalid/spoofed files", async () => {
    const validJpeg = new File([JPEG_BYTES], "ktm.jpg", { type: "image/jpeg" });
    const parsed = await validateIdentityImageFile(validJpeg);
    assert.equal(parsed.contentType, "image/jpeg");

    const spoofedPng = new File([new TextEncoder().encode("not-an-image")], "fake.png", {
      type: "image/png",
    });
    await assert.rejects(
      () => validateIdentityImageFile(spoofedPng),
      (err: unknown) => err instanceof AuthError && err.status === 422
    );
  });

  it("handles valid NEW submission, admin approval, rejection, replacement, and deactivation", async () => {
    const state = makeMemoryWorkflowState();
    const adminCtx = makeContext({ user: state.users[0] });
    const k1Ctx = makeContext({ user: state.users[2] });
    const k2Ctx = makeContext({ user: state.users[3] });

    const deps = { repository: state.repository, storage: state.storage };

    // Invalid submission (missing fields & email mismatch)
    const badForm = new FormData();
    badForm.set("full_name", "Komting Satu");
    badForm.set("email", "wrong@example.test");
    badForm.set("student_id", "2401001");
    badForm.set("class_name", "IF-01");
    badForm.set("identity_photo", new File([JPEG_BYTES], "ktm.jpg", { type: "image/jpeg" }));

    await assert.rejects(
      () => submitKomtingApplication(k1Ctx, badForm, "req_bad_email", deps),
      (err: unknown) => err instanceof AuthError && err.status === 422
    );
    assert.equal(state.uploadedKeys.size, 0);

    // Valid NEW submission by KOMTING 1
    const k1Form = new FormData();
    k1Form.set("full_name", "Komting Satu");
    k1Form.set("email", "komting1@example.test");
    k1Form.set("student_id", "2401001");
    k1Form.set("class_name", "IF-01");
    k1Form.set("identity_photo", new File([PNG_BYTES], "ktm.png", { type: "image/png" }));

    const submitted1 = await submitKomtingApplication(k1Ctx, k1Form, "req_sub1", deps);
    assert.equal(submitted1.status, "PENDING_VERIFICATION");

    // Duplicate active application blocked (409 APPLICATION_ALREADY_EXISTS)
    await assert.rejects(
      () => submitKomtingApplication(k1Ctx, k1Form, "req_dup", deps),
      (err: unknown) =>
        err instanceof AuthError && err.status === 409 && err.code === "APPLICATION_ALREADY_EXISTS"
    );

    // KOMTING checks own application without leaking storage key
    const myApp = await getMyKomtingApplication(k1Ctx, deps);
    assert.equal(myApp.application_id, submitted1.application_id);
    assert.equal("identity_photo_storage_key" in myApp, false);

    // ADMIN lists & views detail with short-lived signed URL
    const listed = await listAdminKomtingApplications(
      "http://localhost:3000/api/v1/admin/komting/applications?status=PENDING_VERIFICATION",
      deps
    );
    assert.equal(listed.items.length, 1);
    const detail = await getAdminKomtingApplicationDetail(submitted1.application_id, deps);
    assert.equal(detail.has_identity_photo, true);
    assert.match(detail.identity_photo_signed_url ?? "", /^https:\/\/signed\.example\.test\//);

    // ADMIN approves NEW application -> assignment ACTIVE
    const approved = await approveKomtingApplication(
      adminCtx,
      submitted1.application_id,
      { admin_note: "Dokumen valid" },
      "req_app1",
      deps
    );
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.assignment.status, "ACTIVE");
    assert.equal(approved.assignment.class_name, "IF-01");

    // KOMTING 2 submits for same class IF-01 -> auto-classified as REPLACEMENT
    const k2Form = new FormData();
    k2Form.set("full_name", "Komting Dua");
    k2Form.set("email", "komting2@example.test");
    k2Form.set("student_id", "2401002");
    k2Form.set("class_name", "IF-01");
    k2Form.set("identity_photo", new File([JPEG_BYTES], "ktm2.jpg", { type: "image/jpeg" }));

    const sub2 = await submitKomtingApplication(k2Ctx, k2Form, "req_sub2", deps);
    const sub2Detail = await getAdminKomtingApplicationDetail(sub2.application_id, deps);
    assert.equal(sub2Detail.application_type, "REPLACEMENT");

    // Rejection requires reason and keeps existing komting 1 ACTIVE
    await assert.rejects(
      () =>
        rejectKomtingApplication(
          adminCtx,
          sub2.application_id,
          { reason: "  " },
          "req_rej_bad",
          deps
        ),
      (err: unknown) => err instanceof AuthError && err.status === 422
    );

    const rejected = await rejectKomtingApplication(
      adminCtx,
      sub2.application_id,
      { reason: "Foto buram" },
      "req_rej",
      deps
    );
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.rejection_reason, "Foto buram");
    assert.equal(state.assignments[0]?.status, "ACTIVE");

    // KOMTING 2 re-applies after rejection -> NEW replacement application succeeds
    const sub3 = await submitKomtingApplication(k2Ctx, k2Form, "req_sub3", deps);

    // Standard /approve must reject REPLACEMENT when class has active komting (409)
    await assert.rejects(
      () => approveKomtingApplication(adminCtx, sub3.application_id, {}, "req_wrong_approve", deps),
      (err: unknown) =>
        err instanceof AuthError &&
        err.status === 409 &&
        err.code === "CLASS_ALREADY_HAS_ACTIVE_KOMTING"
    );

    // /approve-replacement atomically marks old REPLACED and creates new ACTIVE assignment
    const replaced = await approveKomtingReplacement(
      adminCtx,
      sub3.application_id,
      { admin_note: "Pergantian semester" },
      "req_replace",
      deps
    );
    assert.equal(replaced.status, "APPROVED");
    assert.equal(state.assignments[0]?.status, "REPLACED");
    assert.equal(state.assignments[1]?.status, "ACTIVE");
    assert.equal(state.assignments[1]?.user_id, state.users[3]?.id);

    // Deactivation requires reason and transitions ACTIVE -> INACTIVE
    await assert.rejects(
      () =>
        deactivateKomtingAssignment(
          adminCtx,
          replaced.assignment.id,
          { reason: "" },
          "req_deact_bad",
          deps
        ),
      (err: unknown) => err instanceof AuthError && err.status === 422
    );

    const deactRes = await deactivateKomtingAssignment(
      adminCtx,
      replaced.assignment.id,
      { reason: "Lulus" },
      "req_deact",
      deps
    );
    assert.equal(deactRes.success, true);
    assert.equal(state.assignments[1]?.status, "INACTIVE");

    // Deactivating again fails with 409 ASSIGNMENT_NOT_ACTIVE
    await assert.rejects(
      () =>
        deactivateKomtingAssignment(
          adminCtx,
          replaced.assignment.id,
          { reason: "Ulang" },
          "req_deact_again",
          deps
        ),
      (err: unknown) =>
        err instanceof AuthError && err.status === 409 && err.code === "ASSIGNMENT_NOT_ACTIVE"
    );

    // Former komting can re-apply after deactivation
    const sub4 = await submitKomtingApplication(k2Ctx, k2Form, "req_sub4", deps);
    assert.equal(sub4.status, "PENDING_VERIFICATION");
  });

  it("cleans up uploaded storage object if DB application insert fails", async () => {
    const state = makeMemoryWorkflowState();
    const k1Ctx = makeContext({ user: state.users[2] });
    const failingRepo: KomtingWorkflowRepository = {
      ...state.repository,
      async createApplication() {
        throw new AuthError({ status: 500, code: "INTERNAL_ERROR", message: "db error" });
      },
    };

    const form = new FormData();
    form.set("full_name", "Komting Satu");
    form.set("email", "komting1@example.test");
    form.set("student_id", "2401001");
    form.set("class_name", "IF-01");
    form.set("identity_photo", new File([JPEG_BYTES], "ktm.jpg", { type: "image/jpeg" }));

    await assert.rejects(
      () =>
        submitKomtingApplication(k1Ctx, form, "req_rollback", {
          repository: failingRepo,
          storage: state.storage,
        }),
      (err: unknown) => err instanceof AuthError && err.status === 500
    );

    assert.equal(state.uploadedKeys.size, 0, "Uploaded file must be rolled back on DB failure");
  });
});
