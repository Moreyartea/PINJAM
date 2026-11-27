import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { signInWithEmailPassword } from "@/lib/auth/session";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

interface LoginRequestBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const body = (await request.json().catch(() => null)) as LoginRequestBody | null;
    if (!body || typeof body !== "object") {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body permintaan harus berupa objek JSON yang valid.",
      });
    }

    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";

    const result = await signInWithEmailPassword({ email, password });
    return jsonSuccess(result, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}
