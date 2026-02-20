export class FetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

async function parseError(res: Response): Promise<FetchError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body.error) message = body.error;
  } catch {
    // ignore parse errors
  }
  return new FetchError(message, res.status);
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

export async function mutationFetcher<T>(
  url: string,
  { arg }: { arg: { method: string; body?: unknown } },
): Promise<T> {
  const res = await fetch(url, {
    method: arg.method,
    ...(arg.body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(arg.body),
        }
      : {}),
  });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}
