import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingDetailView } from "@/features/bookings/booking-detail-view";
import { NewBookingForm } from "@/features/bookings/new-booking-form";
import { KomtingLoanHistoryView } from "@/features/loans/komting-loan-history-view";
import { ProjectorListView } from "@/features/projectors/projector-list-view";
import { LoginForm } from "@/features/auth/login-form";
import { ApiClientError } from "@/lib/api/errors";
import { getJakartaTomorrowDateString } from "@/lib/utils/date";
import type { Booking, Loan } from "@/types/domain";

const replaceMock = vi.fn();
const pushMock = vi.fn();
let mockSearchNext: string | null = null;
let mockSearchParamProjectorId: string | null = null;

const signInMock = vi.fn();
const clearErrorMock = vi.fn();

const listProjectorsMock = vi.fn();
const getProjectorMock = vi.fn();
const getOperatingHoursMock = vi.fn();
const checkAvailabilityMock = vi.fn();
const createBookingMock = vi.fn();
const getKomtingBookingMock = vi.fn();
const cancelKomtingBookingMock = vi.fn();
const getBookingQrMock = vi.fn();
const listKomtingLoansMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "next") return mockSearchNext;
      if (key === "projector_id") return mockSearchParamProjectorId;
      return null;
    },
  }),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "usr_komting_01",
      email: "komting.aktif@simulasi.local",
      full_name: "Simulasi Komting Aktif",
      role: "KOMTING",
      account_status: "ACTIVE",
      komting_assignment: {
        id: "assign_01",
        class_name: "IF-01",
        status: "ACTIVE",
      },
    },
    error: null,
    signIn: signInMock,
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: clearErrorMock,
  }),
}));

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
      getProjector: (...args: unknown[]) => getProjectorMock(...args),
    },
    operatingHours: {
      getOperatingHours: (...args: unknown[]) => getOperatingHoursMock(...args),
    },
    availability: {
      checkAvailability: (...args: unknown[]) => checkAvailabilityMock(...args),
    },
    booking: {
      createBooking: (...args: unknown[]) => createBookingMock(...args),
      getKomtingBooking: (...args: unknown[]) => getKomtingBookingMock(...args),
      cancelKomtingBooking: (...args: unknown[]) => cancelKomtingBookingMock(...args),
    },
    qr: {
      getBookingQr: (...args: unknown[]) => getBookingQrMock(...args),
    },
    loan: {
      listKomtingLoans: (...args: unknown[]) => listKomtingLoansMock(...args),
    },
  },
}));

