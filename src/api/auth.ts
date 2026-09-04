// Gates the hub-connected control app behind a shared PIN (see hub/src/auth.ts).
// Standalone/localStorage mode has no server to protect, so every function here is a
// no-op success in that mode — this only ever engages when VITE_API_BASE_URL is set.
const BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const authGateEnabled = BASE_URL !== undefined;

export async function checkAuthStatus(): Promise<boolean> {
  if (!authGateEnabled) return true;
  try {
    const res = await fetch(`${BASE_URL}/api/auth/status`, { credentials: 'include' });
    if (!res.ok) return false;
    const data = (await res.json()) as { authenticated: boolean };
    return data.authenticated;
  } catch {
    return false;
  }
}

export async function login(pin: string): Promise<{ ok: boolean; error?: string }> {
  if (!authGateEnabled) return { ok: true };
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: body?.error ?? 'Incorrect PIN' };
}

export async function logout(): Promise<void> {
  if (!authGateEnabled) return;
  await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
}
