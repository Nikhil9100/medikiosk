"use client";

/**
 * Browser-side helpers for the staff consoles (doctor + hospital).
 * The HttpOnly staff cookie is sent automatically (same-origin), so no
 * token handling happens in the client.
 */

export type StaffIdentity = {
  id: string;
  email: string;
  displayName: string;
  title: string | null;
  role: "DOCTOR" | "HOSPITAL";
};

export class StaffAuthError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "StaffAuthError";
  }
}

export async function fetchStaffMe(): Promise<StaffIdentity> {
  const res = await fetch("/api/staff/me", { cache: "no-store" });
  if (!res.ok) throw new StaffAuthError();
  const data = (await res.json()) as { staff: StaffIdentity };
  return data.staff;
}

export async function staffLogin(email: string, password: string): Promise<StaffIdentity> {
  const res = await fetch("/api/staff/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as { staff?: StaffIdentity; error?: string };
  if (!res.ok || !data.staff) {
    throw new Error(data.error ?? "Sign-in failed");
  }
  return data.staff;
}

export async function staffLogout(): Promise<void> {
  await fetch("/api/staff/logout", { method: "POST" }).catch(() => {});
}

export async function staffJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data;
}
