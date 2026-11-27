import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder-test.supabase.co";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-role-key";
}

import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { calculateDamageFine, calculateLateReturnFine } from "@/lib/loans/fine-service";
import {
  confirmStaffReturn,
  getKomtingLoanDetail,
  getStaffLoanReturnSummary,
  initiateKomtingReturn,
  type ReturnRepository,
  type ReturnSummaryView,
} from "@/lib/loans/return-service";
import {
  getStaffInspectionDetail,
  type InspectionRepository,
} from "@/lib/loans/inspection-service";
import { validateEvidenceImageFile } from "@/lib/storage/evidence-storage";
import type { Database } from "@/lib/supabase/database.types";

type LoanRow = Database["public"]["Tables"]["loans"]["Row"];

function createMockContext(
  role: "KOMTING" | "STAFF" | "ADMIN",
  userId?: string
): AuthenticatedUserContext {
  const id = userId ?? crypto.randomUUID();
  const email = `${role.toLowerCase()}-${id.slice(0, 8)}@pinjam.test`;
  const nowIso = new Date().toISOString();
  const komtingAssignment =
    role === "KOMTING"
      ? {
          id: `asg-${id}`,
          user_id: id,
          class_name: "TI-3A",
          status: "ACTIVE",
          started_at: nowIso,
          ended_at: null,
        }
      : null;

  return {
    authUserId: `auth-${id}`,
    user: {
      id,
      email,
      full_name: `${role} Test User`,
      role,
      account_status: "ACTIVE",
      komting_assignment: komtingAssignment,
    },
    rawUser: {
      id,
      auth_provider_user_id: `auth-${id}`,
      email,
      full_name: `${role} Test User`,
      role,
      account_status: "ACTIVE",
      created_at: nowIso,
      updated_at: nowIso,
    },
    komtingAssignment,
  };
}

