const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

// Read the stored token; returns null during server render or when absent.
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

// Make an authenticated request to the backend API.
// Pass a plain object as `body` for JSON; pass a FormData as `body` for a file
// upload (the browser sets the multipart Content-Type/boundary itself).
export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const token = getToken();
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        // Only set JSON Content-Type for JSON bodies. For FormData, we must NOT set
        // Content-Type — the browser adds it with the multipart boundary.
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: isFormData
        ? (options.body as FormData)
        : options.body
        ? JSON.stringify(options.body)
        : undefined,
    });

    if (res.status === 401) {
      return { ok: false, status: 401, error: "Your session has expired. Please sign in again." };
    }

    let data: T | undefined;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = undefined;
      }
    }

    if (!res.ok) {
      const message =
        (data as { error?: string } | undefined)?.error ??
        "Something went wrong. Please try again.";
      return { ok: false, status: res.status, error: message };
    }

    return { ok: true, status: res.status, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "Cannot reach the server. Is the backend running?" };
  }
}