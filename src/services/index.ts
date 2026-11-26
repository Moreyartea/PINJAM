import { env } from "@/lib/config/env";
import { apiServices } from "@/services/api/api-services";
import type { ServiceRegistry } from "@/services/contracts";
import { mockServices } from "@/services/mock/mock-services";

/**
 * Single service entry point for UI/features.
 * Switches cleanly between real API client and dev-only mock adapter.
 */
export const services: ServiceRegistry = env.useMockApi ? mockServices : apiServices;

export const isMockMode = env.useMockApi;
export type { ServiceRegistry } from "@/services/contracts";
