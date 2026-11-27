import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PickupConfirmationPanel } from "@/features/staff/pickup-confirmation-panel";
import { ReturnInspectionForm } from "@/features/staff/return-inspection-form";
import { validateBookingForm } from "@/lib/validation/booking";
import { getJakartaDateString, getJakartaTomorrowDateString } from "@/lib/utils/date";
import type { QrValidationResponse } from "@/services/contracts";
import type { Loan, OperatingHoursSnapshot } from "@/types/domain";

const confirmPickupMock = vi.fn();
const confirmReturnMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    qr: {
      confirmPickup: (...args: unknown[]) => confirmPickupMock(...args),
    },
    loan: {
      confirmReturn: (...args: unknown[]) => confirmReturnMock(...args),
    },
  },
}));

const SAMPLE_OPERATING_HOURS: OperatingHoursSnapshot = {
  opens_at: "08:00:00",
  closes_at: "17:00:00",
  early_pickup_allowed_at: "07:45:00",
};

const SAMPLE_QR_VALIDATION: QrValidationResponse = {
  valid: true,
  action: "PICKUP",
  transaction: {
    booking_id: "bkg_01",
    booking_code: "BKG-20261127-01",
    komting_name: "Simulasi Komting Aktif",
    class_name: "IF-01",
    projector_name: "Epson EB-X500",
    status: "CONFIRMED",
  },
  requires_confirmation: true,
};

const SAMPLE_LOAN: Loan = {
  id: "loan_1",
  booking_id: "bkg_01",
  projector_id: "proj_01",
  komting_id: "usr_komting_01",
  status: "ACTIVE",
  picked_up_at: "2026-11-27T02:00:00Z",
  returned_at: null,
  return_condition: null,
};

