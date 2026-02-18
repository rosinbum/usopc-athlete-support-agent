export class FetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new FetchError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function mutationFetcher<T>(
  url: string,
  { arg }: { arg: { method: string; body?: unknown } },
): Promise<T> {
  const res = await fetch(url, {
    method: arg.method,
    headers: arg.body ? { "Content-Type": "application/json" } : undefined,
    body: arg.body ? JSON.stringify(arg.body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new FetchError(message, res.status);
  }
  return res.json() as Promise<T>;
}
