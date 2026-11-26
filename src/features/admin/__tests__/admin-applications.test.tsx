import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { AdminApplicationDetailView } from "@/features/admin/admin-application-detail-view";
import { AdminApplicationsListView } from "@/features/admin/admin-applications-list-view";

const listAdminApplicationsMock = vi.fn();
const getAdminApplicationMock = vi.fn();
const approveApplicationMock = vi.fn();
const rejectApplicationMock = vi.fn();
const approveReplacementMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    application: {
      listAdminApplications: (...args: unknown[]) => listAdminApplicationsMock(...args),
      getAdminApplication: (...args: unknown[]) => getAdminApplicationMock(...args),
      approveApplication: (...args: unknown[]) => approveApplicationMock(...args),
      rejectApplication: (...args: unknown[]) => rejectApplicationMock(...args),
      approveReplacement: (...args: unknown[]) => approveReplacementMock(...args),
    },
  },
}));

describe("AdminApplicationsListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders list with replacement/new indicators, filters by status, and paginates", async () => {
    const user = userEvent.setup();
    listAdminApplicationsMock.mockResolvedValue({
      data: [
        {
          application_id: "app_new_1",
          full_name: "Siti Aminah",
          email: "siti@kampus.ac.id",
          student_id: "23001",
          class_name: "IF-01",
          application_type: "NEW",
          status: "PENDING_VERIFICATION",
          submitted_at: "2026-11-26T02:00:00Z",
        },
        {
          application_id: "app_rep_1",
          full_name: "Budi Pengganti",
          email: "budi@kampus.ac.id",
          student_id: "23002",
          class_name: "IF-02",
          application_type: "REPLACEMENT",
          status: "PENDING_REPLACEMENT_NOTICE",
          submitted_at: "2026-11-26T03:00:00Z",
        },
      ],
      meta: {
        request_id: "req_list_1",
        pagination: { page: 1, page_size: 10, total_items: 15, total_pages: 2 },
      },
    });

    render(<AdminApplicationsListView />);

    expect(await screen.findByText("Siti Aminah")).toBeInTheDocument();
    expect(screen.getByText("Budi Pengganti")).toBeInTheDocument();
    expect(screen.getByText("Pengajuan Baru")).toBeInTheDocument();
    expect(screen.getByText("Pengajuan Pergantian")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Berikutnya" }));
    await waitFor(() => {
      expect(listAdminApplicationsMock).toHaveBeenLastCalledWith({
        page: 2,
        page_size: 10,
        status: undefined,
      });
    });

    await user.selectOptions(screen.getByLabelText("Filter Status Pengajuan"), "APPROVED");
    await waitFor(() => {
      expect(listAdminApplicationsMock).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        status: "APPROVED",
      });
    });
  });

  it("renders empty and error states with retry", async () => {
    const user = userEvent.setup();
    listAdminApplicationsMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce({
        data: [],
        meta: {
          request_id: "req_empty",
          pagination: { page: 1, page_size: 10, total_items: 0, total_pages: 0 },
        },
      });

    render(<AdminApplicationsListView />);

    expect(await screen.findByText("Gagal Memuat Daftar Pengajuan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Coba Lagi" }));

    expect(await screen.findByText("Tidak Ada Pengajuan Komting")).toBeInTheDocument();
  });
});

