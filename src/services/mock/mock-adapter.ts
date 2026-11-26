import { ApiClientError } from "@/lib/api/errors";
import type { ApiListResponse, ApiSingleResponse } from "@/lib/api/types";

export type MockScenario = "success" | "empty" | "validation_error" | "unauthorized" | "conflict";

let currentMockScenario: MockScenario = "success";
let mockLatencyMs = 200;

/**
 * Configures dev-only mock behavior (FRONTEND_SPEC_PINJAM.md §12.5).
 */
export function setMockScenario(scenario: MockScenario): void {
  currentMockScenario = scenario;
}

export function getMockScenario(): MockScenario {
  return currentMockScenario;
}

export function setMockLatency(ms: number): void {
  mockLatencyMs = Math.max(0, ms);
}

export function createMockRequestId(): string {
  return `req_mock_${Date.now().toString(36)}`;
}

export function wrapMockSingle<T>(data: T): ApiSingleResponse<T> {
  return {
    data,
    meta: {
      request_id: createMockRequestId(),
    },
  };
}

export function wrapMockList<T>(items: T[], page = 1, pageSize = 20): ApiListResponse<T> {
  const totalItems = items.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  return {
    data: items,
    meta: {
      request_id: createMockRequestId(),
      pagination: {
        page,
        page_size: pageSize,
        total_items: totalItems,
        total_pages: totalPages,
      },
    },
  };
}

export async function simulateMockRequest(scenarioOverride?: MockScenario): Promise<MockScenario> {
  if (mockLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, mockLatencyMs));
  }

  const scenario = scenarioOverride ?? currentMockScenario;

  if (scenario === "unauthorized") {
    throw new ApiClientError({
      status: 401,
      code: "AUTH_REQUIRED",
      requestId: createMockRequestId(),
    });
  }

  if (scenario === "validation_error") {
    throw new ApiClientError({
      status: 422,
      code: "BOOKING_TIME_INVALID",
      details: [{ field: "estimated_return_at", reason: "MUST_BE_AFTER_START" }],
      requestId: createMockRequestId(),
    });
  }

  if (scenario === "conflict") {
    throw new ApiClientError({
      status: 409,
      code: "BOOKING_CONFLICT",
      requestId: createMockRequestId(),
    });
  }

  return scenario;
}