describe("E2E Skenario Business Rule Validation", () => {
  const fixedNow = new Date("2026-11-27T01:00:00Z"); // 08:00 WIB
  const today = getJakartaDateString(fixedNow);
  const tomorrow = getJakartaTomorrowDateString(fixedNow);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Aturan Tanggal dan Waktu Booking", () => {
    it("hanya memperbolehkan booking untuk hari ini atau besok", () => {
      // Hari ini -> Valid
      const validToday = validateBookingForm(
        {
          projectorId: "proj_01",
          bookingDate: today,
          startTime: "09:00",
          estimatedReturnTime: "11:00",
        },
        SAMPLE_OPERATING_HOURS,
        fixedNow
      );
      expect(validToday.bookingDate).toBeUndefined();

      // Besok -> Valid
      const validTomorrow = validateBookingForm(
        {
          projectorId: "proj_01",
          bookingDate: tomorrow,
          startTime: "09:00",
          estimatedReturnTime: "11:00",
        },
        SAMPLE_OPERATING_HOURS,
        fixedNow
      );
      expect(validTomorrow.bookingDate).toBeUndefined();

      // Tanggal kemarin -> Ditolak
      const pastResult = validateBookingForm(
        {
          projectorId: "proj_01",
          bookingDate: "2026-01-01",
          startTime: "09:00",
          estimatedReturnTime: "11:00",
        },
        SAMPLE_OPERATING_HOURS,
        fixedNow
      );
      expect(pastResult.bookingDate).toBe(
        "Booking hanya dapat dibuat untuk hari ini atau besok (Asia/Jakarta)."
      );

      // Tanggal jauh di masa depan -> Ditolak
      const farFutureResult = validateBookingForm(
        {
          projectorId: "proj_01",
          bookingDate: "2026-12-30",
          startTime: "09:00",
          estimatedReturnTime: "11:00",
        },
        SAMPLE_OPERATING_HOURS,
        fixedNow
      );
      expect(farFutureResult.bookingDate).toBe(
        "Booking hanya dapat dibuat untuk hari ini atau besok (Asia/Jakarta)."
      );
    });

    it("memvalidasi bahwa waktu mulai harus mendahului estimasi pengembalian pada hari yang sama", () => {
      // 09:00 ke 11:00 -> Valid
      const validRange = validateBookingForm(
        {
          projectorId: "proj_01",
          bookingDate: today,
          startTime: "09:00",
          estimatedReturnTime: "11:00",
        },
        SAMPLE_OPERATING_HOURS,
        fixedNow
      );
      expect(validRange.estimatedReturnTime).toBeUndefined();

      // 11:00 ke 09:00 -> Ditolak
      const invalidRange = validateBookingForm(
        {
          projectorId: "proj_01",
          bookingDate: today,
          startTime: "11:00",
          estimatedReturnTime: "09:00",
        },
        SAMPLE_OPERATING_HOURS,
        fixedNow
      );
      expect(invalidRange.estimatedReturnTime).toBe(
        "Estimasi pengembalian harus setelah waktu mulai pada tanggal kalender yang sama."
      );
    });
  });

  describe("2. Aturan Pickup Eksplisit & Pendelegasian Perwakilan", () => {
    it("menolak konfirmasi pickup jika perwakilan dipilih tanpa mencantumkan nama", async () => {
      const user = userEvent.setup();
      const onConfirmed = vi.fn();

      render(
        <PickupConfirmationPanel
          validation={SAMPLE_QR_VALIDATION}
          qrPayload="opaque_token_valid_123"
          onConfirmed={onConfirmed}
        />
      );

      // Pilih Diambil oleh Perwakilan
      await user.selectOptions(screen.getByLabelText(/Penerima Unit/i), "REPRESENTATIVE");

      // Klik Konfirmasi Pickup tanpa mengisi nama perwakilan
      await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));

      expect(
        await screen.findByText("Nama perwakilan wajib diisi jika bukan diambil komting.")
      ).toBeInTheDocument();
      expect(confirmPickupMock).not.toHaveBeenCalled();
    });

    it("mengeksekusi konfirmasi pickup secara eksplisit dan mengirim nama perwakilan", async () => {
      const user = userEvent.setup();
      const onConfirmed = vi.fn();

      confirmPickupMock.mockResolvedValueOnce({
        data: {
          loan: { id: "loan_1", status: "ACTIVE", picked_up_at: "2026-11-27T02:00:00Z" },
          booking: { id: "bkg_01", status: "FULFILLED" },
          projector: { id: "proj_01", physical_status: "BORROWED" },
        },
      });

      render(
        <PickupConfirmationPanel
          validation={SAMPLE_QR_VALIDATION}
          qrPayload="opaque_token_valid_123"
          onConfirmed={onConfirmed}
        />
      );

      await user.selectOptions(screen.getByLabelText(/Penerima Unit/i), "REPRESENTATIVE");
      await user.type(screen.getByLabelText(/Nama Perwakilan Penerima/i), "Mahasiswa Pengganti");
      await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));

      // Konfirmasi di dialog modal
      expect(await screen.findByText("Konfirmasi Penyerahan Proyektor?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

      await waitFor(() => {
        expect(confirmPickupMock).toHaveBeenCalledWith(
          "bkg_01",
          {
            qr_payload: "opaque_token_valid_123",
            confirmed: true,
            received_by: "REPRESENTATIVE",
            representative_name: "Mahasiswa Pengganti",
            note: null,
          },
          expect.any(String)
        );
      });
      expect(onConfirmed).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Aturan Inspeksi Pengembalian & Kewajiban Foto Bukti", () => {
    it("mewajibkan foto bukti saat kondisi proyektor DAMAGED atau INCOMPLETE", async () => {
      const user = userEvent.setup();
      const onConfirmed = vi.fn();

      render(
        <ReturnInspectionForm
          loan={SAMPLE_LOAN}
          initialQrPayload="opaque_token_valid_123"
          onCompleted={onConfirmed}
        />
      );

      // Pilih DAMAGED
      await user.selectOptions(screen.getByLabelText(/Kondisi Proyektor/i), "DAMAGED");

      // Coba konfirmasi tanpa mengunggah foto bukti
      await user.click(screen.getByRole("button", { name: "Konfirmasi Pengembalian" }));

      expect(
        await screen.findByText(
          "Foto bukti wajib diunggah karena proyektor rusak atau aksesori tidak lengkap."
        )
      ).toBeInTheDocument();
      expect(confirmReturnMock).not.toHaveBeenCalled();

      // Unggah foto bukti
      const file = new File(["dummy_img"], "kabel_hilang.jpg", { type: "image/jpeg" });
      const fileInput = screen.getByLabelText(/Foto Bukti Kondisi/i);
      fireEvent.change(fileInput, { target: { files: [file] } });

      confirmReturnMock.mockResolvedValueOnce({
        data: {
          loan: { id: "loan_1", status: "RETURNED", returned_at: "2026-11-27T04:00:00Z" },
          inspection: {
            projector_condition: "DAMAGED",
            accessories_condition: "COMPLETE",
            unit_disposition: "MAINTENANCE",
          },
          projector: { id: "proj_01", physical_status: "MAINTENANCE" },
        },
      });

      await user.click(screen.getByRole("button", { name: "Konfirmasi Pengembalian" }));
      expect(await screen.findByText("Konfirmasi Pengembalian Unit?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ya, Selesaikan Return" }));

      await waitFor(() => {
        expect(confirmReturnMock).toHaveBeenCalledWith(
          "loan_1",
          expect.any(FormData),
          expect.any(String)
        );
      });
      expect(onConfirmed).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Integritas Status Fisik Proyektor", () => {
    it("tidak mengizinkan frontend mengubah status fisik proyektor secara sepihak", () => {
      expect(confirmPickupMock).not.toHaveBeenCalled();
      expect(confirmReturnMock).not.toHaveBeenCalled();
    });
  });
});