describe("BE-5: Fine Calculation Service", () => {
  it("computes on-time return with 0 overdue minutes and 0 fine", () => {
    const est = "2026-11-27T10:00:00.000Z";
    const ret = "2026-11-27T09:55:00.000Z";

    const res = calculateLateReturnFine(est, ret);
    assert.equal(res.isOverdue, false);
    assert.equal(res.overdueMinutes, 0);
    assert.equal(res.overdueHours, 0);
    assert.equal(res.fineAmount, 0);
    assert.equal(res.policy, "PRD_INITIAL_RELEASE_NO_AUTO_FINES");
  });

  it("calculates overdue duration correctly with ceiling hours", () => {
    const est = "2026-11-27T10:00:00.000Z";
    // 75 minutes late
    const ret = "2026-11-27T11:15:00.000Z";

    const res = calculateLateReturnFine(est, ret);
    assert.equal(res.isOverdue, true);
    assert.equal(res.overdueMinutes, 75);
    assert.equal(res.overdueHours, 2);
    // Baseline fine rate is 0 per PRD §7.11 & §7.12
    assert.equal(res.fineAmount, 0);
  });

  it("calculates monetary penalty using integer math when hourly rate is provided", () => {
    const est = "2026-11-27T10:00:00.000Z";
    // 65 minutes late -> ceil(65 / 60) = 2 hours
    const ret = "2026-11-27T11:05:00.000Z";

    const res = calculateLateReturnFine(est, ret, { hourlyRate: 25000 });
    assert.equal(res.isOverdue, true);
    assert.equal(res.overdueMinutes, 65);
    assert.equal(res.overdueHours, 2);
    assert.equal(res.fineAmount, 50000);
    assert.equal(res.policy, "CONFIGURED_RATE");
  });

  it("respects grace period minutes when calculating overdue", () => {
    const est = "2026-11-27T10:00:00.000Z";
    // 10 minutes late, but 15 minutes grace period
    const ret = "2026-11-27T10:10:00.000Z";

    const res = calculateLateReturnFine(est, ret, { gracePeriodMinutes: 15, hourlyRate: 25000 });
    assert.equal(res.isOverdue, false);
    assert.equal(res.overdueMinutes, 0);
    assert.equal(res.fineAmount, 0);
  });

  it("throws AuthError 400 when invalid timestamps are provided", () => {
    assert.throws(
      () => calculateLateReturnFine("invalid-date", "2026-11-27T10:00:00.000Z"),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  it("categorizes damage and loss conditions correctly", () => {
    const normal = calculateDamageFine("NORMAL", "COMPLETE");
    assert.equal(normal.fineType, "NONE");
    assert.equal(normal.isDamageOrLoss, false);

    const damaged = calculateDamageFine("DAMAGED", "COMPLETE", 150000);
    assert.equal(damaged.fineType, "DAMAGE");
    assert.equal(damaged.isDamageOrLoss, true);
    assert.equal(damaged.assessedFine, 150000);

    const incomplete = calculateDamageFine("NORMAL", "INCOMPLETE", 75000);
    assert.equal(incomplete.fineType, "LOSS");
    assert.equal(incomplete.isDamageOrLoss, true);
    assert.equal(incomplete.assessedFine, 75000);

    const both = calculateDamageFine("DAMAGED", "INCOMPLETE", 225000);
    assert.equal(both.fineType, "DAMAGE");
    assert.equal(both.isDamageOrLoss, true);
    assert.equal(both.assessedFine, 225000);
  });
});

describe("BE-5: Evidence Storage File Validation", () => {
  it("rejects empty file", async () => {
    const emptyFile = new File([new Uint8Array(0)], "empty.jpg", { type: "image/jpeg" });
    await assert.rejects(
      async () => validateEvidenceImageFile(emptyFile),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects file larger than 5 MB", async () => {
    const largeBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const largeFile = new File([largeBytes], "large.jpg", { type: "image/jpeg" });
    await assert.rejects(
      async () => validateEvidenceImageFile(largeFile),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects non-image content type", async () => {
    const textBytes = new TextEncoder().encode("Hello text file");
    const textFile = new File([textBytes], "doc.txt", { type: "text/plain" });
    await assert.rejects(
      async () => validateEvidenceImageFile(textFile),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        return true;
      }
    );
  });

  it("accepts valid JPEG binary bytes", async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const validFile = new File([jpegBytes], "evidence.jpg", { type: "image/jpeg" });
    const validated = await validateEvidenceImageFile(validFile);
    assert.equal(validated.contentType, "image/jpeg");
    assert.equal(validated.extension, "jpg");
  });

  it("accepts valid PNG binary bytes", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const validFile = new File([pngBytes], "evidence.png", { type: "image/png" });
    const validated = await validateEvidenceImageFile(validFile);
    assert.equal(validated.contentType, "image/png");
    assert.equal(validated.extension, "png");
  });
});

describe("BE-5: Return Workflow & Authorization Validation", () => {
  it("rejects unauthenticated or non-staff actor from confirming return", async () => {
    const komtingCtx = createMockContext("KOMTING");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () => confirmStaffReturn(komtingCtx, loanId, {}, null, "req_1"),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 403);
        assert.equal(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("rejects non-UUID loan parameter", async () => {
    const staffCtx = createMockContext("STAFF");

    await assert.rejects(
      async () => confirmStaffReturn(staffCtx, "invalid-loan-id", {}, null, "req_2"),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 400);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects invalid returned_by enum", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(staffCtx, loanId, { returned_by: "UNKNOWN_ACTOR" }, null, "req_3"),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  it("rejects REPRESENTATIVE return without representative_name", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          { returned_by: "REPRESENTATIVE", representative_name: "" },
          null,
          "req_4"
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects DAMAGED condition without evidence photo", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          {
            returned_by: "KOMTING",
            projector_condition: "DAMAGED",
            accessories_condition: "COMPLETE",
          },
          null,
          "req_5"
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects INCOMPLETE accessories condition without evidence photo", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          {
            returned_by: "KOMTING",
            projector_condition: "NORMAL",
            accessories_condition: "INCOMPLETE",
          },
          null,
          "req_6"
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects DAMAGED condition with unit_disposition AVAILABLE", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          {
            returned_by: "KOMTING",
            projector_condition: "DAMAGED",
            accessories_condition: "COMPLETE",
            unit_disposition: "AVAILABLE",
            evidence_photo_storage_key: "evidence/key.jpg",
          },
          null,
          "req_disp_1"
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects invalid unit_disposition enum", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          {
            returned_by: "KOMTING",
            projector_condition: "NORMAL",
            accessories_condition: "COMPLETE",
            unit_disposition: "SCRAPPED" as never,
          },
          null,
          "req_disp_2"
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 400);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects negative fine amount", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          {
            returned_by: "KOMTING",
            projector_condition: "NORMAL",
            accessories_condition: "COMPLETE",
            fine_amount: -50000,
          },
          null,
          "req_fine_neg"
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 400);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects positive fine amount when condition is NORMAL and COMPLETE", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          {
            returned_by: "KOMTING",
            projector_condition: "NORMAL",
            accessories_condition: "COMPLETE",
            fine_amount: 50000,
            fine_notes: "Denda sepihak",
          },
          null,
          "req_fine_manual"
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  it("rejects positive fine amount without fine notes", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          {
            returned_by: "KOMTING",
            projector_condition: "DAMAGED",
            accessories_condition: "COMPLETE",
            evidence_photo_storage_key: "evidence/key.jpg",
            fine_amount: 50000,
            fine_notes: "",
          },
          null,
          "req_fine_notes"
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 422);
        assert.equal(err.code, "INVALID_REQUEST");
        return true;
      }
    );
  });
});

