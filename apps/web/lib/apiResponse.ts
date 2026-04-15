import type { ApiError } from "@usopc/shared";

export function apiError(message: string, status: number, code?: string) {
  const body: ApiError =
    code !== undefined ? { error: message, code } : { error: message };
  return Response.json(body, { status });
}
