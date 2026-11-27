import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { StaffQrScanView } from "@/features/staff/staff-qr-scan-view";

const validateQrMock = vi.fn();
const confirmPickupMock = vi.fn();
const listStaffLoansMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    qr: {
      validateQr: (...args: unknown[]) => validateQrMock(...args),
      confirmPickup: (...args: unknown[]) => confirmPickupMock(...args),
    },
    loan: {
      listStaffLoans: (...args: unknown[]) => listStaffLoansMock(...args),
    },
  },
}));

describe("StaffQrScanView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks up PICKUP QR, requires representative name when selected, and reuses Idempotency-Key on retry", async () => {
    const user = userEvent.setup();
    validateQrMock.mockResolvedValueOnce({
      data: {
        valid: true,
        action: "PICKUP",
        transaction: {
          booking_id: "bkg_1",
          booking_code: "BKG-001",
          komting_name: "Budi",
          class_name: "IF-01",
          projector_name: "Epson EB-X500",
          status: "CONFIRMED",
        },
        requires_confirmation: true,
      },
      meta: { request_id: "req_v" },
    });

    confirmPickupMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "TIMEOUT" }))
      .mockResolvedValueOnce({
        data: {
          booking: { id: "bkg_1", status: "FULFILLED" },
          loan: { id: "loan_1", status: "ACTIVE", picked_up_at: "2026-11-26T02:00:00Z" },
          projector: { id: "prj_1", physical_status: "BORROWED" },
        },
        meta: { request_id: "req_p" },
      });

    render(<StaffQrScanView />);

    await user.type(screen.getByLabelText(/Token QR/i), "opaque_pickup_1");
    await user.click(screen.getByRole("button", { name: "Validasi Token QR" }));

    expect(await screen.findByText(/BKG-001 — Epson EB-X500/i)).toBeInTheDocument();
    expect(confirmPickupMock).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText(/Penerima Unit/i), "REPRESENTATIVE");
    await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));
    expect(
      screen.getByText("Nama perwakilan wajib diisi jika bukan diambil komting.")
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Nama Perwakilan Penerima/i), "Andi Wakil");
    await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));
    await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

    expect(await screen.findByText(/Gagal Mengirim Konfirmasi/i)).toBeInTheDocument();
    const firstKey = confirmPickupMock.mock.calls[0]?.[2] as string;

    // Retry identical payload reuses same Idempotency-Key
    await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

    await waitFor(() => {
      expect(confirmPickupMock).toHaveBeenCalledTimes(2);
    });
    expect(confirmPickupMock.mock.calls[1]?.[2]).toBe(firstKey);
    expect(await screen.findByText("Serah-Terima Unit Berhasil")).toBeInTheDocument();
  });

  it("resolves active loan from /staff/loans?status=ACTIVE when validating RETURN QR", async () => {
    const user = userEvent.setup();
    validateQrMock.mockResolvedValueOnce({
      data: {
        valid: true,
        action: "RETURN",
        transaction: {
          booking_id: "bkg_1",
          booking_code: "BKG-001",
          komting_name: "Budi",
          class_name: "IF-01",
          projector_name: "Epson EB-X500",
          status: "ACTIVE",
        },
        requires_confirmation: true,
      },
      meta: { request_id: "req_r" },
    });

    listStaffLoansMock.mockResolvedValueOnce({
      data: [
        {
          id: "loan_active_1",
          booking_id: "bkg_1",
          projector_id: "prj_1",
          komting_id: "u1",
          status: "ACTIVE",
          picked_up_at: "2026-11-26T02:00:00Z",
          returned_at: null,
          return_condition: null,
        },
      ],
      meta: {
        request_id: "req_l",
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });

    render(<StaffQrScanView />);

    await user.click(screen.getByRole("button", { name: "RETURN (Pengembalian)" }));
    await user.type(screen.getByLabelText(/Token QR/i), "opaque_return_1");
    await user.click(screen.getByRole("button", { name: "Validasi Token QR" }));

    expect(
      await screen.findByText(/Form Inspeksi Pengembalian — Epson EB-X500/i)
    ).toBeInTheDocument();
    expect(listStaffLoansMock).toHaveBeenCalledWith({
      status: "ACTIVE",
      page: 1,
      page_size: 20,
    });
  });

  it("handles camera permission denied (NotAllowedError) and shows informative fallback message", async () => {
    const user = userEvent.setup();
    const notAllowedError = new DOMException("Permission denied", "NotAllowedError");

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(notAllowedError),
      },
    });

    render(<StaffQrScanView />);

    await user.click(screen.getByRole("button", { name: "Aktifkan Kamera QR" }));

    expect(
      await screen.findByText(
        /Izin kamera ditolak oleh pengguna atau browser. Berikan izin akses kamera/i
      )
    ).toBeInTheDocument();

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it("handles camera device not found (NotFoundError) and suggests manual fallback", async () => {
    const user = userEvent.setup();
    const notFoundError = new DOMException("Requested device not found", "NotFoundError");

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(notFoundError),
      },
    });

    render(<StaffQrScanView />);

    await user.click(screen.getByRole("button", { name: "Aktifkan Kamera QR" }));

    expect(
      await screen.findByText(/Perangkat kamera tidak ditemukan pada perangkat ini/i)
    ).toBeInTheDocument();

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it("handles NotReadableError and OverconstrainedError gracefully", async () => {
    const user = userEvent.setup();
    const originalMediaDevices = navigator.mediaDevices;

    // Test NotReadableError
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("Hardware in use", "NotReadableError")),
      },
    });

    const { unmount } = render(<StaffQrScanView />);
    await user.click(screen.getByRole("button", { name: "Aktifkan Kamera QR" }));
    expect(
      await screen.findByText(/Kamera sedang digunakan oleh aplikasi lain atau tidak dapat diakses/i)
    ).toBeInTheDocument();
    unmount();

    // Test OverconstrainedError
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("Overconstrained", "OverconstrainedError")),
      },
    });

    render(<StaffQrScanView />);
    await user.click(screen.getByRole("button", { name: "Aktifkan Kamera QR" }));
    expect(
      await screen.findByText(/Kamera tidak memenuhi persyaratan yang diminta/i)
    ).toBeInTheDocument();

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it("handles missing BarcodeDetector by stopping stream and notifying user while preserving manual input", async () => {
    const user = userEvent.setup();
    const stopMock = vi.fn();
    const fakeStream = {
      getTracks: () => [{ stop: stopMock }],
    };

    const originalMediaDevices = navigator.mediaDevices;
    const originalBarcodeDetector = (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      },
    });

    render(<StaffQrScanView />);
    await user.click(screen.getByRole("button", { name: "Aktifkan Kamera QR" }));

    expect(
      await screen.findByText(/Kamera aktif, tetapi browser belum mendukung pemindaian QR otomatis/i)
    ).toBeInTheDocument();
    expect(stopMock).toHaveBeenCalled();
    expect(screen.getByLabelText(/Token QR/i)).toBeInTheDocument();

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
    if (originalBarcodeDetector) {
      (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = originalBarcodeDetector;
    }
  });

  it("stops camera tracks when action changes or when component unmounts", async () => {
    const user = userEvent.setup();
    const stopMock = vi.fn();
    const fakeStream = {
      getTracks: () => [{ stop: stopMock }],
    };

    class FakeBarcodeDetector {
      detect = vi.fn().mockResolvedValue([]);
    }
    (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = FakeBarcodeDetector;

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      },
    });

    const { unmount } = render(<StaffQrScanView />);
    await user.click(screen.getByRole("button", { name: "Aktifkan Kamera QR" }));

    expect(await screen.findByRole("button", { name: "Matikan Kamera" })).toBeInTheDocument();

    // Switching action stops camera
    await user.click(screen.getByRole("button", { name: "RETURN (Pengembalian)" }));
    expect(stopMock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Aktifkan Kamera QR" })).toBeInTheDocument();

    unmount();

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });

  it("renders server QR verification summary card and links to booking detail without mutating state", async () => {
    const user = userEvent.setup();
    validateQrMock.mockResolvedValueOnce({
      data: {
        valid: true,
        action: "PICKUP",
        transaction: {
          booking_id: "bkg_verified_123",
          booking_code: "BKG-20261127-V01",
          komting_name: "Rizky Ramadhan",
          class_name: "TI-3A",
          projector_name: "BenQ MS560",
          status: "CONFIRMED",
        },
        requires_confirmation: true,
      },
      meta: { request_id: "req_ver_card" },
    });

    render(<StaffQrScanView />);

    await user.type(screen.getByLabelText(/Token QR/i), "opaque_token_card_test");
    await user.click(screen.getByRole("button", { name: "Validasi Token QR" }));

    expect(await screen.findByText("Hasil Verifikasi QR dari Server")).toBeInTheDocument();
    expect(screen.getByText("BKG-20261127-V01")).toBeInTheDocument();
    expect(screen.getByText("Rizky Ramadhan (TI-3A)")).toBeInTheDocument();
    expect(screen.getAllByText("BenQ MS560").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Scan QR ini hanya melakukan verifikasi di server dan/i)
    ).toBeInTheDocument();

    const detailLink = screen.getByRole("link", { name: /Buka Detail Booking/i });
    expect(detailLink).toHaveAttribute("href", "/staff/bookings/bkg_verified_123");
  });

  it("renders camera video preview cleanly in single mode and stops tracks when turned off", async () => {
    const user = userEvent.setup();
    const stopMock = vi.fn();
    const fakeStream = {
      getTracks: () => [{ stop: stopMock }],
    };

    class FakeBarcodeDetector {
      detect = vi.fn().mockResolvedValue([]);
    }
    (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = FakeBarcodeDetector;

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      },
    });

    render(<StaffQrScanView />);
    await user.click(screen.getByRole("button", { name: "Aktifkan Kamera QR" }));

    const videoElement = await screen.findByTestId("qr-video-preview");
    expect(videoElement).toBeInTheDocument();

    // Verify single mode: no toggle button and no mode badge
    expect(screen.queryByTestId("toggle-preview-orientation-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("camera-orientation-badge")).not.toBeInTheDocument();

    // Turning camera off stops track and removes video element
    await user.click(screen.getByRole("button", { name: "Matikan Kamera" }));
    expect(stopMock).toHaveBeenCalled();
    expect(screen.queryByTestId("qr-video-preview")).not.toBeInTheDocument();

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });

  it("detects QR code in single mode and submits token to validation endpoint", async () => {
    const user = userEvent.setup();
    const stopMock = vi.fn();
    const fakeStream = {
      getTracks: () => [{ stop: stopMock }],
    };

    validateQrMock.mockResolvedValueOnce({
      data: {
        valid: true,
        action: "PICKUP",
        transaction: {
          booking_id: "bkg_syn_1",
          booking_code: "BKG-SYN-001",
          komting_name: "Test User",
          class_name: "IF-01",
          projector_name: "Projector Test",
          status: "CONFIRMED",
        },
        requires_confirmation: true,
      },
      meta: { request_id: "req_syn" },
    });

    class FakeBarcodeDetector {
      detect = vi.fn().mockImplementation(async () => {
        return [{ rawValue: "synthetic_qr_token_123" }];
      });
    }
    (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = FakeBarcodeDetector;

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      },
    });

    const originalReadyState = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState");
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      configurable: true,
      get: () => 4,
    });

    render(<StaffQrScanView />);
    await user.click(screen.getByRole("button", { name: "Aktifkan Kamera QR" }));

    const videoElement = await screen.findByTestId("qr-video-preview");
    expect(videoElement).toBeInTheDocument();

    // Wait for detector scan interval to detect and trigger validation
    await waitFor(
      () => {
        expect(validateQrMock).toHaveBeenCalledWith({
          qr_payload: "synthetic_qr_token_123",
          action: "PICKUP",
        });
      },
      { timeout: 2000 }
    );

    // Stream stops automatically after successful scan
    expect(stopMock).toHaveBeenCalled();

    if (originalReadyState) {
      Object.defineProperty(HTMLMediaElement.prototype, "readyState", originalReadyState);
    }
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });
});
