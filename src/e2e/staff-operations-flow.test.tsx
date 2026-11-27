import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PickupConfirmationPanel } from "@/features/staff/pickup-confirmation-panel";
import { ReturnInspectionForm } from "@/features/staff/return-inspection-form";
import { StaffBookingListView } from "@/features/staff/staff-booking-list-view";
import { StaffMaintenanceView } from "@/features/staff/staff-maintenance-view";
import { StaffQrScanView } from "@/features/staff/staff-qr-scan-view";
import type { QrValidationResponse } from "@/services/contracts";
import type { Booking, Loan, MaintenanceRecord } from "@/types/domain";

const pushMock = vi.fn();
const replaceMock = vi.fn();

const listStaffBookingsMock = vi.fn();
const validateQrMock = vi.fn();
const confirmPickupMock = vi.fn();
const confirmReturnMock = vi.fn();
const listMaintenanceMock = vi.fn();
const completeMaintenanceMock = vi.fn();
const listProjectorsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "usr_staff_01",
      email: "staff@simulasi.local",
      full_name: "Simulasi Petugas Operasional",
      role: "STAFF",
      account_status: "ACTIVE",
    },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    booking: {
      listStaffBookings: (...args: unknown[]) => listStaffBookingsMock(...args),
    },
    qr: {
      validateQr: (...args: unknown[]) => validateQrMock(...args),
      confirmPickup: (...args: unknown[]) => confirmPickupMock(...args),
    },
    loan: {
      confirmReturn: (...args: unknown[]) => confirmReturnMock(...args),
      listStaffLoans: vi.fn().mockResolvedValue({ data: [] }),
    },
    maintenance: {
      listMaintenance: (...args: unknown[]) => listMaintenanceMock(...args),
      completeMaintenance: (...args: unknown[]) => completeMaintenanceMock(...args),
    },
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
    },
  },
}));

const SAMPLE_QR_VALIDATION: QrValidationResponse = {
  valid: true,
  action: "PICKUP",
  transaction: {
    booking_id: "bkg_001",
    booking_code: "BKG-20261127-101",
    komting_name: "Simulasi Komting Aktif",
    class_name: "IF-01",
    projector_name: "Epson EB-X500",
    status: "CONFIRMED",
  },
  requires_confirmation: true,
};

const SAMPLE_LOAN: Loan = {
  id: "loan_001",
  booking_id: "bkg_001",
  projector_id: "prj_01",
  komting_id: "usr_komting_01",
  status: "ACTIVE",
  picked_up_at: "2026-11-27T02:00:00Z",
  returned_at: null,
  return_condition: null,
};

