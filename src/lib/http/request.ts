import { AuthError } from "@/lib/auth/errors";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuidParam(value: string, fieldName = "id"): string {
  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: `Parameter ${fieldName} tidak valid.`,
      details: [{ field: fieldName, reason: "INVALID_UUID" }],
    });
  }
  return trimmed;
}

export interface ParsedListQuery {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  searchParams: URLSearchParams;
}

export function parseListQuery(
  requestUrl: string,
  options: {
    allowedSortBy: readonly string[];
    defaultSortBy: string;
    defaultPageSize?: number;
    maxPageSize?: number;
  }
): ParsedListQuery {
  const url = new URL(requestUrl);
  const searchParams = url.searchParams;

  const rawPage = searchParams.get("page");
  const rawPageSize = searchParams.get("page_size");
  const rawSortBy = searchParams.get("sort_by");
  const rawSortOrder = searchParams.get("sort_order");

  const page = rawPage === null ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Parameter page harus berupa bilangan bulat >= 1.",
      details: [{ field: "page", reason: "INVALID_PAGINATION" }],
    });
  }

  const defaultPageSize = options.defaultPageSize ?? 20;
  const maxPageSize = options.maxPageSize ?? 100;
  const pageSize = rawPageSize === null ? defaultPageSize : Number(rawPageSize);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: `Parameter page_size harus antara 1 dan ${maxPageSize}.`,
      details: [{ field: "page_size", reason: "INVALID_PAGINATION" }],
    });
  }

  const sortBy =
    rawSortBy === null || rawSortBy.trim() === "" ? options.defaultSortBy : rawSortBy.trim();
  if (!options.allowedSortBy.includes(sortBy)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Parameter sort_by tidak diizinkan.",
      details: [{ field: "sort_by", reason: "UNSUPPORTED_SORT_FIELD" }],
    });
  }

  const sortOrder =
    rawSortOrder === null || rawSortOrder.trim() === ""
      ? "desc"
      : rawSortOrder.trim().toLowerCase();
  if (sortOrder !== "asc" && sortOrder !== "desc") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Parameter sort_order harus bernilai asc atau desc.",
      details: [{ field: "sort_order", reason: "INVALID_SORT_ORDER" }],
    });
  }

  return {
    page,
    pageSize,
    sortBy,
    sortOrder,
    searchParams,
  };
}
