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
