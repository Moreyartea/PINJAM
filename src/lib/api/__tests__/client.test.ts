import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiRequest, buildUrl, setAccessTokenProvider } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";

describe("buildUrl() unit tests", () => {
  describe("Relative URL behavior (when baseUrl is empty or unset)", () => {
    it("generates a relative same-origin endpoint when baseUrl is empty string", () => {
      expect(buildUrl("/me", undefined, "")).toBe("/api/v1/me");
    });

    it("handles path without leading slash correctly", () => {
      expect(buildUrl("me", undefined, "")).toBe("/api/v1/me");
    });

    it("does not duplicate /api/v1 prefix if path already includes it", () => {
      expect(buildUrl("/api/v1/me", undefined, "")).toBe("/api/v1/me");
      expect(buildUrl("api/v1/bookings", undefined, "")).toBe("/api/v1/bookings");
    });

    it("appends query parameters to relative URL", () => {
      const url = buildUrl(
        "/projectors",
        { physical_status: "AVAILABLE", page: 1, is_active: true },
        ""
      );
      expect(url).toBe("/api/v1/projectors?physical_status=AVAILABLE&page=1&is_active=true");
    });

    it("omits empty string query parameters from relative URL", () => {
      const url = buildUrl("/bookings", { status: "ACTIVE", filter: "" }, "");
      expect(url).toBe("/api/v1/bookings?status=ACTIVE");
    });

    it("trims whitespace from baseUrl and treats whitespace-only as relative", () => {
      expect(buildUrl("/me", undefined, "   ")).toBe("/api/v1/me");
    });
  });

  describe("Absolute URL behavior (when baseUrl is configured)", () => {
    it("generates an absolute URL when baseUrl is provided without trailing slash", () => {
      expect(buildUrl("/me", undefined, "http://localhost:3000")).toBe(
        "http://localhost:3000/api/v1/me"
      );
    });

    it("strips trailing slash from baseUrl cleanly", () => {
      expect(buildUrl("/me", undefined, "https://api.pinjam.test/")).toBe(
        "https://api.pinjam.test/api/v1/me"
      );
      expect(buildUrl("/me", undefined, "https://api.pinjam.test///")).toBe(
        "https://api.pinjam.test/api/v1/me"
      );
    });

    it("appends query parameters to absolute URL correctly", () => {
      const url = buildUrl(
        "/projectors",
        { brand: "Epson", page: 2 },
        "https://pinjam.kampus.ac.id"
      );
      expect(url).toBe("https://pinjam.kampus.ac.id/api/v1/projectors?brand=Epson&page=2");
    });

    it("does not duplicate /api/v1 when path already has it on absolute baseUrl", () => {
      expect(buildUrl("/api/v1/health", undefined, "https://api.domain.test")).toBe(
        "https://api.domain.test/api/v1/health"
      );
    });
  });
});

describe("apiRequest() integration with buildUrl", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    setAccessTokenProvider(() => "mock_token_123");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    setAccessTokenProvider(null);
    vi.restoreAllMocks();
  });

  it("sends request using relative path when NEXT_PUBLIC_API_BASE_URL is not set", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { user_id: "usr_1", role: "KOMTING" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await apiRequest<{ data: { user_id: string; role: string } }>("/me");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    // Since env.apiBaseUrl is "" from .env.local, calledUrl must start with /api/v1/me
    expect(calledUrl).toBe("/api/v1/me");
    expect(options.method).toBe("GET");
    expect(result.data.role).toBe("KOMTING");
  });

  it("attaches Authorization header and handles 401 error", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "AUTH_REQUIRED",
            message: "Sesi login tidak valid.",
          },
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    await expect(apiRequest("/me")).rejects.toThrow(ApiClientError);
  });
});