describe("BE-5: Mocked Return Execution & Idempotency", () => {
  it("confirms normal return atomically and returns structured response", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    const mockRepo: ReturnRepository = {
      async confirmReturnAtomic(params) {
        return {
          loan: {
            id: params.loanId,
            status: "RETURNED",
            returned_at: new Date().toISOString(),
          },
          inspection: {
            id: crypto.randomUUID(),
            projector_condition: params.projectorCondition ?? "NORMAL",
            accessories_condition: params.accessoriesCondition ?? "COMPLETE",
            unit_disposition: params.unitDisposition ?? "AVAILABLE",
            evidence_photo_storage_key: params.evidencePhotoStorageKey ?? null,
            inspected_at: new Date().toISOString(),
          },
          projector: {
            id: crypto.randomUUID(),
            physical_status: "AVAILABLE",
          },
          fine: {
            id: crypto.randomUUID(),
            fine_type: "NONE",
            amount: 0,
            overdue_minutes: 0,
            status: "EXEMPT",
          },
        };
      },
      async findLoanById() {
        return null;
      },
      async getLoanReturnSummary() {
        return null;
      },
      async getKomtingLoanDetail() {
        return null;
      },
      async findQrTokenForLoan() {
        return null;
      },
    };

    const res = await confirmStaffReturn(
      staffCtx,
      loanId,
      {
        returned_by: "KOMTING",
        projector_condition: "NORMAL",
        accessories_condition: "COMPLETE",
      },
      null,
      "req_7",
      { repository: mockRepo }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.loan.status, "RETURNED");
    assert.equal(res.body.data.projector.physical_status, "AVAILABLE");
    assert.equal(res.body.data.fine.fine_type, "NONE");
    assert.equal(res.body.data.fine.status, "EXEMPT");
  });

  it("handles damaged return with evidence photo and MAINTENANCE disposition", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();
    const photoKey = `evidence/${loanId}/sample.jpg`;

    const mockRepo: ReturnRepository = {
      async confirmReturnAtomic(params) {
        return {
          loan: {
            id: params.loanId,
            status: "RETURNED",
            returned_at: new Date().toISOString(),
          },
          inspection: {
            id: crypto.randomUUID(),
            projector_condition: params.projectorCondition ?? "DAMAGED",
            accessories_condition: params.accessoriesCondition ?? "COMPLETE",
            unit_disposition: params.unitDisposition ?? "MAINTENANCE",
            evidence_photo_storage_key: params.evidencePhotoStorageKey ?? null,
            evidence_photo_url: "https://signed.url/evidence.jpg",
            inspected_at: new Date().toISOString(),
          },
          projector: {
            id: crypto.randomUUID(),
            physical_status: "MAINTENANCE",
          },
          fine: {
            id: crypto.randomUUID(),
            fine_type: "DAMAGE",
            amount: 50000,
            overdue_minutes: 0,
            status: "PENDING",
          },
        };
      },
      async findLoanById() {
        return null;
      },
      async getLoanReturnSummary() {
        return null;
      },
      async getKomtingLoanDetail() {
        return null;
      },
      async findQrTokenForLoan() {
        return null;
      },
    };

    const res = await confirmStaffReturn(
      staffCtx,
      loanId,
      {
        returned_by: "KOMTING",
        projector_condition: "DAMAGED",
        accessories_condition: "COMPLETE",
        unit_disposition: "MAINTENANCE",
        evidence_photo_storage_key: photoKey,
        fine_amount: 50000,
        fine_notes: "Ganti biaya servis lensa",
      },
      null,
      "req_8",
      { repository: mockRepo }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.loan.status, "RETURNED");
    assert.equal(res.body.data.projector.physical_status, "MAINTENANCE");
    assert.equal(res.body.data.fine.fine_type, "DAMAGE");
    assert.equal(res.body.data.fine.amount, 50000);
    assert.equal(res.body.data.fine.status, "PENDING");
  });

  it("replays cached response for identical idempotency key and rejects conflicting payload", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();

    let execCount = 0;
    const memoryStore = new Map<string, unknown>();

    const mockIdempotencyStore = {
      async getRecord(params: {
        actorUserId: string | null;
        route: string;
        idempotencyKey: string;
      }) {
        return (
          (memoryStore.get(`${params.actorUserId}:${params.route}:${params.idempotencyKey}`) as {
            requestHash: string;
            responseStatus: number;
            responseBody: unknown;
          }) ?? null
        );
      },
      async saveRecord(params: {
        actorUserId: string | null;
        route: string;
        idempotencyKey: string;
        requestHash: string;
        responseStatus: number;
        responseBody: unknown;
      }) {
        memoryStore.set(`${params.actorUserId}:${params.route}:${params.idempotencyKey}`, params);
      },
    };

    const mockRepo: ReturnRepository = {
      async confirmReturnAtomic(params) {
        execCount++;
        return {
          loan: { id: params.loanId, status: "RETURNED", returned_at: new Date().toISOString() },
          inspection: {
            id: crypto.randomUUID(),
            projector_condition: "NORMAL",
            accessories_condition: "COMPLETE",
            unit_disposition: "AVAILABLE",
            evidence_photo_storage_key: null,
            inspected_at: new Date().toISOString(),
          },
          projector: { id: crypto.randomUUID(), physical_status: "AVAILABLE" },
          fine: {
            id: crypto.randomUUID(),
            fine_type: "NONE",
            amount: 0,
            overdue_minutes: 0,
            status: "EXEMPT",
          },
        };
      },
      async findLoanById() {
        return null;
      },
      async getLoanReturnSummary() {
        return null;
      },
      async getKomtingLoanDetail() {
        return null;
      },
      async findQrTokenForLoan() {
        return null;
      },
    };

    // First request
    const firstRes = await confirmStaffReturn(
      staffCtx,
      loanId,
      { returned_by: "KOMTING", projector_condition: "NORMAL", accessories_condition: "COMPLETE" },
      idempotencyKey,
      "req_idem_1",
      { repository: mockRepo, idempotencyStore: mockIdempotencyStore }
    );
    assert.equal(firstRes.status, 200);
    assert.equal(execCount, 1);

    // Replay with identical payload: returns cached result without re-executing
    const secondRes = await confirmStaffReturn(
      staffCtx,
      loanId,
      { returned_by: "KOMTING", projector_condition: "NORMAL", accessories_condition: "COMPLETE" },
      idempotencyKey,
      "req_idem_2",
      { repository: mockRepo, idempotencyStore: mockIdempotencyStore }
    );
    assert.equal(secondRes.status, 200);
    assert.equal(execCount, 1); // execCount did not increment!

    // Replay with different payload: throws 409 conflict
    await assert.rejects(
      async () =>
        confirmStaffReturn(
          staffCtx,
          loanId,
          { returned_by: "REPRESENTATIVE", representative_name: "Budi" },
          idempotencyKey,
          "req_idem_3",
          { repository: mockRepo, idempotencyStore: mockIdempotencyStore }
        ),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 409);
        assert.equal(err.code, "IDEMPOTENCY_KEY_REUSED");
        return true;
      }
    );
  });
});