describe("AdminApplicationDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays private photo notice, approves new application, and prevents double-submit", async () => {
    const user = userEvent.setup();
    getAdminApplicationMock
      .mockResolvedValueOnce({
        data: {
          application_id: "app_new_1",
          full_name: "Siti Aminah",
          email: "siti@kampus.ac.id",
          student_id: "23001",
          class_name: "IF-01",
          application_type: "NEW",
          status: "PENDING_VERIFICATION",
          submitted_at: "2026-11-26T02:00:00Z",
          admin_note: null,
          rejection_reason: null,
        },
        meta: { request_id: "req_get_1" },
      })
      .mockResolvedValueOnce({
        data: {
          application_id: "app_new_1",
          full_name: "Siti Aminah",
          email: "siti@kampus.ac.id",
          student_id: "23001",
          class_name: "IF-01",
          application_type: "NEW",
          status: "APPROVED",
          submitted_at: "2026-11-26T02:00:00Z",
          admin_note: "Identitas terverifikasi.",
          rejection_reason: null,
        },
        meta: { request_id: "req_get_2" },
      });

    let resolveApprove: ((value: unknown) => void) | undefined;
    approveApplicationMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveApprove = resolve;
      })
    );

    render(<AdminApplicationDetailView applicationId="app_new_1" />);

    expect(await screen.findByText("Pratinjau Dokumen Belum Tersedia")).toBeInTheDocument();
    expect(screen.getByText("23001")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Catatan ADMIN/i), "Identitas terverifikasi.");
    await user.click(screen.getByRole("button", { name: "Setujui Pengajuan" }));

    const confirmBtn = screen.getByRole("button", { name: "Ya, Setujui Pengajuan" });
    await user.click(confirmBtn);
    await user.click(confirmBtn);

    expect(approveApplicationMock).toHaveBeenCalledTimes(1);
    expect(approveApplicationMock).toHaveBeenCalledWith("app_new_1", {
      admin_note: "Identitas terverifikasi.",
    });

    resolveApprove?.({
      data: {
        application_id: "app_new_1",
        status: "APPROVED",
        assignment: { id: "assign_1", status: "ACTIVE", class_name: "IF-01" },
      },
      meta: { request_id: "req_app_ok" },
    });

    expect(await screen.findByText(/Pengajuan disetujui/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/Pengajuan berstatus APPROVED sudah selesai diproses/i)
    ).toBeInTheDocument();
  });

  it("validates mandatory rejection reason, rejects application, and handles API errors", async () => {
    const user = userEvent.setup();
    getAdminApplicationMock
      .mockResolvedValueOnce({
        data: {
          application_id: "app_new_2",
          full_name: "Rudi",
          class_name: "IF-04",
          application_type: "NEW",
          status: "PENDING_VERIFICATION",
          submitted_at: "2026-11-26T02:00:00Z",
        },
        meta: { request_id: "req_1" },
      })
      .mockResolvedValueOnce({
        data: {
          application_id: "app_new_2",
          full_name: "Rudi",
          class_name: "IF-04",
          application_type: "NEW",
          status: "REJECTED",
          submitted_at: "2026-11-26T02:00:00Z",
          rejection_reason: "Foto KTM tidak terbaca.",
        },
        meta: { request_id: "req_2" },
      });

    rejectApplicationMock
      .mockRejectedValueOnce(new ApiClientError({ status: 409, code: "BOOKING_CONFLICT" }))
      .mockResolvedValueOnce({
        data: {
          application_id: "app_new_2",
          status: "REJECTED",
          submitted_at: "2026-11-26T02:00:00Z",
          rejection_reason: "Foto KTM tidak terbaca.",
        },
        meta: { request_id: "req_rej" },
      });

    render(<AdminApplicationDetailView applicationId="app_new_2" />);

    await user.click(await screen.findByRole("button", { name: "Tolak Pengajuan" }));
    expect(screen.getByText("Alasan penolakan wajib diisi.")).toBeInTheDocument();
    expect(rejectApplicationMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Alasan Penolakan/i), "Foto KTM tidak terbaca.");
    await user.click(screen.getByRole("button", { name: "Tolak Pengajuan" }));
    await user.click(screen.getByRole("button", { name: "Ya, Tolak Pengajuan" }));

    expect(await screen.findByText("Penolakan Gagal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya, Tolak Pengajuan" }));
    await waitFor(() => {
      expect(rejectApplicationMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText(/Pengajuan komting ditolak/i)).toBeInTheDocument();
  });

  it("processes replacement approval with warning and Idempotency-Key reuse on retry", async () => {
    const user = userEvent.setup();
    getAdminApplicationMock
      .mockResolvedValueOnce({
        data: {
          application_id: "app_rep_1",
          full_name: "Calon Pengganti",
          class_name: "IF-01",
          application_type: "REPLACEMENT",
          status: "PENDING_REPLACEMENT_NOTICE",
          submitted_at: "2026-11-26T03:00:00Z",
        },
        meta: { request_id: "req_r1" },
      })
      .mockResolvedValueOnce({
        data: {
          application_id: "app_rep_1",
          full_name: "Calon Pengganti",
          class_name: "IF-01",
          application_type: "REPLACEMENT",
          status: "APPROVED",
          submitted_at: "2026-11-26T03:00:00Z",
        },
        meta: { request_id: "req_r2" },
      });

    approveReplacementMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "TIMEOUT" }))
      .mockResolvedValueOnce({
        data: {
          application_id: "app_rep_1",
          status: "APPROVED",
          assignment: { id: "assign_rep", status: "ACTIVE", class_name: "IF-01" },
        },
        meta: { request_id: "req_rep_ok" },
      });

    render(<AdminApplicationDetailView applicationId="app_rep_1" />);

    expect(await screen.findByText("Alur Pengajuan Pergantian (Replacement)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Setujui Pergantian Komting" }));
    await user.click(screen.getByRole("button", { name: "Ya, Setujui Pergantian" }));

    expect(await screen.findByText("Persetujuan Pergantian Gagal")).toBeInTheDocument();
    const firstKey = approveReplacementMock.mock.calls[0]?.[2] as string;

    await user.click(screen.getByRole("button", { name: "Ya, Setujui Pergantian" }));
    await waitFor(() => {
      expect(approveReplacementMock).toHaveBeenCalledTimes(2);
    });
    expect(approveReplacementMock.mock.calls[1]?.[2]).toBe(firstKey);
    expect(
      await screen.findByText(/Pergantian komting disetujui secara atomik/i)
    ).toBeInTheDocument();
  });

  it("blocks approval actions when applicant email is not yet verified", async () => {
    getAdminApplicationMock.mockResolvedValueOnce({
      data: {
        application_id: "app_email_pending",
        full_name: "Belum Verifikasi",
        class_name: "IF-05",
        application_type: "NEW",
        status: "PENDING_EMAIL_VERIFICATION",
        submitted_at: "2026-11-26T03:00:00Z",
      },
      meta: { request_id: "req_ep" },
    });

    render(<AdminApplicationDetailView applicationId="app_email_pending" />);

    expect(await screen.findByText(/Email pemohon belum diverifikasi/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Setujui Pengajuan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tolak Pengajuan" })).not.toBeInTheDocument();
  });
});
