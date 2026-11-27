import { type RenderedEmail, TemplateError } from "@/lib/email/types";

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function baseLayout(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { background: #1e40af; color: #ffffff; padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }
    .body { padding: 24px; line-height: 1.6; font-size: 14px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .info-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .info-table td.label { font-weight: 600; color: #64748b; width: 35%; }
    .info-table td.value { color: #0f172a; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-info { background: #e0f2fe; color: #0369a1; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .footer { background: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>PINJAM &bull; Sistem Peminjaman Proyektor</h1>
    </div>
    <div class="body">
      ${contentHtml}
    </div>
    <div class="footer">
      Email ini dikirimkan secara otomatis oleh sistem PINJAM. Mohon tidak membalas email ini.
    </div>
  </div>
</body>
</html>`;
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TemplateError("Invalid payload: payload must be a non-null object.");
  }
  return payload as Record<string, unknown>;
}

export function renderEmail(eventType: string, rawPayload: unknown): RenderedEmail {
  const payload = parsePayload(rawPayload);

  switch (eventType) {
    case "BOOKING_CONFIRMED": {
      const bookingCode = String(payload.booking_code || "");
      if (!bookingCode) throw new TemplateError("Missing required field: booking_code");

      const subject = String(payload.subject || `Konfirmasi Booking Proyektor ${bookingCode}`);
      const projectorName = escapeHtml(payload.projector_name || "Proyektor");
      const bookingDate = escapeHtml(payload.booking_date || "-");
      const startTime = escapeHtml(payload.start_time || "-");
      const windowStart = escapeHtml(payload.pickup_window_start_at || "-");
      const windowEnd = escapeHtml(payload.pickup_window_end_at || "-");

      const html = baseLayout(
        subject,
        `<h2>Booking Berhasil Dikonfirmasi</h2>
        <p>Halo Komting, booking proyektor Anda telah tercatat dengan rincian berikut:</p>
        <table class="info-table">
          <tr><td class="label">Kode Booking</td><td class="value"><strong>${escapeHtml(bookingCode)}</strong></td></tr>
          <tr><td class="label">Proyektor</td><td class="value">${projectorName}</td></tr>
          <tr><td class="label">Tanggal Booking</td><td class="value">${bookingDate}</td></tr>
          <tr><td class="label">Jam Mulai</td><td class="value">${startTime}</td></tr>
          <tr><td class="label">Jendela Pengambilan</td><td class="value">${windowStart} &ndash; ${windowEnd}</td></tr>
        </table>
        <p>Silakan tunjukkan QR token pada aplikasi kepada staf di ruang operasional saat jendela pengambilan dibuka.</p>`
      );

      const text = `${subject}

Halo Komting, booking proyektor Anda telah tercatat dengan rincian berikut:
- Kode Booking: ${bookingCode}
- Proyektor: ${payload.projector_name || "Proyektor"}
- Tanggal Booking: ${payload.booking_date || "-"}
- Jam Mulai: ${payload.start_time || "-"}
- Jendela Pengambilan: ${payload.pickup_window_start_at || "-"} s/d ${payload.pickup_window_end_at || "-"}

Silakan tunjukkan QR token pada aplikasi kepada staf saat pengambilan unit.`;

      return { subject, html, text };
    }

    case "BOOKING_CANCELLED": {
      const bookingCode = String(payload.booking_code || "");
      if (!bookingCode) throw new TemplateError("Missing required field: booking_code");

      const subject = String(payload.subject || `Pembatalan Booking ${bookingCode}`);
      const reason = escapeHtml(payload.cancel_reason || "Dibatalkan.");
      const cancelledAt = escapeHtml(payload.cancelled_at || "-");

      const html = baseLayout(
        subject,
        `<h2>Booking Telah Dibatalkan</h2>
        <p>Booking proyektor dengan kode <strong>${escapeHtml(bookingCode)}</strong> telah dibatalkan.</p>
        <table class="info-table">
          <tr><td class="label">Kode Booking</td><td class="value"><strong>${escapeHtml(bookingCode)}</strong></td></tr>
          <tr><td class="label">Waktu Pembatalan</td><td class="value">${cancelledAt}</td></tr>
          <tr><td class="label">Alasan</td><td class="value">${reason}</td></tr>
        </table>`
      );

      const text = `${subject}

Booking proyektor dengan kode ${bookingCode} telah dibatalkan.
- Waktu Pembatalan: ${payload.cancelled_at || "-"}
- Alasan: ${payload.cancel_reason || "Dibatalkan."}`;

      return { subject, html, text };
    }

    case "LOAN_STARTED": {
      const bookingCode = String(payload.booking_code || "");
      if (!bookingCode) throw new TemplateError("Missing required field: booking_code");

      const subject = String(payload.subject || `Peminjaman Proyektor Aktif — ${bookingCode}`);
      const projectorName = escapeHtml(payload.projector_name || "Proyektor");
      const borrowedAt = escapeHtml(payload.borrowed_at || "-");
      const estimatedReturn = escapeHtml(payload.estimated_return_at || "-");

      const html = baseLayout(
        subject,
        `<h2>Peminjaman Proyektor Aktif</h2>
        <p>Pengambilan unit proyektor telah dikonfirmasi oleh staf. Peminjaman kini berstatus <strong>AKTIF</strong>.</p>
        <table class="info-table">
          <tr><td class="label">Kode Booking</td><td class="value"><strong>${escapeHtml(bookingCode)}</strong></td></tr>
          <tr><td class="label">Unit Proyektor</td><td class="value">${projectorName}</td></tr>
          <tr><td class="label">Waktu Pengambilan</td><td class="value">${borrowedAt}</td></tr>
          <tr><td class="label">Batas Pengembalian</td><td class="value"><span class="badge badge-warning">${estimatedReturn}</span></td></tr>
        </table>
        <p>Harap kembalikan proyektor beserta seluruh kelengkapannya sebelum batas pengembalian berakhir.</p>`
      );

      const text = `${subject}

Pengambilan unit proyektor telah dikonfirmasi oleh staf. Peminjaman kini berstatus AKTIF.
- Kode Booking: ${bookingCode}
- Unit Proyektor: ${payload.projector_name || "Proyektor"}
- Waktu Pengambilan: ${payload.borrowed_at || "-"}
- Batas Pengembalian: ${payload.estimated_return_at || "-"}

Harap kembalikan unit proyektor tepat waktu beserta kelengkapannya.`;

      return { subject, html, text };
    }

    case "LOAN_RETURNED": {
      const bookingCode = String(payload.booking_code || "");
      if (!bookingCode) throw new TemplateError("Missing required field: booking_code");

      const subject = String(payload.subject || `Pengembalian Proyektor Berhasil — ${bookingCode}`);
      const projectorName = escapeHtml(payload.projector_name || "Proyektor");
      const returnedAt = escapeHtml(payload.returned_at || "-");
      const disposition = escapeHtml(payload.unit_disposition || "AVAILABLE");
      const isOverdue = Boolean(payload.is_overdue);
      const overdueMinutes = Number(payload.overdue_minutes || 0);

      const statusBadge = isOverdue
        ? `<span class="badge badge-danger">Terlambat (${overdueMinutes} menit)</span>`
        : `<span class="badge badge-success">Tepat Waktu</span>`;

      const html = baseLayout(
        subject,
        `<h2>Pengembalian Proyektor Berhasil</h2>
        <p>Proyektor untuk peminjaman <strong>${escapeHtml(bookingCode)}</strong> telah diterima dan diinspeksi oleh staf.</p>
        <table class="info-table">
          <tr><td class="label">Kode Booking</td><td class="value"><strong>${escapeHtml(bookingCode)}</strong></td></tr>
          <tr><td class="label">Unit Proyektor</td><td class="value">${projectorName}</td></tr>
          <tr><td class="label">Waktu Pengembalian</td><td class="value">${returnedAt}</td></tr>
          <tr><td class="label">Ketepatan Waktu</td><td class="value">${statusBadge}</td></tr>
          <tr><td class="label">Disposisi Unit</td><td class="value">${disposition}</td></tr>
        </table>
        <p>Terima kasih telah menggunakan layanan PINJAM dan menjaga fasilitas kampus.</p>`
      );

      const text = `${subject}

Proyektor untuk peminjaman ${bookingCode} telah diterima dan diinspeksi oleh staf.
- Unit Proyektor: ${payload.projector_name || "Proyektor"}
- Waktu Pengembalian: ${payload.returned_at || "-"}
- Ketepatan Waktu: ${isOverdue ? `Terlambat (${overdueMinutes} menit)` : "Tepat Waktu"}
- Disposisi Unit: ${payload.unit_disposition || "AVAILABLE"}

Terima kasih telah menggunakan layanan PINJAM.`;

      return { subject, html, text };
    }

    case "KOMTING_APPLICATION_APPROVED": {
      const className = escapeHtml(payload.class_name || "Kelas");
      const subject = "Pengajuan Komting Disetujui — PINJAM";

      const html = baseLayout(
        subject,
        `<h2>Selamat! Pengajuan Komting Disetujui</h2>
        <p>Pengajuan Anda sebagai Komting untuk kelas <strong>${className}</strong> telah disetujui oleh Administrator.</p>
        <p>Akun Anda kini telah memiliki akses penuh untuk memesan proyektor untuk kegiatan perkuliahan.</p>`
      );

      const text = `${subject}

Selamat! Pengajuan Anda sebagai Komting untuk kelas ${payload.class_name || "Kelas"} telah disetujui oleh Administrator.
Akun Anda kini memiliki akses untuk memesan proyektor di PINJAM.`;

      return { subject, html, text };
    }

    case "KOMTING_APPLICATION_REJECTED": {
      const className = escapeHtml(payload.class_name || "Kelas");
      const reason = escapeHtml(payload.rejection_reason || "Dokumen belum memenuhi syarat.");
      const subject = "Pemberitahuan Pengajuan Komting — PINJAM";

      const html = baseLayout(
        subject,
        `<h2>Pengajuan Komting Belum Disetujui</h2>
        <p>Pengajuan Anda sebagai Komting untuk kelas <strong>${className}</strong> belum dapat disetujui.</p>
        <p><strong>Alasan:</strong> ${reason}</p>
        <p>Silakan hubungi administrator atau perbaiki data pengajuan Anda.</p>`
      );

      const text = `${subject}

Pengajuan Anda sebagai Komting untuk kelas ${payload.class_name || "Kelas"} belum dapat disetujui.
Alasan: ${payload.rejection_reason || "Dokumen belum memenuhi syarat."}`;

      return { subject, html, text };
    }

    case "KOMTING_REPLACEMENT_NOTICE_OLD": {
      const className = escapeHtml(payload.class_name || "Kelas");
      const subject = `Pemberitahuan Pergantian Komting — Kelas ${className}`;

      const html = baseLayout(
        subject,
        `<h2>Pemberitahuan Pergantian Komting</h2>
        <p>Administrator telah memproses pergantian penugasan Komting untuk kelas <strong>${className}</strong>.</p>
        <p>Penugasan Komting Anda pada kelas ini telah dinonaktifkan. Terima kasih atas dedikasi Anda selama masa tugas.</p>`
      );

      const text = `${subject}

Administrator telah memproses pergantian penugasan Komting untuk kelas ${payload.class_name || "Kelas"}.
Penugasan Komting Anda pada kelas ini telah dinonaktifkan. Terima kasih atas dedikasi Anda.`;

      return { subject, html, text };
    }

    case "KOMTING_REPLACEMENT_COMPLETED": {
      const className = escapeHtml(payload.class_name || "Kelas");
      const subject = `Pergantian Komting Selesai — Kelas ${className}`;

      const html = baseLayout(
        subject,
        `<h2>Pergantian Komting Berhasil</h2>
        <p>Penugasan Komting Anda untuk kelas <strong>${className}</strong> telah aktif.</p>
        <p>Anda kini dapat mengelola peminjaman proyektor untuk kelas ini.</p>`
      );

      const text = `${subject}

Penugasan Komting Anda untuk kelas ${payload.class_name || "Kelas"} telah aktif.
Anda kini dapat mengelola peminjaman proyektor untuk kelas ini.`;

      return { subject, html, text };
    }

    case "KOMTING_ASSIGNMENT_DEACTIVATED": {
      const className = escapeHtml(payload.class_name || "Kelas");
      const reason = escapeHtml(payload.deactivation_reason || "Penonaktifan oleh Administrator.");
      const subject = `Penonaktifan Penugasan Komting — Kelas ${className}`;

      const html = baseLayout(
        subject,
        `<h2>Penugasan Komting Dinonaktifkan</h2>
        <p>Penugasan Komting Anda untuk kelas <strong>${className}</strong> telah dinonaktifkan.</p>
        <p><strong>Alasan:</strong> ${reason}</p>`
      );

      const text = `${subject}

Penugasan Komting Anda untuk kelas ${payload.class_name || "Kelas"} telah dinonaktifkan.
Alasan: ${payload.deactivation_reason || "Penonaktifan oleh Administrator."}`;

      return { subject, html, text };
    }

    default:
      throw new TemplateError(`Unknown email event type: "${eventType}"`);
  }
}