describe("BE-5: Komting Loan Details & Return Initiation", () => {
  it("allows komting to fetch their own loan detail and blocks access to other komting loan", async () => {
    const komtingA = createMockContext("KOMTING");
    const komtingB = createMockContext("KOMTING");
    const loanId = crypto.randomUUID();

    const mockRepo: ReturnRepository = {
      async confirmReturnAtomic() {
        throw new Error("not implemented");
      },
      async findLoanById(id) {
        return {
          id,
          booking_id: crypto.randomUUID(),
          projector_id: crypto.randomUUID(),
          komting_id: komtingA.user.id, // belongs to komtingA
          status: "ACTIVE",
          picked_up_at: new Date().toISOString(),
          pickup_processed_by: crypto.randomUUID(),
          pickup_received_by: "KOMTING",
          representative_name: null,
          returned_at: null,
          return_processed_by: null,
          return_received_by: null,
          return_representative_name: null,
          lifecycle_seq: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as LoanRow;
      },
      async getLoanReturnSummary() {
        return null;
      },
      async getKomtingLoanDetail(id, userId) {
        if (userId !== komtingA.user.id) return null;
        return {
          loan: {
            id,
            booking_id: crypto.randomUUID(),
            projector_id: crypto.randomUUID(),
            komting_id: komtingA.user.id,
            status: "ACTIVE",
            picked_up_at: new Date().toISOString(),
            returned_at: null,
            return_condition: null,
          },
          projector: {
            id: crypto.randomUUID(),
            asset_code: "PRJ-001",
            name: "Epson EB-X400",
            brand: "Epson",
            model: "EB-X400",
          },
          booking: {
            id: crypto.randomUUID(),
            booking_code: "BKG-123456",
            booking_date: "2026-11-27",
            start_time: "08:00",
            estimated_return_at: "2026-11-27T10:00:00.000Z",
          },
        };
      },
      async findQrTokenForLoan() {
        return null;
      },
    };

    // Komting A succeeds
    const detailA = await getKomtingLoanDetail(komtingA, loanId, { repository: mockRepo });
    assert.equal(detailA.loan.id, loanId);
    assert.equal(detailA.projector.asset_code, "PRJ-001");

    // Komting B gets 403 Forbidden
    await assert.rejects(
      async () => getKomtingLoanDetail(komtingB, loanId, { repository: mockRepo }),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 403);
        assert.equal(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("allows komting to initiate return for ACTIVE loan and rejects for RETURNED loan", async () => {
    const komtingCtx = createMockContext("KOMTING");
    const activeLoanId = crypto.randomUUID();
    const returnedLoanId = crypto.randomUUID();

    const mockRepo: ReturnRepository = {
      async confirmReturnAtomic() {
        throw new Error("not implemented");
      },
      async findLoanById(id) {
        if (id === activeLoanId) {
          return {
            id,
            booking_id: crypto.randomUUID(),
            projector_id: crypto.randomUUID(),
            komting_id: komtingCtx.user.id,
            status: "ACTIVE",
          } as unknown as LoanRow;
        }
        if (id === returnedLoanId) {
          return {
            id,
            booking_id: crypto.randomUUID(),
            projector_id: crypto.randomUUID(),
            komting_id: komtingCtx.user.id,
            status: "RETURNED",
          } as unknown as LoanRow;
        }
        return null;
      },
      async getLoanReturnSummary() {
        return null;
      },
      async getKomtingLoanDetail() {
        return null;
      },
      async findQrTokenForLoan() {
        return {
          tokenHash: "mock-hash",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          bookingCode: "BKG-998877",
          projectorName: "Epson Projector",
          bookingId: crypto.randomUUID(),
        };
      },
    };

    // ACTIVE loan returns return instructions and QR token payload
    const initRes = await initiateKomtingReturn(komtingCtx, activeLoanId, { repository: mockRepo });
    assert.equal(initRes.loan_id, activeLoanId);
    assert.equal(initRes.booking_code, "BKG-998877");
    assert.ok(initRes.qr_payload.includes("BKG-998877"));

    // RETURNED loan throws 409
    await assert.rejects(
      async () => initiateKomtingReturn(komtingCtx, returnedLoanId, { repository: mockRepo }),
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.status, 409);
        assert.equal(err.code, "LOAN_NOT_ACTIVE");
        return true;
      }
    );
  });
});

describe("BE-5: Staff Return Summary & Inspection Service", () => {
  it("allows staff to retrieve return summary with overdue preview", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    const mockRepo: ReturnRepository = {
      async confirmReturnAtomic() {
        throw new Error("not implemented");
      },
      async findLoanById() {
        return null;
      },
      async getLoanReturnSummary(id): Promise<ReturnSummaryView> {
        return {
          loan: {
            id,
            status: "ACTIVE",
            picked_up_at: "2026-11-27T08:00:00.000Z",
            returned_at: null,
          },
          booking: {
            id: crypto.randomUUID(),
            booking_code: "BKG-554433",
            booking_date: "2026-11-27",
            start_time: "08:00",
            estimated_return_at: "2026-11-27T10:00:00.000Z",
            status: "FULFILLED",
          },
          projector: {
            id: crypto.randomUUID(),
            asset_code: "PRJ-002",
            name: "BenQ MX550",
            brand: "BenQ",
            model: "MX550",
            physical_status: "BORROWED",
          },
          komting: {
            id: crypto.randomUUID(),
            full_name: "Keegan Mahasiswa",
            email: "keegan@pinjam.test",
            class_name: "TI-2A",
          },
          overdue_preview: {
            is_overdue: false,
            overdue_minutes: 0,
            overdue_hours: 0,
            estimated_return_at: "2026-11-27T10:00:00.000Z",
            calculated_at: "2026-11-27T09:30:00.000Z",
          },
          qr_status: {
            valid: true,
            pickup_used: true,
            return_used: false,
            is_expired: false,
            is_revoked: false,
          },
        };
      },
      async getKomtingLoanDetail() {
        return null;
      },
      async findQrTokenForLoan() {
        return null;
      },
    };

    const summary = await getStaffLoanReturnSummary(staffCtx, loanId, { repository: mockRepo });
    assert.equal(summary.loan.id, loanId);
    assert.equal(summary.booking.booking_code, "BKG-554433");
    assert.equal(summary.projector.asset_code, "PRJ-002");
    assert.equal(summary.qr_status.valid, true);
  });

  it("fetches return inspection details with signed photo URL if photo exists", async () => {
    const staffCtx = createMockContext("STAFF");
    const loanId = crypto.randomUUID();

    const mockInspectionRepo: InspectionRepository = {
      async findInspectionByLoanId(id) {
        return {
          id: crypto.randomUUID(),
          loan_id: id,
          projector_condition: "DAMAGED",
          accessories_condition: "COMPLETE",
          unit_disposition: "MAINTENANCE",
          note: "Lens scratch detected",
          evidence_photo_storage_key: `evidence/${id}/lens.jpg`,
          inspected_by: staffCtx.user.id,
          inspected_at: new Date().toISOString(),
          lifecycle_seq: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      },
    };

    const mockStorage = {
      async uploadEvidencePhoto() {
        return { storageKey: "key" };
      },
      async createSignedEvidenceUrl(key: string) {
        return `https://signed.supabase.co/${key}`;
      },
      async deleteEvidencePhoto() {},
    };

    const inspection = await getStaffInspectionDetail(staffCtx, loanId, {
      repository: mockInspectionRepo,
      storage: mockStorage as never,
    });

    assert.ok(inspection);
    assert.equal(inspection.loan_id, loanId);
    assert.equal(inspection.projector_condition, "DAMAGED");
    assert.ok(inspection.evidence_photo_url?.includes("signed.supabase.co"));
  });
});
