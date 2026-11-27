import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { RegisterApplicationForm } from "@/features/komting/register-application-form";

const submitApplicationMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    application: {
      submitApplication: (...args: unknown[]) => submitApplicationMock(...args),
    },
  },
}));

describe("RegisterApplicationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation errors when required fields and photo are missing", async () => {
    const user = userEvent.setup();
    render(<RegisterApplicationForm />);

    await user.click(screen.getByRole("button", { name: "Kirim Pengajuan Komting" }));

    expect(screen.getByText("Nama lengkap wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("Nomor identitas mahasiswa (NIM) wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("Nama kelas wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("Email wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("Foto identitas wajib diunggah.")).toBeInTheDocument();
    expect(submitApplicationMock).not.toHaveBeenCalled();
  });

  it("rejects non-image identity files", () => {
    render(<RegisterApplicationForm />);

    const fileInput = screen.getByLabelText(/Foto Identitas \(KTM/i);
    const badFile = new File(["hello"], "document.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [badFile] } });

    expect(screen.getByText("Format foto harus JPG, PNG, atau WebP.")).toBeInTheDocument();
  });

  it("previews valid photo, submits FormData, and renders replacement notice", async () => {
    const user = userEvent.setup();
    submitApplicationMock.mockResolvedValueOnce({
      data: {
        application_id: "app_123",
        status: "PENDING_REPLACEMENT_NOTICE",
        submitted_at: "2026-11-26T07:00:00Z",
      },
      meta: { request_id: "req_1" },
    });

    render(<RegisterApplicationForm />);

    await user.type(screen.getByLabelText(/Nama Lengkap/i), "Siti Rahma");
    await user.type(screen.getByLabelText(/Nomor Identitas Mahasiswa/i), "240101009");
    await user.type(screen.getByLabelText(/^Kelas/i), "IF-01");
    await user.type(screen.getByLabelText(/Email Aktif/i), "siti@kampus.ac.id");

    const fileInput = screen.getByLabelText(/Foto Identitas \(KTM/i);
    const validImage = new File(["img-bytes"], "ktm.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [validImage] } });

    expect(screen.getByAltText("Pratinjau foto identitas pendaftar")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Kirim Pengajuan Komting" }));

    await waitFor(() => {
      expect(submitApplicationMock).toHaveBeenCalledTimes(1);
    });

    const submittedFormData = submitApplicationMock.mock.calls[0]?.[0] as FormData;
    expect(submittedFormData).toBeInstanceOf(FormData);
    expect(submittedFormData.get("full_name")).toBe("Siti Rahma");
    expect(submittedFormData.get("student_id")).toBe("240101009");
    expect(submittedFormData.get("class_name")).toBe("IF-01");
    expect(submittedFormData.get("email")).toBe("siti@kampus.ac.id");
    expect(submittedFormData.get("identity_photo")).toBe(validImage);

    expect(await screen.findByText("Pengajuan Komting Diterima")).toBeInTheDocument();
    expect(screen.getByText(/Terdeteksi Sebagai Pengajuan Pergantian/i)).toBeInTheDocument();
  });

  it("prevents double-submit when submission is in flight", async () => {
    const user = userEvent.setup();
    let resolveSubmit: ((value: unknown) => void) | undefined;
    submitApplicationMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      })
    );

    render(<RegisterApplicationForm />);

    await user.type(screen.getByLabelText(/Nama Lengkap/i), "Ahmad");
    await user.type(screen.getByLabelText(/Nomor Identitas Mahasiswa/i), "240101010");
    await user.type(screen.getByLabelText(/^Kelas/i), "IF-03");
    await user.type(screen.getByLabelText(/Email Aktif/i), "ahmad@kampus.ac.id");

    const fileInput = screen.getByLabelText(/Foto Identitas \(KTM/i);
    const validImage = new File(["bytes"], "ktm.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [validImage] } });

    await user.click(screen.getByRole("checkbox"));

    const submitBtn = screen.getByRole("button", { name: "Kirim Pengajuan Komting" });
    await user.click(submitBtn);
    await user.click(submitBtn);

    expect(submitApplicationMock).toHaveBeenCalledTimes(1);

    resolveSubmit?.({
      data: {
        application_id: "app_999",
        status: "PENDING_VERIFICATION",
        submitted_at: "2026-11-27T08:00:00Z",
      },
      meta: { request_id: "req_ok" },
    });

    expect(await screen.findByText("Pengajuan Komting Diterima")).toBeInTheDocument();
  });

  it("displays server error message when API rejects submission with conflict", async () => {
    const user = userEvent.setup();
    submitApplicationMock.mockRejectedValueOnce(
      new ApiClientError({
        status: 409,
        code: "CLASS_ALREADY_HAS_ACTIVE_KOMTING",
        message: "Kelas sudah memiliki komting aktif.",
      })
    );

    render(<RegisterApplicationForm />);

    await user.type(screen.getByLabelText(/Nama Lengkap/i), "Budi");
    await user.type(screen.getByLabelText(/Nomor Identitas Mahasiswa/i), "240101011");
    await user.type(screen.getByLabelText(/^Kelas/i), "IF-01");
    await user.type(screen.getByLabelText(/Email Aktif/i), "budi@kampus.ac.id");

    const fileInput = screen.getByLabelText(/Foto Identitas \(KTM/i);
    const validImage = new File(["bytes"], "ktm.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [validImage] } });

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Kirim Pengajuan Komting" }));

    expect(await screen.findByText(/Kelas.*sudah memiliki komting aktif/i)).toBeInTheDocument();
  });
});