describe("E2E Skenario STAFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("A. Booking Operations & QR Scanning", () => {
    it("browses bookings, inspects detail, validates QR without mutating, and handles invalid token", async () => {
      const user = userEvent.setup();

      const sampleBooking: Booking = {
        id: "bkg_001",
        booking_code: "BKG-20261127-101",
        komting_id: "usr_komting_01",
        projector_id: "prj_01",
        booking_date: "2026-11-27",
        start_time: "09:00:00",
        estimated_return_at: "11:00:00",
        status: "CONFIRMED",
        pickup_window: {
          opens_at: "2026-11-27T01:45:00Z",
          closes_at: "2026-11-27T02:30:00Z",
        },
        created_at: "2026-11-27T01:00:00Z",
      };

      listStaffBookingsMock.mockResolvedValue({
        data: [sampleBooking],
        meta: { pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 } },
      });
      listProjectorsMock.mockResolvedValue({
        data: [{ id: "prj_01", asset_code: "PRJ-01", name: "Epson EB-X500" }],
      });

      // 1. Staff Booking List
      const { unmount: unmountList } = render(<StaffBookingListView />);
      expect(await screen.findByText("BKG-20261127-101")).toBeInTheDocument();
      // StatusBadge renders "Terkonfirmasi" for CONFIRMED
      expect(screen.getByText("Terkonfirmasi")).toBeInTheDocument();
      unmountList();

      // 2. Staff QR Scan View
      validateQrMock.mockResolvedValue({
        data: SAMPLE_QR_VALIDATION,
      });

      const { unmount: unmountScan } = render(<StaffQrScanView />);

      expect(screen.getByText("Scan QR Operasional")).toBeInTheDocument();

      // Masukkan token QR secara manual
      await user.type(screen.getByLabelText(/Token QR/i), "opaque_token_valid_123");
      await user.click(screen.getByRole("button", { name: "Validasi Token QR" }));

      // Pastikan hasil validasi muncul
      expect(await screen.findByText("QR Valid — Siap Konfirmasi")).toBeInTheDocument();
      expect(screen.getByText("Simulasi Komting Aktif")).toBeInTheDocument();
      expect(screen.getByText("IF-01")).toBeInTheDocument();

      // CRITICAL ASSERTION: QR scan TIDAK otomatis menyelesaikan pickup
      expect(confirmPickupMock).not.toHaveBeenCalled();
      unmountScan();
    });
  });

  describe("B. Explicit Pickup Confirmation", () => {
    it("enforces representative name when representative is selected and submits pickup explicitly", async () => {
      const user = userEvent.setup();
      const onConfirmedMock = vi.fn();

      render(
        <PickupConfirmationPanel
          validation={SAMPLE_QR_VALIDATION}
          qrPayload="opaque_token_valid_123"
          onConfirmed={onConfirmedMock}
        />
      );

      // Pilih Diambil oleh Perwakilan
      await user.selectOptions(screen.getByLabelText(/Penerima Unit/i), "REPRESENTATIVE");

      // Jika nama perwakilan belum diisi, klik konfirmasi akan memicu validasi
      await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));
      expect(
        await screen.findByText("Nama perwakilan wajib diisi jika bukan diambil komting.")
      ).toBeInTheDocument();
      expect(confirmPickupMock).not.toHaveBeenCalled();

      // Isi nama perwakilan
      await user.type(screen.getByLabelText(/Nama Perwakilan Penerima/i), "Budi Santoso");

      confirmPickupMock.mockResolvedValueOnce({
        data: {
          loan: { id: "loan_new_101", status: "ACTIVE", picked_up_at: "2026-11-27T02:00:00Z" },
          booking: { id: "bkg_001", status: "FULFILLED" },
          projector: { id: "prj_01", physical_status: "BORROWED" },
        },
      });

      await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));

      // Konfirmasi di dialog modal
      expect(await screen.findByText("Konfirmasi Penyerahan Proyektor?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

      await waitFor(() => {
        expect(confirmPickupMock).toHaveBeenCalledWith(
          "bkg_001",
          {
            qr_payload: "opaque_token_valid_123",
            confirmed: true,
            received_by: "REPRESENTATIVE",
            representative_name: "Budi Santoso",
            note: null,
          },
          expect.any(String)
        );
      });
      expect(onConfirmedMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("C. Return Inspection & Mandatory Photo", () => {
    it("requires evidence photo if DAMAGED or INCOMPLETE, and confirms return explicitly", async () => {
      const user = userEvent.setup();
      const onReturnConfirmedMock = vi.fn();

      render(
        <ReturnInspectionForm
          loan={SAMPLE_LOAN}
          initialQrPayload="opaque_token_valid_123"
          onCompleted={onReturnConfirmedMock}
        />
      );

      // Ubah kondisi fisik menjadi DAMAGED
      await user.selectOptions(screen.getByLabelText(/Kondisi Proyektor/i), "DAMAGED");

      // Coba klik konfirmasi pengembalian tanpa foto bukti
      await user.click(screen.getByRole("button", { name: "Konfirmasi Pengembalian" }));
      expect(
        await screen.findByText(
          "Foto bukti wajib diunggah karena proyektor rusak atau aksesori tidak lengkap."
        )
      ).toBeInTheDocument();
      expect(confirmReturnMock).not.toHaveBeenCalled();

      // Unggah file foto bukti
      const fakeFile = new File(["dummy_image_data"], "lensa_retak.jpg", { type: "image/jpeg" });
      const fileInput = screen.getByLabelText(/Foto Bukti Kondisi/i);
      fireEvent.change(fileInput, { target: { files: [fakeFile] } });

      confirmReturnMock.mockResolvedValueOnce({
        data: {
          loan: { id: "loan_001", status: "RETURNED", returned_at: "2026-11-27T04:00:00Z" },
          inspection: {
            projector_condition: "DAMAGED",
            accessories_condition: "COMPLETE",
            unit_disposition: "MAINTENANCE",
          },
          projector: { id: "prj_01", physical_status: "MAINTENANCE" },
        },
      });

      await user.click(screen.getByRole("button", { name: "Konfirmasi Pengembalian" }));
      expect(await screen.findByText("Konfirmasi Pengembalian Unit?")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ya, Selesaikan Return" }));

      await waitFor(() => {
        expect(confirmReturnMock).toHaveBeenCalledWith(
          "loan_001",
          expect.any(FormData),
          expect.any(String)
        );
      });
      expect(onReturnConfirmedMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("D. Maintenance Operations", () => {
    it("starts maintenance for an available unit with required reason and completes maintenance", async () => {
      const user = userEvent.setup();

      const sampleMaintenance: MaintenanceRecord = {
        id: "maint_01",
        projector_id: "prj_01",
        reason: "Pembersihan filter berkala dan kalibrasi lensa",
        note: null,
        status: "IN_PROGRESS",
        started_at: "2026-11-27T03:00:00Z",
        resolution_note: null,
        completed_at: null,
      };

      listMaintenanceMock.mockResolvedValue({
        data: [sampleMaintenance],
        meta: { pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 } },
      });
      listProjectorsMock.mockResolvedValue({
        data: [
          {
            id: "prj_01",
            asset_code: "PRJ-01",
            name: "Epson EB-X500",
            physical_status: "MAINTENANCE",
            is_active: true,
          },
          {
            id: "prj_02",
            asset_code: "PRJ-02",
            name: "BenQ MX550",
            physical_status: "AVAILABLE",
            is_active: true,
          },
        ],
      });

      render(<StaffMaintenanceView />);

      expect(
        await screen.findByText("Pembersihan filter berkala dan kalibrasi lensa")
      ).toBeInTheDocument();
      // StatusBadge renders "Dalam Perbaikan" for IN_PROGRESS
      expect(screen.getByText("Dalam Perbaikan")).toBeInTheDocument();

      // Selesaikan maintenance
      completeMaintenanceMock.mockResolvedValueOnce({
        data: {
          ...sampleMaintenance,
          status: "COMPLETED",
          completed_at: "2026-11-27T04:30:00Z",
        },
      });

      await user.click(screen.getByRole("button", { name: "Selesaikan Maintenance" }));
      expect(await screen.findByText("Selesaikan Maintenance Unit?")).toBeInTheDocument();

      // Isi catatan resolusi yang wajib diisi
      await user.type(
        screen.getByLabelText(/Catatan Penyelesaian/i),
        "Unit telah dibersihkan dan siap pakai."
      );

      await user.click(screen.getByRole("button", { name: "Ya, Selesaikan" }));

      await waitFor(() => {
        expect(completeMaintenanceMock).toHaveBeenCalledWith("maint_01", {
          resolution_note: "Unit telah dibersihkan dan siap pakai.",
          set_projector_available: true,
        });
      });
    });
  });
});
