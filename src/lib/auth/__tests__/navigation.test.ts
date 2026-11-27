import { describe, expect, it } from "vitest";
import {
  getDefaultRouteForRole,
  isPathAllowedForRole,
  resolvePostLoginRedirect,
  sanitizeInternalRedirect,
} from "@/lib/auth/navigation";

describe("Navigation & Post-Login Redirection Logic", () => {
  describe("getDefaultRouteForRole", () => {
    it("returns correct default dashboard route for each role", () => {
      expect(getDefaultRouteForRole("KOMTING")).toBe("/komting");
      expect(getDefaultRouteForRole("STAFF")).toBe("/staff");
      expect(getDefaultRouteForRole("ADMIN")).toBe("/admin");
    });
  });

  describe("sanitizeInternalRedirect", () => {
    it("allows valid internal absolute paths", () => {
      expect(sanitizeInternalRedirect("/admin")).toBe("/admin");
      expect(sanitizeInternalRedirect("/staff/scan")).toBe("/staff/scan");
      expect(sanitizeInternalRedirect("/komting/bookings/bkg-123")).toBe(
        "/komting/bookings/bkg-123"
      );
    });

    it("rejects open redirects and external URLs", () => {
      expect(sanitizeInternalRedirect("https://evil.com")).toBeNull();
      expect(sanitizeInternalRedirect("http://attacker.com/steal")).toBeNull();
      expect(sanitizeInternalRedirect("//evil.com")).toBeNull();
      expect(sanitizeInternalRedirect("///evil.com")).toBeNull();
      expect(sanitizeInternalRedirect("javascript:alert(1)")).toBeNull();
      expect(sanitizeInternalRedirect("")).toBeNull();
      expect(sanitizeInternalRedirect(null)).toBeNull();
      expect(sanitizeInternalRedirect(undefined)).toBeNull();
    });
  });

  describe("isPathAllowedForRole", () => {
    it("correctly identifies accessible paths per role", () => {
      // ADMIN
      expect(isPathAllowedForRole("/admin", "ADMIN")).toBe(true);
      expect(isPathAllowedForRole("/admin/projectors", "ADMIN")).toBe(true);
      expect(isPathAllowedForRole("/staff", "ADMIN")).toBe(true);
      expect(isPathAllowedForRole("/staff/scan", "ADMIN")).toBe(true);
      expect(isPathAllowedForRole("/komting", "ADMIN")).toBe(false);

      // STAFF
      expect(isPathAllowedForRole("/staff", "STAFF")).toBe(true);
      expect(isPathAllowedForRole("/staff/scan", "STAFF")).toBe(true);
      expect(isPathAllowedForRole("/admin", "STAFF")).toBe(false);
      expect(isPathAllowedForRole("/komting", "STAFF")).toBe(false);

      // KOMTING
      expect(isPathAllowedForRole("/komting", "KOMTING")).toBe(true);
      expect(isPathAllowedForRole("/application/status", "KOMTING")).toBe(true);
      expect(isPathAllowedForRole("/staff", "KOMTING")).toBe(false);
      expect(isPathAllowedForRole("/admin", "KOMTING")).toBe(false);
    });
  });

  describe("resolvePostLoginRedirect", () => {
    describe("ADMIN Role Scenarios", () => {
      it("1. ADMIN login without next parameter lands on /admin", () => {
        expect(resolvePostLoginRedirect("ADMIN", null)).toBe("/admin");
        expect(resolvePostLoginRedirect("ADMIN", undefined)).toBe("/admin");
        expect(resolvePostLoginRedirect("ADMIN", "")).toBe("/admin");
      });

      it("2. ADMIN login with next=/staff (from expired session) redirects to /admin as default", () => {
        expect(resolvePostLoginRedirect("ADMIN", "/staff")).toBe("/admin");
        expect(resolvePostLoginRedirect("ADMIN", "/staff/")).toBe("/admin");
      });

      it("3. ADMIN login with explicit allowed deep-links is honored", () => {
        expect(resolvePostLoginRedirect("ADMIN", "/staff/scan")).toBe("/staff/scan");
        expect(resolvePostLoginRedirect("ADMIN", "/staff/bookings")).toBe("/staff/bookings");
        expect(resolvePostLoginRedirect("ADMIN", "/staff/loans/123")).toBe("/staff/loans/123");
        expect(resolvePostLoginRedirect("ADMIN", "/admin/projectors")).toBe("/admin/projectors");
        expect(resolvePostLoginRedirect("ADMIN", "/admin/audit-logs")).toBe("/admin/audit-logs");
      });

      it("4. ADMIN login with unauthorized role path falls back to /admin", () => {
        expect(resolvePostLoginRedirect("ADMIN", "/komting/bookings")).toBe("/admin");
      });

      it("5. ADMIN login with external or loop URL falls back to /admin", () => {
        expect(resolvePostLoginRedirect("ADMIN", "https://evil.com")).toBe("/admin");
        expect(resolvePostLoginRedirect("ADMIN", "/login")).toBe("/admin");
        expect(resolvePostLoginRedirect("ADMIN", "/register")).toBe("/admin");
        expect(resolvePostLoginRedirect("ADMIN", "/forbidden")).toBe("/admin");
      });
    });

    describe("STAFF Role Scenarios", () => {
      it("STAFF login without next parameter lands on /staff", () => {
        expect(resolvePostLoginRedirect("STAFF", null)).toBe("/staff");
      });

      it("STAFF login with allowed deep-link is honored", () => {
        expect(resolvePostLoginRedirect("STAFF", "/staff/loans")).toBe("/staff/loans");
      });

      it("STAFF login targeting /admin is blocked and redirected to /staff", () => {
        expect(resolvePostLoginRedirect("STAFF", "/admin/audit-logs")).toBe("/staff");
      });
    });

    describe("KOMTING Role Scenarios", () => {
      it("KOMTING login without next parameter lands on /komting", () => {
        expect(resolvePostLoginRedirect("KOMTING", null)).toBe("/komting");
      });

      it("KOMTING with PENDING_VERIFICATION status lands on /application/status", () => {
        expect(
          resolvePostLoginRedirect("KOMTING", "/komting/bookings", "PENDING_VERIFICATION")
        ).toBe("/application/status");
      });

      it("KOMTING login targeting STAFF or ADMIN route falls back to /komting", () => {
        expect(resolvePostLoginRedirect("KOMTING", "/staff")).toBe("/komting");
        expect(resolvePostLoginRedirect("KOMTING", "/admin")).toBe("/komting");
      });
    });
  });
});