describe("E2E Skenario KOMTING", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchNext = null;
    mockSearchParamProjectorId = null;
  });

  describe("A. Authentication Flow", () => {
    it("handles login validation, failure, and redirect based on role and status", async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      // 1. Validasi form kosong
      await user.click(screen.getByRole("button", { name: "Masuk" }));
      expect(screen.getByText("Email wajib diisi.")).toBeInTheDocument();
      expect(screen.getByText("Password wajib diisi.")).toBeInTheDocument();

      // 2. Format email tidak valid
      await user.type(screen.getByLabelText(/Email/i), "invalid-email");
      await user.type(screen.getByLabelText(/Password/i), "secret123");
      await user.click(screen.getByRole("button", { name: "Masuk" }));
      expect(screen.getByText("Format email tidak valid.")).toBeInTheDocument();

      // 3. Login gagal (kredensial salah dari API)
      signInMock.mockRejectedValueOnce(
        new ApiClientError({
          status: 401,
          code: "INVALID_CREDENTIALS",
          message: "Email atau password salah.",
        })
      );
      await user.clear(screen.getByLabelText(/Email/i));
      await user.type(screen.getByLabelText(/Email/i), "komting.aktif@simulasi.local");
      await user.click(screen.getByRole("button", { name: "Masuk" }));

      expect(await screen.findByText("Email atau password salah.")).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();

      // 4. Login berhasil sebagai KOMTING aktif -> redirect ke /komting
      signInMock.mockResolvedValueOnce({
        id: "usr_komting_01",
        email: "komting.aktif@simulasi.local",
        full_name: "Simulasi Komting Aktif",
        role: "KOMTING",
        account_status: "ACTIVE",
      });
      await user.click(screen.getByRole("button", { name: "Masuk" }));

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/komting");
      });

      // 5. Login berhasil sebagai calon KOMTING (PENDING_VERIFICATION) -> redirect ke /application/status
      signInMock.mockResolvedValueOnce({
        id: "usr_komting_02",
        email: "calon.komting@simulasi.local",
        full_name: "Simulasi Calon Komting",
        role: "KOMTING",
        account_status: "PENDING_VERIFICATION",
      });
      await user.click(screen.getByRole("button", { name: "Masuk" }));

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/application/status");
      });
    });
  });

  describe("B. Booking Lifecycle Flow", () => {
    it("browses projectors, creates booking, verifies QR card, and cancels booking", async () => {
      const user = userEvent.setup();

      // 1. Browsing Projectors
      listProjectorsMock.mockResolvedValue({
        data: [
          {
            id: "proj_01",
            asset_code: "PRJ-01",
            name: "Epson EB-X500",
            brand: "Epson",
            model: "EB-X500",
            physical_status: "AVAILABLE",
            is_active: true,
          },
          {
            id: "proj_02",
            asset_code: "PRJ-02",
            name: "BenQ MX550",
            brand: "BenQ",
            model: "MX550",
            physical_status: "BORROWED",
            is_active: true,
          },
        ],
        meta: {
          request_id: "req_proj_1",
          pagination: { page: 1, page_size: 10, total_items: 2, total_pages: 1 },
        },
      });

      const { unmount: unmountProjectors } = render(<ProjectorListView />);
      expect(await screen.findByText("Epson EB-X500")).toBeInTheDocument();
      expect(screen.getByText("BenQ MX550")).toBeInTheDocument();
      // StatusBadge maps AVAILABLE to "Tersedia" and BORROWED to "Dipinjam"
      expect(screen.getByText("Tersedia")).toBeInTheDocument();
      expect(screen.getByText("Dipinjam")).toBeInTheDocument();

      const bookingLinks = screen.getAllByRole("link", { name: "Pilih Unit" });
      expect(bookingLinks[0]).toHaveAttribute("href", "/komting/bookings/new?projector_id=proj_01");
      unmountProjectors();

      // 2. Open New Booking Form
      mockSearchParamProjectorId = "proj_01";
      const tomorrowDate = getJakartaTomorrowDateString();
      getOperatingHoursMock.mockResolvedValue({
        data: {
          service_date: tomorrowDate,
          opens_at: "08:00:00",
          closes_at: "17:00:00",
          early_pickup_allowed_at: "07:45:00",
        },
      });
      checkAvailabilityMock.mockResolvedValue({
        data: {
          projector_id: "proj_01",
          date: tomorrowDate,
          available: true,
          is_bookable: true,
          physical_status: "AVAILABLE",
          conflicts: [],
          operating_hours: {
            service_date: tomorrowDate,
            timezone: "Asia/Jakarta",
            opens_at: "08:00:00",
            closes_at: "17:00:00",
            early_pickup_allowed_at: "07:45:00",
          },
        },
      });

      const sampleCreatedBooking: Booking = {
        id: "sim_booking_new_01",
        booking_code: "BKG-20261127-001",
        komting_id: "usr_komting_01",
        projector_id: "proj_01",
        booking_date: tomorrowDate,
        start_time: "09:00:00",
        estimated_return_at: "11:00:00",
        status: "CONFIRMED",
        pickup_window: {
          opens_at: "2026-11-27T01:45:00Z",
          closes_at: "2026-11-27T02:30:00Z",
        },
        created_at: "2026-11-27T01:00:00Z",
      };
      createBookingMock.mockResolvedValue({ data: sampleCreatedBooking });

      const { unmount: unmountNewBooking } = render(<NewBookingForm />);

      expect(await screen.findByText("Buat Booking Proyektor")).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText(/Tanggal Booking/i), tomorrowDate);
      expect(await screen.findByText(/08:00 WIB/)).toBeInTheDocument();

      // Submit booking with "Kirim Booking"
      await user.click(screen.getByRole("button", { name: /Kirim Booking/i }));

      await waitFor(() => {
        expect(createBookingMock).toHaveBeenCalledTimes(1);
        expect(pushMock).toHaveBeenCalledWith("/komting/bookings/sim_booking_new_01");
      });
      unmountNewBooking();

      // 3. Open Booking Detail View with QR Payload
      getKomtingBookingMock.mockResolvedValue({ data: sampleCreatedBooking });
      getProjectorMock.mockResolvedValue({
        data: {
          id: "proj_01",
          asset_code: "PRJ-01",
          name: "Epson EB-X500",
          brand: "Epson",
          model: "EB-X500",
          physical_status: "AVAILABLE",
          is_active: true,
        },
      });
      getBookingQrMock.mockResolvedValue({
        data: {
          qr_payload: "opaque_qr_token_bkg_001_xyz",
          expires_at: "2026-11-27T04:00:00Z",
        },
      });

      const { unmount: unmountDetail } = render(
        <BookingDetailView bookingId="sim_booking_new_01" />
      );

      expect(await screen.findByText("Booking BKG-20261127-001")).toBeInTheDocument();
      // StatusBadge renders "Terkonfirmasi" for CONFIRMED
      expect(screen.getByText("Terkonfirmasi")).toBeInTheDocument();
      expect(await screen.findByText("opaque_qr_token_bkg_001_xyz")).toBeInTheDocument();

      // 4. Cancel Booking per business rules
      cancelKomtingBookingMock.mockResolvedValue({
        data: {
          ...sampleCreatedBooking,
          status: "CANCELLED",
          cancellation_reason: "Dosen membatalkan kuliah tatap muka.",
        },
      });

      await user.click(screen.getByRole("button", { name: /Batalkan Booking/i }));
      expect(await screen.findByText("Batalkan Booking?")).toBeInTheDocument();

      // Alasan pembatalan minimal 5 karakter
      await user.type(
        screen.getByLabelText(/Alasan Pembatalan/i),
        "Dosen membatalkan kuliah tatap muka."
      );
      await user.click(screen.getByRole("button", { name: "Ya, Batalkan Booking" }));

      await waitFor(() => {
        expect(cancelKomtingBookingMock).toHaveBeenCalledWith(
          "sim_booking_new_01",
          { reason: "Dosen membatalkan kuliah tatap muka." },
          expect.any(String)
        );
      });
      expect(await screen.findByText("Booking berhasil dibatalkan.")).toBeInTheDocument();
      unmountDetail();
    });

    it("displays error when booking creation fails due to slot conflict", async () => {
      const user = userEvent.setup();

      listProjectorsMock.mockResolvedValue({
        data: [
          {
            id: "proj_01",
            asset_code: "PRJ-01",
            name: "Epson EB-X500",
            physical_status: "AVAILABLE",
            is_active: true,
          },
        ],
        meta: { pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 } },
      });
      const tomorrowDate = getJakartaTomorrowDateString();
      getOperatingHoursMock.mockResolvedValue({
        data: {
          service_date: tomorrowDate,
          opens_at: "08:00:00",
          closes_at: "17:00:00",
          early_pickup_allowed_at: "07:45:00",
        },
      });
      checkAvailabilityMock.mockResolvedValue({
        data: {
          projector_id: "proj_01",
          date: tomorrowDate,
          available: true,
          is_bookable: true,
          physical_status: "AVAILABLE",
          conflicts: [],
          operating_hours: {
            service_date: tomorrowDate,
            timezone: "Asia/Jakarta",
            opens_at: "08:00:00",
            closes_at: "17:00:00",
            early_pickup_allowed_at: "07:45:00",
          },
        },
      });
      createBookingMock.mockRejectedValueOnce(
        new ApiClientError({
          status: 409,
          code: "SLOT_UNAVAILABLE",
          message: "Slot waktu proyektor bertabrakan dengan jadwal peminjaman lain.",
        })
      );

      render(<NewBookingForm />);

      expect(await screen.findByText("Buat Booking Proyektor")).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText(/Tanggal Booking/i), tomorrowDate);

      await user.click(screen.getByRole("button", { name: /Kirim Booking/i }));

      expect(
        await screen.findByText("Slot waktu proyektor bertabrakan dengan jadwal peminjaman lain.")
      ).toBeInTheDocument();
      expect(pushMock).not.toHaveBeenCalled();
    });
  });

  describe("C. Loan History Flow", () => {
    it("renders komting loan history with active and returned records", async () => {
      const sampleLoans: Loan[] = [
        {
          id: "loan_01",
          booking_id: "b_01",
          projector_id: "proj_01",
          komting_id: "usr_komting_01",
          status: "ACTIVE",
          picked_up_at: "2026-11-27T02:00:00Z",
          returned_at: null,
          return_condition: null,
        },
        {
          id: "loan_02",
          booking_id: "b_02",
          projector_id: "proj_02",
          komting_id: "usr_komting_01",
          status: "RETURNED",
          picked_up_at: "2026-11-26T02:00:00Z",
          returned_at: "2026-11-26T03:50:00Z",
          return_condition: "NORMAL",
        },
      ];

      listKomtingLoansMock.mockResolvedValue({
        data: sampleLoans,
        meta: {
          request_id: "req_loan_1",
          pagination: { page: 1, page_size: 10, total_items: 2, total_pages: 1 },
        },
      });

      render(<KomtingLoanHistoryView />);

      expect(await screen.findByText("Riwayat Peminjaman")).toBeInTheDocument();
      // StatusBadge renders "Aktif" for ACTIVE and "Dikembalikan" for RETURNED
      expect(screen.getByText("Aktif")).toBeInTheDocument();
      expect(screen.getByText("Dikembalikan")).toBeInTheDocument();
      expect(screen.getByText("loan_01")).toBeInTheDocument();
      expect(screen.getByText("loan_02")).toBeInTheDocument();
    });
  });
});
