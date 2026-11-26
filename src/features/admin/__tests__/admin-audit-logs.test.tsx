import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuditLogDetailView } from "@/features/admin/admin-audit-log-detail-view";
import { AdminAuditLogsListView } from "@/features/admin/admin-audit-logs-list-view";
import { ApiClientError } from "@/lib/api/errors";
import type { AuditLogEntry } from "@/types/domain";

const listAuditLogsMock = vi.fn();
const getAuditLogMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    auditLog: {
      listAuditLogs: (...args: unknown[]) => listAuditLogsMock(...args),
      getAuditLog: (...args: unknown[]) => getAuditLogMock(...args),
    },
  },
}));

const SAMPLE_ENTRIES: AuditLogEntry[] = [
  {
    id: "audit_01",
    actor_user_id: "usr_admin_01",
    actor_role: "ADMIN",
    action: "OPERATING_HOURS_UPDATED",
    entity_type: "OPERATING_HOURS",
    entity_id: "oh_2026_11_26",
    before_data: { opens_at: "08:00:00", closes_at: "17:00:00" },
    after_data: { opens_at: "08:00:00", closes_at: "18:00:00" },
    reason: "Perpanjangan kelas sore",
    request_id: "req_audit_01",
    created_at: "2026-11-26T02:15:00Z",
  },
  {
    id: "audit_02",
    actor_user_id: "usr_staff_01",
    actor_role: "STAFF",
    action: "LOAN_RETURNED",
    entity_type: "LOAN",
    entity_id: "loan_09",
    before_data: { status: "ACTIVE" },
    after_data: { status: "RETURNED" },
    reason: null,
    request_id: "req_audit_02",
    created_at: "2026-11-26T01:30:00Z",
  },
];

describe("AdminAuditLogsListView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading, error retry, audit list rows, and enforces read-only UI", async () => {
    const user = userEvent.setup();

    listAuditLogsMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce({
        data: SAMPLE_ENTRIES,
        meta: {
          request_id: "req_list_1",
          pagination: {
            page: 1,
            page_size: 20,
            total_items: 2,
            total_pages: 1,
          },
        },
      });

    render(<AdminAuditLogsListView />);

    expect(screen.getAllByText("Memuat Audit Log...").length).toBeGreaterThan(0);
    expect(await screen.findByText("Gagal Memuat Audit Log")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Coba Lagi" }));

    expect(await screen.findByText("OPERATING_HOURS_UPDATED")).toBeInTheDocument();
    expect(screen.getByText("LOAN_RETURNED")).toBeInTheDocument();
    expect(screen.getByText("usr_admin_01")).toBeInTheDocument();
    expect(screen.getByText(/Perpanjangan kelas sore/)).toBeInTheDocument();
    expect(screen.getByText("READ-ONLY")).toBeInTheDocument();

    // Ensure no edit, delete, or correction controls exist
    expect(screen.queryByRole("button", { name: /edit|ubah|hapus|delete|koreksi/i })).toBeNull();

    const detailLinks = screen.getAllByRole("link", { name: "Lihat Detail" });
    expect(detailLinks[0]).toHaveAttribute("href", "/admin/audit-logs/audit_01");
  });

  it("renders empty state when server returns no audit log entries", async () => {
    listAuditLogsMock.mockResolvedValueOnce({
      data: [],
      meta: {
        request_id: "req_empty_1",
        pagination: {
          page: 1,
          page_size: 20,
          total_items: 0,
          total_pages: 1,
        },
      },
    });

    render(<AdminAuditLogsListView />);

    expect(await screen.findByText("Belum Ada Catatan Audit")).toBeInTheDocument();
  });

  it("supports entity_type/entity_id contract filtering and pagination", async () => {
    const user = userEvent.setup();

    listAuditLogsMock
      .mockResolvedValueOnce({
        data: SAMPLE_ENTRIES,
        meta: {
          request_id: "req_p1",
          pagination: {
            page: 1,
            page_size: 20,
            total_items: 25,
            total_pages: 2,
          },
        },
      })
      .mockResolvedValueOnce({
        data: [SAMPLE_ENTRIES[1]],
        meta: {
          request_id: "req_p2",
          pagination: {
            page: 2,
            page_size: 20,
            total_items: 25,
            total_pages: 2,
          },
        },
      })
      .mockResolvedValue({
        data: [SAMPLE_ENTRIES[1]],
        meta: {
          request_id: "req_filtered",
          pagination: {
            page: 1,
            page_size: 20,
            total_items: 1,
            total_pages: 1,
          },
        },
      });

    render(<AdminAuditLogsListView />);

    await screen.findByText("OPERATING_HOURS_UPDATED");
    expect(listAuditLogsMock).toHaveBeenCalledWith({
      page: 1,
      page_size: 20,
      entity_type: undefined,
      entity_id: undefined,
    });

    await user.click(screen.getByRole("button", { name: "Berikutnya" }));
    await waitFor(() => {
      expect(listAuditLogsMock).toHaveBeenLastCalledWith({
        page: 2,
        page_size: 20,
        entity_type: undefined,
        entity_id: undefined,
      });
    });

    await user.selectOptions(screen.getByLabelText("Tipe Entitas (Server)"), "LOAN");
    await user.type(screen.getByLabelText("ID Entitas (Server)"), "loan_09");
    await user.click(screen.getByRole("button", { name: "Terapkan Filter" }));

    await waitFor(() => {
      expect(listAuditLogsMock).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 20,
        entity_type: "LOAN",
        entity_id: "loan_09",
      });
    });
  });
});

describe("AdminAuditLogDetailView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders audit metadata with before_data and after_data snapshots read-only", async () => {
    getAuditLogMock.mockResolvedValueOnce({
      data: SAMPLE_ENTRIES[0],
      meta: { request_id: "req_detail_1" },
    });

    render(<AdminAuditLogDetailView auditLogId="audit_01" />);

    expect(await screen.findByText("OPERATING_HOURS_UPDATED")).toBeInTheDocument();
    expect(screen.getByText("usr_admin_01")).toBeInTheDocument();
    expect(screen.getByText("OPERATING_HOURS / oh_2026_11_26")).toBeInTheDocument();
    expect(screen.getByText("Perpanjangan kelas sore")).toBeInTheDocument();
    expect(screen.getByText("Before Data")).toBeInTheDocument();
    expect(screen.getByText("After Data")).toBeInTheDocument();
    expect(screen.getByText(/"closes_at": "17:00:00"/)).toBeInTheDocument();
    expect(screen.getByText(/"closes_at": "18:00:00"/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|ubah|hapus|delete|koreksi/i })).toBeNull();
  });

  it("supports error state and retry on detail view", async () => {
    const user = userEvent.setup();
    getAuditLogMock
      .mockRejectedValueOnce(new ApiClientError({ status: 404, code: "PROJECTOR_NOT_FOUND" }))
      .mockResolvedValueOnce({
        data: { ...SAMPLE_ENTRIES[1], before_data: null, after_data: null },
        meta: { request_id: "req_detail_2" },
      });

    render(<AdminAuditLogDetailView auditLogId="audit_02" />);

    expect(await screen.findByText("Gagal Memuat Detail Audit Log")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Coba Lagi" }));

    expect(await screen.findByText("LOAN_RETURNED")).toBeInTheDocument();
    expect(screen.getAllByText("Tidak ada snapshot data (null).")).toHaveLength(2);
  });
});
