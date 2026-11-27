import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccessTokenProvider } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";
import { apiServices } from "@/services/api/api-services";
import type { CreateBookingPayload } from "@/services/contracts";
import type {
  AvailabilityResult,
  Booking,
  OperatingHoursSnapshot,
  Projector,
} from "@/types/domain";

describe("Real API Service Integration (Contract-Compliant)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    setAccessTokenProvider(() => "test_bearer_token_xyz");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    setAccessTokenProvider(null);
    vi.restoreAllMocks();
  });

  describe("Projector Inventory (GET /api/v1/projectors & detail)", () => {
    it("lists projectors with physical status filter, pagination query, and Bearer token", async () => {
      const mockProjectors: Projector[] = [
        {
          id: "prj_001",
          asset_code: "PRJ-001",
          name: "Epson EB-X500",
          brand: "Epson",
          model: "EB-X500",
          physical_status: "AVAILABLE",
          is_active: true,
        },
        {
          id: "prj_002",
          asset_code: "PRJ-002",
          name: "BenQ MS560",
          brand: "BenQ",
          model: "MS560",
          physical_status: "BORROWED",
          is_active: true,
        },
      ];

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: mockProjectors,
            meta: {
              request_id: "req_proj_list",
              pagination: {
                page: 1,
                page_size: 20,
                total_items: 2,
                total_pages: 1,
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      const result = await apiServices.projector.listProjectors({
        physical_status: "AVAILABLE",
        page: 1,
        page_size: 20,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toContain("/api/v1/projectors");
      expect(url).toContain("physical_status=AVAILABLE");
      expect(url).toContain("page=1");
      expect(url).toContain("page_size=20");

      const headers = new Headers(options.headers);
      expect(headers.get("Accept")).toBe("application/json");
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");

      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.name).toBe("Epson EB-X500");
      expect(result.meta.pagination.total_items).toBe(2);
    });

    it("gets projector by ID with URL encoding and handles 404 PROJECTOR_NOT_FOUND", async () => {
      // 1. Success case with special characters
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "prj/special#1",
              asset_code: "PRJ-SPEC",
              name: "Special Unit",
              brand: null,
              model: null,
              physical_status: "MAINTENANCE",
              is_active: true,
            },
            meta: { request_id: "req_spec" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const successResult = await apiServices.projector.getProjector("prj/special#1");
      expect(successResult.data.id).toBe("prj/special#1");

      const [firstUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(firstUrl).toContain("/api/v1/projectors/prj%2Fspecial%231");

      // 2. 404 Not Found error
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "PROJECTOR_NOT_FOUND",
              message: "Proyektor dengan ID non_existent tidak ditemukan.",
            },
            meta: { request_id: "req_not_found" },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.projector.getProjector("non_existent");
        expect.unreachable("Should have thrown 404 ApiClientError");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.code).toBe("PROJECTOR_NOT_FOUND");
        expect(apiErr.message).toContain("tidak ditemukan");
      }
    });

    it("creates, updates, and deactivates projectors through ADMIN endpoints", async () => {
      // Create
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "prj_new",
              asset_code: "PRJ-999",
              name: "Panasonic PT-VX430",
              brand: "Panasonic",
              model: "PT-VX430",
              physical_status: "AVAILABLE",
              is_active: true,
            },
            meta: { request_id: "req_cr" },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      );

      const created = await apiServices.projector.createProjector({
        asset_code: "PRJ-999",
        name: "Panasonic PT-VX430",
        brand: "Panasonic",
        model: "PT-VX430",
      });

      expect(created.data.id).toBe("prj_new");
      const [createUrl, createOpts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(createUrl).toContain("/api/v1/admin/projectors");
      expect(createOpts.method).toBe("POST");
      expect(JSON.parse(createOpts.body as string)).toEqual({
        asset_code: "PRJ-999",
        name: "Panasonic PT-VX430",
        brand: "Panasonic",
        model: "PT-VX430",
      });

      // Update
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { ...created.data, name: "Panasonic PT-VX430 Updated" },
            meta: { request_id: "req_up" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      await apiServices.projector.updateProjector("prj_new", {
        name: "Panasonic PT-VX430 Updated",
      });
      const [updateUrl, updateOpts] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(updateUrl).toContain("/api/v1/admin/projectors/prj_new");
      expect(updateOpts.method).toBe("PATCH");

      // Deactivate
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { ...created.data, is_active: false, physical_status: "INACTIVE" },
            meta: { request_id: "req_deact" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      await apiServices.projector.deactivateProjector("prj_new");
      const [deactUrl, deactOpts] = fetchSpy.mock.calls[2] as [string, RequestInit];
      expect(deactUrl).toContain("/api/v1/admin/projectors/prj_new/deactivate");
      expect(deactOpts.method).toBe("POST");
    });
  });

  describe("Operating Hours (GET /api/v1/operating-hours & PUT /api/v1/admin/operating-hours)", () => {
    it("fetches operating hours snapshot for a given date in Asia/Jakarta timezone", async () => {
      const mockHours: OperatingHoursSnapshot = {
        service_date: "2026-11-27",
        timezone: "Asia/Jakarta",
        opens_at: "08:00:00",
        closes_at: "17:00:00",
        early_pickup_allowed_at: "07:45:00",
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: mockHours,
            meta: { request_id: "req_hours" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const res = await apiServices.operatingHours.getOperatingHours("2026-11-27");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/operating-hours");
      expect(url).toContain("date=2026-11-27");

      expect(res.data.opens_at).toBe("08:00:00");
      expect(res.data.closes_at).toBe("17:00:00");
      expect(res.data.early_pickup_allowed_at).toBe("07:45:00");
    });

    it("updates operating hours and handles 409 OPERATING_HOURS_CONFLICT with affected bookings", async () => {
      // 1. Success update
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              opens_at: "07:30:00",
              closes_at: "16:30:00",
              early_pickup_allowed_at: "07:15:00",
            },
            meta: { request_id: "req_update_hours" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const updated = await apiServices.operatingHours.updateOperatingHours("2026-11-27", {
        opens_at: "07:30:00",
        closes_at: "16:30:00",
        admin_early_open_at: "07:30:00",
        note: "Penyesuaian jam kuliah Jumat",
      });

      expect(updated.data.closes_at).toBe("16:30:00");
      const [putUrl, putOpts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(putUrl).toContain("/api/v1/admin/operating-hours/2026-11-27");
      expect(putOpts.method).toBe("PUT");
      expect(JSON.parse(putOpts.body as string)).toEqual({
        opens_at: "07:30:00",
        closes_at: "16:30:00",
        admin_early_open_at: "07:30:00",
        note: "Penyesuaian jam kuliah Jumat",
      });

      // 2. 409 Conflict with affected active bookings
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "OPERATING_HOURS_CONFLICT",
              message: "Perubahan jam operasional bertabrakan dengan booking aktif.",
              details: [
                {
                  field: "BKG-20261127-001",
                  reason: "Jadwal 16:00–17:30 WIB melampaui jam tutup baru 16:30 WIB.",
                },
              ],
            },
            meta: { request_id: "req_conflict" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.operatingHours.updateOperatingHours("2026-11-27", {
          opens_at: "08:00:00",
          closes_at: "16:30:00",
          admin_early_open_at: null,
          note: null,
        });
        expect.unreachable("Should have thrown 409 ApiClientError");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("OPERATING_HOURS_CONFLICT");
        expect(apiErr.details).toHaveLength(1);
        expect(apiErr.details?.[0]?.field).toBe("BKG-20261127-001");
      }
    });
  });

  describe("Projector Availability (GET /api/v1/availability)", () => {
    it("checks availability with date and optional time parameters", async () => {
      const mockResult: AvailabilityResult = {
        projector_id: "prj_001",
        date: "2026-11-27",
        is_bookable: true,
        physical_status: "AVAILABLE",
        operating_hours: {
          opens_at: "08:00:00",
          closes_at: "17:00:00",
          early_pickup_allowed_at: "07:45:00",
        },
        message: null,
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: mockResult,
            meta: { request_id: "req_avail" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const res = await apiServices.availability.checkAvailability({
        projector_id: "prj_001",
        date: "2026-11-27",
        start_time: "09:00:00",
        estimated_return_at: "2026-11-27T04:00:00.000Z",
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/availability");
      expect(url).toContain("projector_id=prj_001");
      expect(url).toContain("date=2026-11-27");
      expect(url).toContain("start_time=09%3A00%3A00");
      expect(url).toContain("estimated_return_at=2026-11-27T04%3A00%3A00.000Z");

      expect(res.data.is_bookable).toBe(true);
      expect(res.data.physical_status).toBe("AVAILABLE");
    });

    it("accurately differentiates physical status from booking availability", async () => {
      // Scenario A: Physically BORROWED today, but conditionally bookable tomorrow
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              projector_id: "prj_002",
              date: "2026-11-28",
              is_bookable: true,
              physical_status: "BORROWED",
              operating_hours: {
                opens_at: "08:00:00",
                closes_at: "17:00:00",
                early_pickup_allowed_at: "07:45:00",
              },
              message:
                "Unit sedang BORROWED hari ini. Booking besok bersifat bersyarat dan akan dibatalkan bila unit belum kembali.",
            },
            meta: { request_id: "req_borrowed_avail" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const borrowedResult = await apiServices.availability.checkAvailability({
        projector_id: "prj_002",
        date: "2026-11-28",
      });

      expect(borrowedResult.data.physical_status).toBe("BORROWED");
      expect(borrowedResult.data.is_bookable).toBe(true);
      expect(borrowedResult.data.message).toContain("bersyarat");

      // Scenario B: Physically AVAILABLE, but NOT bookable due to existing booking conflict
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              projector_id: "prj_001",
              date: "2026-11-27",
              is_bookable: false,
              physical_status: "AVAILABLE",
              operating_hours: {
                opens_at: "08:00:00",
                closes_at: "17:00:00",
                early_pickup_allowed_at: "07:45:00",
              },
              message: "Unit sudah memiliki booking aktif pada rentang waktu yang dipilih.",
            },
            meta: { request_id: "req_slot_conflict" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const conflictResult = await apiServices.availability.checkAvailability({
        projector_id: "prj_001",
        date: "2026-11-27",
      });

      expect(conflictResult.data.physical_status).toBe("AVAILABLE");
      expect(conflictResult.data.is_bookable).toBe(false);
      expect(conflictResult.data.message).toContain("booking aktif");

      // Scenario C: Physically MAINTENANCE, NOT bookable under any condition
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              projector_id: "prj_003",
              date: "2026-11-27",
              is_bookable: false,
              physical_status: "MAINTENANCE",
              operating_hours: {
                opens_at: "08:00:00",
                closes_at: "17:00:00",
                early_pickup_allowed_at: "07:45:00",
              },
              message: "Unit dalam pemeliharaan.",
            },
            meta: { request_id: "req_maint" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const maintResult = await apiServices.availability.checkAvailability({
        projector_id: "prj_003",
        date: "2026-11-27",
      });

      expect(maintResult.data.physical_status).toBe("MAINTENANCE");
      expect(maintResult.data.is_bookable).toBe(false);
    });
  });

  describe("KOMTING Booking Lifecycle (POST /bookings, GET /komting/bookings, GET /komting/bookings/{id}, POST /cancel, GET /qr)", () => {
    it("creates booking with required payload fields, Bearer token, and Idempotency-Key", async () => {
      const mockCreatedBooking: Booking = {
        id: "bkg_new_001",
        booking_code: "BKG-20261127-001",
        komting_id: "user_komting_1",
        projector_id: "prj_001",
        booking_date: "2026-11-27",
        start_time: "09:00:00",
        estimated_return_at: "2026-11-27T04:00:00Z",
        status: "CONFIRMED",
        pickup_window: {
          opens_at: "2026-11-27T01:30:00Z",
          closes_at: "2026-11-27T02:15:00Z",
        },
        created_at: "2026-11-26T12:00:00Z",
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: mockCreatedBooking,
            meta: { request_id: "req_create_bkg" },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      );

      const payload: CreateBookingPayload = {
        projector_id: "prj_001",
        booking_date: "2026-11-27",
        start_time: "09:00:00",
        estimated_return_at: "2026-11-27T04:00:00Z",
      };
      const idempotencyKey = "idemp_test_key_abc123";

      const result = await apiServices.booking.createBooking(payload, idempotencyKey);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toContain("/api/v1/bookings");
      expect(options.method).toBe("POST");

      const headers = new Headers(options.headers);
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");
      expect(headers.get("Idempotency-Key")).toBe("idemp_test_key_abc123");
      expect(headers.get("Content-Type")).toBe("application/json");

      expect(JSON.parse(options.body as string)).toEqual({
        projector_id: "prj_001",
        booking_date: "2026-11-27",
        start_time: "09:00:00",
        estimated_return_at: "2026-11-27T04:00:00Z",
      });

      expect(result.data.id).toBe("bkg_new_001");
      expect(result.data.status).toBe("CONFIRMED");
      expect(result.data.pickup_window.opens_at).toBe("2026-11-27T01:30:00Z");
    });

    it("handles booking creation errors: 400 invalid time, 409 conflict, and 422 validation", async () => {
      // 1. 409 BOOKING_CONFLICT
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "BOOKING_CONFLICT",
              message: "Jadwal proyektor bertabrakan atau unit tidak tersedia.",
            },
            meta: { request_id: "req_conflict" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.booking.createBooking(
          {
            projector_id: "prj_001",
            booking_date: "2026-11-27",
            start_time: "09:00:00",
            estimated_return_at: "2026-11-27T04:00:00Z",
          },
          "key_1"
        );
        expect.unreachable("Should have failed with 409 BOOKING_CONFLICT");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("BOOKING_CONFLICT");
      }

      // 2. 409 ACTIVE_BOOKING_EXISTS
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "ACTIVE_BOOKING_EXISTS",
              message: "Anda masih memiliki booking aktif.",
            },
            meta: { request_id: "req_active" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.booking.createBooking(
          {
            projector_id: "prj_002",
            booking_date: "2026-11-27",
            start_time: "10:00:00",
            estimated_return_at: "2026-11-27T05:00:00Z",
          },
          "key_2"
        );
        expect.unreachable("Should have failed with 409 ACTIVE_BOOKING_EXISTS");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("ACTIVE_BOOKING_EXISTS");
      }

      // 3. 422 BOOKING_TIME_INVALID with details
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "BOOKING_TIME_INVALID",
              message: "Rentang waktu booking tidak valid.",
              details: [
                {
                  field: "estimated_return_at",
                  reason: "Estimasi kembali harus setelah waktu mulai.",
                },
              ],
            },
            meta: { request_id: "req_invalid_time" },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.booking.createBooking(
          {
            projector_id: "prj_001",
            booking_date: "2026-11-27",
            start_time: "14:00:00",
            estimated_return_at: "2026-11-27T02:00:00Z",
          },
          "key_3"
        );
        expect.unreachable("Should have failed with 422 BOOKING_TIME_INVALID");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.code).toBe("BOOKING_TIME_INVALID");
        expect(apiErr.getFieldErrors()).toEqual({
          estimated_return_at: "Estimasi kembali harus setelah waktu mulai.",
        });
      }
    });

    it("lists komting bookings with status filter and pagination query", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "bkg_001",
                booking_code: "BKG-20261127-001",
                komting_id: "user_1",
                projector_id: "prj_001",
                booking_date: "2026-11-27",
                start_time: "09:00:00",
                estimated_return_at: "2026-11-27T04:00:00Z",
                status: "CONFIRMED",
                pickup_window: {
                  opens_at: "2026-11-27T01:30:00Z",
                  closes_at: "2026-11-27T02:15:00Z",
                },
                created_at: "2026-11-26T10:00:00Z",
              },
            ],
            meta: {
              request_id: "req_list_bkg",
              pagination: {
                page: 1,
                page_size: 20,
                total_items: 1,
                total_pages: 1,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const listResult = await apiServices.booking.listKomtingBookings({
        status: "CONFIRMED",
        page: 1,
        page_size: 20,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/komting/bookings");
      expect(url).toContain("status=CONFIRMED");
      expect(url).toContain("page=1");
      expect(url).toContain("page_size=20");

      const headers = new Headers(options.headers);
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");

      expect(listResult.data).toHaveLength(1);
      expect(listResult.data[0]?.booking_code).toBe("BKG-20261127-001");
      expect(listResult.meta.pagination.total_items).toBe(1);
    });

    it("gets komting booking detail by ID and handles 404 & 403 errors", async () => {
      // 1. Success case
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "bkg_target_123",
              booking_code: "BKG-20261127-123",
              komting_id: "user_1",
              projector_id: "prj_001",
              booking_date: "2026-11-27",
              start_time: "09:00:00",
              estimated_return_at: "2026-11-27T04:00:00Z",
              status: "CONFIRMED",
              pickup_window: {
                opens_at: "2026-11-27T01:30:00Z",
                closes_at: "2026-11-27T02:15:00Z",
              },
              created_at: "2026-11-26T10:00:00Z",
            },
            meta: { request_id: "req_detail_bkg" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const detail = await apiServices.booking.getKomtingBooking("bkg_target_123");
      expect(detail.data.booking_code).toBe("BKG-20261127-123");

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/komting/bookings/bkg_target_123");

      // 2. 404 Error
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "PROJECTOR_NOT_FOUND",
              message: "Data booking tidak ditemukan.",
            },
            meta: { request_id: "req_bkg_404" },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.booking.getKomtingBooking("bkg_not_exist");
        expect.unreachable("Should have failed with 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(404);
      }

      // 3. 403 Forbidden
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message: "Anda tidak memiliki izin untuk mengakses booking ini.",
            },
            meta: { request_id: "req_bkg_403" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.booking.getKomtingBooking("bkg_other_user");
        expect.unreachable("Should have failed with 403");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe("FORBIDDEN");
      }
    });

    it("fetches booking QR code payload from /komting/bookings/{id}/qr", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              qr_payload: "opaque_qr_token_server_generated_999",
              expires_at: "2026-11-27T02:15:00Z",
            },
            meta: { request_id: "req_qr_fetch" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const qrResult = await apiServices.qr.getBookingQr("bkg_target_123");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/komting/bookings/bkg_target_123/qr");
      expect(new Headers(options.headers).get("Authorization")).toBe(
        "Bearer test_bearer_token_xyz"
      );

      expect(qrResult.data.qr_payload).toBe("opaque_qr_token_server_generated_999");
      expect(qrResult.data.expires_at).toBe("2026-11-27T02:15:00Z");
    });

    it("cancels booking with reason, Idempotency-Key, and handles 409 conflict when not cancellable", async () => {
      // 1. Success cancellation
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "bkg_to_cancel",
              booking_code: "BKG-20261127-001",
              status: "CANCELLED",
            },
            meta: { request_id: "req_cancel_ok" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const cancelled = await apiServices.booking.cancelKomtingBooking(
        "bkg_to_cancel",
        { reason: "Jadwal kuliah dibatalkan oleh dosen." },
        "idemp_cancel_key_1"
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/komting/bookings/bkg_to_cancel/cancel");
      expect(options.method).toBe("POST");

      const headers = new Headers(options.headers);
      expect(headers.get("Idempotency-Key")).toBe("idemp_cancel_key_1");
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");
      expect(JSON.parse(options.body as string)).toEqual({
        reason: "Jadwal kuliah dibatalkan oleh dosen.",
      });

      expect(cancelled.data.status).toBe("CANCELLED");

      // 2. 409 Conflict when booking is already FULFILLED or EXPIRED
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "BOOKING_CONFLICT",
              message: "Hanya booking berstatus CONFIRMED yang dapat dibatalkan.",
            },
            meta: { request_id: "req_cancel_conflict" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.booking.cancelKomtingBooking(
          "bkg_fulfilled",
          { reason: "Ingin membatalkan tapi sudah diambil." },
          "idemp_cancel_key_2"
        );
        expect.unreachable("Should have failed with 409");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("BOOKING_CONFLICT");
      }
    });
  });

  describe("STAFF Booking Operations & QR Verification (GET /staff/bookings, GET /staff/bookings/{id}, POST /staff/qr/validate)", () => {
    it("lists staff bookings with query filters (date, status, page, page_size) and Bearer token", async () => {
      const mockBookings: Booking[] = [
        {
          id: "bkg_staff_001",
          booking_code: "BKG-20261127-001",
          komting_id: "usr_komting_1",
          projector_id: "prj_001",
          booking_date: "2026-11-27",
          start_time: "08:00:00",
          estimated_return_at: "2026-11-27T04:00:00Z",
          status: "CONFIRMED",
          pickup_window: {
            opens_at: "2026-11-27T00:30:00Z",
            closes_at: "2026-11-27T01:15:00Z",
          },
          created_at: "2026-11-27T00:00:00Z",
        },
      ];

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: mockBookings,
            meta: {
              request_id: "req_staff_bkg_list",
              pagination: {
                page: 1,
                page_size: 20,
                total_items: 1,
                total_pages: 1,
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      const result = await apiServices.booking.listStaffBookings({
        date: "2026-11-27",
        status: "CONFIRMED",
        page: 1,
        page_size: 20,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toContain("/api/v1/staff/bookings");
      expect(url).toContain("date=2026-11-27");
      expect(url).toContain("status=CONFIRMED");
      expect(url).toContain("page=1");
      expect(url).toContain("page_size=20");

      const headers = new Headers(options.headers);
      expect(headers.get("Accept")).toBe("application/json");
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.booking_code).toBe("BKG-20261127-001");
      expect(result.meta.pagination.total_items).toBe(1);
    });

    it("gets staff booking detail with URL encoding and handles 404 BOOKING_NOT_FOUND and 403 FORBIDDEN", async () => {
      // 1. Success case
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "bkg/staff#special",
              booking_code: "BKG-20261127-002",
              komting_id: "usr_komting_2",
              projector_id: "prj_002",
              booking_date: "2026-11-27",
              start_time: "10:00:00",
              estimated_return_at: "2026-11-27T06:00:00Z",
              status: "CONFIRMED",
              pickup_window: {
                opens_at: "2026-11-27T02:30:00Z",
                closes_at: "2026-11-27T03:15:00Z",
              },
              created_at: "2026-11-27T02:00:00Z",
            },
            meta: { request_id: "req_staff_bkg_detail" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const res = await apiServices.booking.getStaffBooking("bkg/staff#special");
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/staff/bookings/bkg%2Fstaff%23special");
      expect(res.data.booking_code).toBe("BKG-20261127-002");

      // 2. 404 BOOKING_NOT_FOUND
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "BOOKING_NOT_FOUND",
              message: "Data booking tidak ditemukan di sistem.",
            },
            meta: { request_id: "req_staff_bkg_404" },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.booking.getStaffBooking("non_existent_bkg");
        expect.unreachable("Should have failed with 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.code).toBe("BOOKING_NOT_FOUND");
      }

      // 3. 403 FORBIDDEN
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message: "Akses dibatasi hanya untuk staf operasional atau admin.",
            },
            meta: { request_id: "req_staff_bkg_403" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.booking.getStaffBooking("bkg_forbidden");
        expect.unreachable("Should have failed with 403");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe("FORBIDDEN");
      }
    });

    it("validates QR token at POST /api/v1/staff/qr/validate and parses valid transaction payload", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              valid: true,
              action: "PICKUP",
              transaction: {
                booking_id: "bkg_val_001",
                booking_code: "BKG-20261127-003",
                komting_name: "Ahmad Dahlan",
                class_name: "IF-3B",
                projector_name: "Epson EB-X500",
                status: "CONFIRMED",
              },
              requires_confirmation: true,
            },
            meta: { request_id: "req_qr_validate_ok" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await apiServices.qr.validateQr({
        qr_payload: "opaque_qr_sample_jwt_or_hash",
        action: "PICKUP",
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/staff/qr/validate");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({
        qr_payload: "opaque_qr_sample_jwt_or_hash",
        action: "PICKUP",
      });

      const headers = new Headers(options.headers);
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");

      expect(result.data.valid).toBe(true);
      expect(result.data.action).toBe("PICKUP");
      expect(result.data.transaction.booking_code).toBe("BKG-20261127-003");
      expect(result.data.transaction.komting_name).toBe("Ahmad Dahlan");
    });

    it("handles invalid or expired QR response from server (e.g. 400 QR_INVALID / QR_EXPIRED)", async () => {
      // 1. QR_EXPIRED
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "QR_EXPIRED",
              message: "Token QR telah kedaluwarsa. Minta komting memuat ulang halaman booking.",
            },
            meta: { request_id: "req_qr_expired" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.qr.validateQr({
          qr_payload: "expired_token",
          action: "PICKUP",
        });
        expect.unreachable("Should have failed with 400 QR_EXPIRED");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.code).toBe("QR_EXPIRED");
      }

      // 2. QR_INVALID
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "QR_INVALID",
              message: "Token QR tidak valid atau tanda tangan digital salah.",
            },
            meta: { request_id: "req_qr_invalid" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.qr.validateQr({
          qr_payload: "tampered_token",
          action: "RETURN",
        });
        expect.unreachable("Should have failed with 400 QR_INVALID");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.code).toBe("QR_INVALID");
      }
    });
  });

  describe("STAFF Pickup & Return Inspection Transactions (POST /staff/bookings/{id}/pickup, GET/POST /staff/loans)", () => {
    it("confirms pickup for KOMTING with Idempotency-Key and transitions booking to FULFILLED and unit to BORROWED", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              booking: { id: "bkg_pickup_01", status: "FULFILLED" },
              loan: {
                id: "loan_new_01",
                status: "ACTIVE",
                picked_up_at: "2026-11-27T02:00:00Z",
              },
              projector: { id: "prj_001", physical_status: "BORROWED" },
            },
            meta: { request_id: "req_pickup_komting_ok" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await apiServices.qr.confirmPickup(
        "bkg_pickup_01",
        {
          qr_payload: "opaque_qr_token_komting",
          confirmed: true,
          received_by: "KOMTING",
          representative_name: null,
          note: null,
        },
        "idemp_key_pickup_komting"
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toContain("/api/v1/staff/bookings/bkg_pickup_01/pickup");
      expect(options.method).toBe("POST");

      const headers = new Headers(options.headers);
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");
      expect(headers.get("Idempotency-Key")).toBe("idemp_key_pickup_komting");

      const parsedBody = JSON.parse(options.body as string);
      expect(parsedBody.confirmed).toBe(true);
      expect(parsedBody.received_by).toBe("KOMTING");
      expect(parsedBody.representative_name).toBeNull();

      expect(result.data.booking.status).toBe("FULFILLED");
      expect(result.data.loan.status).toBe("ACTIVE");
      expect(result.data.projector.physical_status).toBe("BORROWED");
    });

    it("confirms pickup for REPRESENTATIVE with representative_name and note", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              booking: { id: "bkg_pickup_02", status: "FULFILLED" },
              loan: {
                id: "loan_new_02",
                status: "ACTIVE",
                picked_up_at: "2026-11-27T02:05:00Z",
              },
              projector: { id: "prj_002", physical_status: "BORROWED" },
            },
            meta: { request_id: "req_pickup_rep_ok" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await apiServices.qr.confirmPickup(
        "bkg_pickup_02",
        {
          qr_payload: "opaque_qr_token_rep",
          confirmed: true,
          received_by: "REPRESENTATIVE",
          representative_name: "Bambang Pamungkas",
          note: "Membawa surat mandat kelas",
        },
        "idemp_key_pickup_rep"
      );

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const parsedBody = JSON.parse(options.body as string);
      expect(parsedBody.received_by).toBe("REPRESENTATIVE");
      expect(parsedBody.representative_name).toBe("Bambang Pamungkas");
      expect(parsedBody.note).toBe("Membawa surat mandat kelas");
      expect(result.data.loan.id).toBe("loan_new_02");
    });

    it("handles pickup failure when booking is ineligible or window expired (409 conflict)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "BOOKING_NOT_PICKUP_ELIGIBLE",
              message:
                "Batas waktu pickup telah terlewati (window expired). Booking tidak dapat diambil.",
            },
            meta: { request_id: "req_pickup_conflict" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.qr.confirmPickup(
          "bkg_expired",
          {
            qr_payload: "expired_token",
            confirmed: true,
            received_by: "KOMTING",
            representative_name: null,
            note: null,
          },
          "idemp_key_conflict"
        );
        expect.unreachable("Should have failed with 409");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("BOOKING_NOT_PICKUP_ELIGIBLE");
        expect(apiErr.message).toContain("jendela waktu pengambilan");
      }
    });

    it("lists staff loans with status filter (ACTIVE) and pagination query", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "loan_001",
                booking_id: "bkg_001",
                projector_id: "prj_001",
                komting_id: "usr_komting_1",
                status: "ACTIVE",
                picked_up_at: "2026-11-27T02:00:00Z",
                returned_at: null,
                return_condition: null,
              },
            ],
            meta: {
              request_id: "req_loan_list",
              pagination: {
                page: 1,
                page_size: 20,
                total_items: 1,
                total_pages: 1,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await apiServices.loan.listStaffLoans({
        status: "ACTIVE",
        page: 1,
        page_size: 20,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toContain("/api/v1/staff/loans");
      expect(url).toContain("status=ACTIVE");
      expect(url).toContain("page=1");
      expect(url).toContain("page_size=20");

      const headers = new Headers(options.headers);
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.status).toBe("ACTIVE");
      expect(result.meta.pagination.total_items).toBe(1);
    });

    it("gets staff loan detail by ID with URL encoding and handles 404 cleanly", async () => {
      // 1. Success
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "loan/special#1",
              booking_id: "bkg_001",
              projector_id: "prj_001",
              komting_id: "usr_komting_1",
              status: "ACTIVE",
              picked_up_at: "2026-11-27T02:00:00Z",
              returned_at: null,
              return_condition: null,
            },
            meta: { request_id: "req_loan_detail" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const res = await apiServices.loan.getStaffLoan("loan/special#1");
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/staff/loans/loan%2Fspecial%231");
      expect(res.data.id).toBe("loan/special#1");

      // 2. 404
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "LOAN_NOT_FOUND",
              message: "Data peminjaman (loan) tidak ditemukan di sistem.",
            },
            meta: { request_id: "req_loan_404" },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.loan.getStaffLoan("non_existent_loan");
        expect.unreachable("Should have failed with 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.code).toBe("LOAN_NOT_FOUND");
      }
    });

    it("confirms return for NORMAL + COMPLETE unit using FormData without forced application/json header", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              loan: {
                id: "loan_return_01",
                status: "RETURNED",
                returned_at: "2026-11-27T04:00:00Z",
              },
              inspection: {
                projector_condition: "NORMAL",
                accessories_condition: "COMPLETE",
                unit_disposition: "AVAILABLE",
              },
              projector: {
                id: "prj_001",
                physical_status: "AVAILABLE",
              },
            },
            meta: { request_id: "req_return_normal_ok" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const formData = new FormData();
      formData.append("qr_payload", "opaque_qr_return_token");
      formData.append("confirmed", "true");
      formData.append("returned_by", "KOMTING");
      formData.append("projector_condition", "NORMAL");
      formData.append("accessories_condition", "COMPLETE");

      const result = await apiServices.loan.confirmReturn(
        "loan_return_01",
        formData,
        "idemp_key_return_normal"
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toContain("/api/v1/staff/loans/loan_return_01/return");
      expect(options.method).toBe("POST");

      const headers = new Headers(options.headers);
      // Per API Contract §17: FormData must NOT have manual Content-Type: application/json
      expect(headers.get("Content-Type")).toBeNull();
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");
      expect(headers.get("Idempotency-Key")).toBe("idemp_key_return_normal");

      expect(options.body).toBe(formData);
      expect(result.data.loan.status).toBe("RETURNED");
      expect(result.data.inspection.unit_disposition).toBe("AVAILABLE");
      expect(result.data.projector.physical_status).toBe("AVAILABLE");
    });

    it("confirms return for DAMAGED unit and server designates unit_disposition as MAINTENANCE", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              loan: {
                id: "loan_return_02",
                status: "RETURNED",
                returned_at: "2026-11-27T04:15:00Z",
              },
              inspection: {
                projector_condition: "DAMAGED",
                accessories_condition: "COMPLETE",
                unit_disposition: "MAINTENANCE",
              },
              projector: {
                id: "prj_002",
                physical_status: "MAINTENANCE",
              },
            },
            meta: { request_id: "req_return_damaged_ok" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const dummyFile = new File(["dummy image content"], "evidence_damage.jpg", {
        type: "image/jpeg",
      });

      const formData = new FormData();
      formData.append("qr_payload", "opaque_qr_return_token_2");
      formData.append("confirmed", "true");
      formData.append("returned_by", "REPRESENTATIVE");
      formData.append("representative_name", "Doni Perwakilan");
      formData.append("projector_condition", "DAMAGED");
      formData.append("accessories_condition", "COMPLETE");
      formData.append("note", "Port HDMI longgar");
      formData.append("evidence_photo", dummyFile);

      const result = await apiServices.loan.confirmReturn(
        "loan_return_02",
        formData,
        "idemp_key_return_damaged"
      );

      expect(result.data.loan.status).toBe("RETURNED");
      expect(result.data.inspection.projector_condition).toBe("DAMAGED");
      expect(result.data.inspection.unit_disposition).toBe("MAINTENANCE");
      expect(result.data.projector.physical_status).toBe("MAINTENANCE");
    });

    it("handles return failure when loan is not active (409 LOAN_NOT_ACTIVE)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "LOAN_NOT_ACTIVE",
              message: "Loan telah berstatus RETURNED dan tidak dapat diproses kembali.",
            },
            meta: { request_id: "req_return_conflict" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      );

      const formData = new FormData();
      formData.append("qr_payload", "token");
      formData.append("confirmed", "true");

      try {
        await apiServices.loan.confirmReturn("loan_already_closed", formData, "idemp_ret_conflict");
        expect.unreachable("Should have failed with 409");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("LOAN_NOT_ACTIVE");
      }
    });
  });

  describe("STAFF & ADMIN Projector Maintenance Management (GET /staff/maintenance, POST /staff/projectors/{id}/maintenance, POST /staff/maintenance/{id}/complete)", () => {
    it("lists maintenance records with pagination and status filters", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "maint_001",
                projector_id: "prj_001",
                reason: "Lampu redup dan berkedip",
                note: "Perlu penggantian bohlam",
                status: "IN_PROGRESS",
                started_at: "2026-11-26T08:00:00Z",
                resolution_note: null,
                completed_at: null,
              },
            ],
            meta: {
              request_id: "req_maint_list",
              pagination: {
                page: 1,
                page_size: 20,
                total_items: 1,
                total_pages: 1,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await apiServices.maintenance.listMaintenance({
        status: "IN_PROGRESS",
        page: 1,
        page_size: 20,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/staff/maintenance");
      expect(url).toContain("status=IN_PROGRESS");
      expect(url).toContain("page=1");
      expect(url).toContain("page_size=20");

      const headers = new Headers(options.headers);
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("maint_001");
      expect(result.data[0]?.status).toBe("IN_PROGRESS");
      expect(result.meta.pagination?.total_items).toBe(1);
    });

    it("creates a new maintenance record and transitions unit to MAINTENANCE", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "maint_002",
              projector_id: "prj_001",
              reason: "Port HDMI longgar",
              note: "Kabel tidak terdeteksi konsisten",
              status: "IN_PROGRESS",
              started_at: "2026-11-27T09:00:00Z",
              resolution_note: null,
              completed_at: null,
            },
            meta: { request_id: "req_maint_create" },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await apiServices.maintenance.createMaintenance("prj_001", {
        reason: "Port HDMI longgar",
        note: "Kabel tidak terdeteksi konsisten",
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/staff/projectors/prj_001/maintenance");
      expect(options.method).toBe("POST");

      const headers = new Headers(options.headers);
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(JSON.parse(options.body as string)).toEqual({
        reason: "Port HDMI longgar",
        note: "Kabel tidak terdeteksi konsisten",
      });

      expect(result.data.id).toBe("maint_002");
      expect(result.data.status).toBe("IN_PROGRESS");
    });

    it("handles 409 conflict when projector has active loan during createMaintenance", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "PROJECTOR_HAS_ACTIVE_LOAN",
              message: "Proyektor sedang dalam masa peminjaman aktif.",
            },
            meta: { request_id: "req_maint_loan_conflict" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.maintenance.createMaintenance("prj_borrowed", {
          reason: "Kipas bising",
        });
        expect.unreachable("Should have failed with 409");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("PROJECTOR_HAS_ACTIVE_LOAN");
        expect(apiErr.message).toContain("dipinjam");
      }
    });

    it("completes maintenance with set_projector_available: true", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "maint_001",
              projector_id: "prj_001",
              reason: "Lampu redup dan berkedip",
              note: "Perlu penggantian bohlam",
              status: "COMPLETED",
              started_at: "2026-11-26T08:00:00Z",
              resolution_note: "Bohlam baru terpasang dan lolos uji fungsi 30 menit",
              completed_at: "2026-11-27T10:00:00Z",
            },
            meta: { request_id: "req_maint_complete_avail" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await apiServices.maintenance.completeMaintenance("maint_001", {
        resolution_note: "Bohlam baru terpasang dan lolos uji fungsi 30 menit",
        set_projector_available: true,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/staff/maintenance/maint_001/complete");
      expect(options.method).toBe("POST");

      const headers = new Headers(options.headers);
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(JSON.parse(options.body as string)).toEqual({
        resolution_note: "Bohlam baru terpasang dan lolos uji fungsi 30 menit",
        set_projector_available: true,
      });

      expect(result.data.status).toBe("COMPLETED");
      expect(result.data.resolution_note).toBe(
        "Bohlam baru terpasang dan lolos uji fungsi 30 menit"
      );
    });

    it("completes maintenance with set_projector_available: false (unit stays in MAINTENANCE)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "maint_001",
              projector_id: "prj_001",
              reason: "Mainboard rusak",
              note: null,
              status: "COMPLETED",
              started_at: "2026-11-26T08:00:00Z",
              resolution_note: "Perbaikan sementara selesai, namun menunggu servis resmi vendor",
              completed_at: "2026-11-27T10:00:00Z",
            },
            meta: { request_id: "req_maint_complete_unavail" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await apiServices.maintenance.completeMaintenance("maint_001", {
        resolution_note: "Perbaikan sementara selesai, namun menunggu servis resmi vendor",
        set_projector_available: false,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/staff/maintenance/maint_001/complete");
      expect(options.method).toBe("POST");

      const headers = new Headers(options.headers);
      expect(headers.get("Authorization")).toBe("Bearer test_bearer_token_xyz");
      expect(JSON.parse(options.body as string)).toEqual({
        resolution_note: "Perbaikan sementara selesai, namun menunggu servis resmi vendor",
        set_projector_available: false,
      });

      expect(result.data.status).toBe("COMPLETED");
    });

    it("handles 409 conflict when completeMaintenance encounters active loan", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "PROJECTOR_HAS_ACTIVE_LOAN",
              message: "Proyektor masih memiliki loan aktif.",
            },
            meta: { request_id: "req_maint_complete_conflict" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.maintenance.completeMaintenance("maint_001", {
          resolution_note: "Selesai dibersihkan",
          set_projector_available: true,
        });
        expect.unreachable("Should have failed with 409");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("PROJECTOR_HAS_ACTIVE_LOAN");
      }
    });

    it("handles 403 FORBIDDEN when unauthorized user attempts maintenance operations", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message: "Akses ditolak. Peran STAFF atau ADMIN diperlukan.",
            },
            meta: { request_id: "req_maint_forbidden" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.maintenance.createMaintenance("prj_001", {
          reason: "Uji otorisasi",
        });
        expect.unreachable("Should have failed with 403");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe("FORBIDDEN");
      }
    });

    it("handles 404 PROJECTOR_NOT_FOUND when starting maintenance on invalid projector", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "PROJECTOR_NOT_FOUND",
              message: "Proyektor dengan ID yang diminta tidak ditemukan.",
            },
            meta: { request_id: "req_maint_p404" },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );

      try {
        await apiServices.maintenance.createMaintenance("prj_invalid", {
          reason: "Proyektor fiktif",
        });
        expect.unreachable("Should have failed with 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.code).toBe("PROJECTOR_NOT_FOUND");
      }
    });
  });

  describe("Network and Transport Resilience", () => {
    it("handles network failure and maps cleanly to ApiClientError", async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      try {
        await apiServices.projector.listProjectors();
        expect.unreachable("Should have failed");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.code).toBe("NETWORK_ERROR");
        expect(apiErr.message).toContain("Gagal terhubung");
      }
    });

    it("handles non-JSON server error response without crashing JSON parser", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        })
      );

      try {
        await apiServices.operatingHours.getOperatingHours("2026-11-27");
        expect.unreachable("Should have failed");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(502);
      }
    });

    it("handles request timeout abort and maps cleanly to TIMEOUT error", async () => {
      const abortError = new DOMException(
        "The operation was aborted due to timeout.",
        "AbortError"
      );
      fetchSpy.mockRejectedValueOnce(abortError);

      try {
        await apiServices.projector.listProjectors();
        expect.unreachable("Should have failed due to timeout");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.code).toBe("TIMEOUT");
        expect(apiErr.message).toContain("melebihi batas waktu");
      }
    });
  });

  describe("Environment Mode Separation", () => {
    it("exports apiServices implementing all ServiceRegistry contracts", () => {
      expect(typeof apiServices.projector.listProjectors).toBe("function");
      expect(typeof apiServices.projector.getProjector).toBe("function");
      expect(typeof apiServices.operatingHours.getOperatingHours).toBe("function");
      expect(typeof apiServices.operatingHours.updateOperatingHours).toBe("function");
      expect(typeof apiServices.availability.checkAvailability).toBe("function");
      expect(typeof apiServices.booking.createBooking).toBe("function");
      expect(typeof apiServices.loan.listStaffLoans).toBe("function");
      expect(typeof apiServices.qr.validateQr).toBe("function");
      expect(typeof apiServices.maintenance.listMaintenance).toBe("function");
    });
  });
});
