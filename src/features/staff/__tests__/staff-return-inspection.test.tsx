import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReturnInspectionForm } from "@/features/staff/return-inspection-form";
import type { Loan } from "@/types/domain";

const confirmReturnMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    loan: {
      confirmReturn: (...args: unknown[]) => confirmReturnMock(...args),
    },
  },
}));

const ACTIVE_LOAN: Loan = {
  id: "loan_active_1",
  booking_id: "bkg_1",
  projector_id: "prj_1",
  komting_id: "u1",
  status: "ACTIVE",
  picked_up_at: "2026-11-26T02:00:00Z",
  returned_at: null,
  return_condition: null,
};

describe("ReturnInspectionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows normal complete return without evidence photo and shows AVAILABLE disposition", async () => {
    const user = userEvent.setup();
    confirmReturnMock.mockResolvedValueOnce({
      data: {
        loan: { id: "loan_active_1", status: "RETURNED", returned_at: "2026-11-26T05:00:00Z" },
        inspection: {
          projector_condition: "NORMAL",
          accessories_condition: "COMPLETE",
          unit_disposition: "AVAILABLE",
        },
        projector: { id: "prj_1", physical_status: "AVAILABLE" },
      },
      meta: { request_id: "req_1" },
    });

    render(<ReturnInspectionForm loan={ACTIVE_LOAN} initialQrPayload="qr_ret_1" />);

    await user.click(screen.getByRole("button", { name: "Konfirmasi Pengembalian" }));
    await user.click(screen.getByRole("button", { name: "Ya, Selesaikan Return" }));

    await waitFor(() => {
      expect(confirmReturnMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Inspeksi & Return Dikonfirmasi")).toBeInTheDocument();
    expect(screen.getByText("Tersedia")).toBeInTheDocument();
  });

  it("requires evidence photo when DAMAGED or INCOMPLETE and uploads FormData", async () => {
    const user = userEvent.setup();
    confirmReturnMock.mockResolvedValueOnce({
      data: {
        loan: { id: "loan_active_1", status: "RETURNED", returned_at: "2026-11-26T05:00:00Z" },
        inspection: {
          projector_condition: "DAMAGED",
          accessories_condition: "INCOMPLETE",
          unit_disposition: "MAINTENANCE",
        },
        projector: { id: "prj_1", physical_status: "MAINTENANCE" },
      },
      meta: { request_id: "req_2" },
    });

    render(<ReturnInspectionForm loan={ACTIVE_LOAN} initialQrPayload="qr_ret_2" />);

    await user.selectOptions(screen.getByLabelText(/Kondisi Proyektor/i), "DAMAGED");
    await user.selectOptions(screen.getByLabelText(/Kelengkapan Aksesori/i), "INCOMPLETE");

    expect(screen.getByText("Foto Bukti Wajib Diunggah")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Konfirmasi Pengembalian" }));
    expect(
      screen.getByText(/Foto bukti wajib diunggah karena proyektor rusak/i)
    ).toBeInTheDocument();
    expect(confirmReturnMock).not.toHaveBeenCalled();

    const fileInput = screen.getByLabelText(/Foto Bukti Kondisi/i);
    const evidenceFile = new File(["photo"], "damage.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [evidenceFile] } });

    expect(screen.getByAltText("Pratinjau foto bukti pengembalian")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/Catatan Pemeriksaan/i),
      "Lensa retak dan kabel HDMI hilang"
    );
    await user.click(screen.getByRole("button", { name: "Konfirmasi Pengembalian" }));
    await user.click(screen.getByRole("button", { name: "Ya, Selesaikan Return" }));

    await waitFor(() => {
      expect(confirmReturnMock).toHaveBeenCalledTimes(1);
    });

    const submittedFormData = confirmReturnMock.mock.calls[0]?.[1] as FormData;
    expect(submittedFormData.get("projector_condition")).toBe("DAMAGED");
    expect(submittedFormData.get("accessories_condition")).toBe("INCOMPLETE");
    expect(submittedFormData.get("evidence_photo")).toBe(evidenceFile);

    expect(await screen.findByText("Unit Masuk Maintenance")).toBeInTheDocument();
  });
});
