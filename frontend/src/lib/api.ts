// API client for the Blue Team Boot panel.
// Same-origin: requests go to the same host serving this page, then Next.js
// rewrites /api/* to the FastAPI backend. Works from any hostname (LAN,
// Tailscale, public domain via Cloudflare, etc.) with no config change.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Types ----
export interface Machine {
  mac: string;
  hostname: string | null;
  asset_tag: string | null;
  notes: string | null;
  first_seen: string;
  last_seen: string;
  last_ip: string | null;
  vendor: string | null;
  arch: string | null;
  manufacturer: string | null;
  product: string | null;
  serial: string | null;
  system_uuid: string | null;
  bios_vendor: string | null;
  nic_vendor: string | null;
  // Components (from inventory boot)
  cpu_model: string | null;
  cpu_cores: number | null;
  cpu_threads: number | null;
  gpu_model: string | null;
  gpu_vram_mb: number | null;
  ram_gb: number | null;
  ram_modules: Array<{ size: string; type: string; speed: string; vendor: string }> | null;
  storage_total_gb: number | null;
  storage_devices: Array<{ model: string; vendor: string; size_gb: number; tran: string }> | null;
  inventoried_at: string | null;
}

/** Best human-readable identifier for a machine */
export function friendlyName(m: Pick<Machine, "hostname" | "product" | "manufacturer" | "nic_vendor" | "mac">): string {
  if (m.hostname) return m.hostname;
  if (m.product && m.manufacturer) {
    const mfr = m.manufacturer
      .replace(/\s+Technology\s+Co\.,?\s+Ltd\.?$/i, "")
      .replace(/\s+Computer\s+Inc\.?$/i, "")
      .replace(/\s+International\s+Co\.?,?\s+Ltd\.?$/i, "")
      .trim();
    return `${mfr} ${m.product}`;
  }
  if (m.product) return m.product;
  if (m.nic_vendor) return `${m.nic_vendor} (${m.mac.slice(-8)})`;
  return m.mac;
}

/** Compact component summary: "R7 7700X · RTX 4070 · 32GB · 1TB" */
export function componentSummary(m: Pick<Machine, "cpu_model" | "gpu_model" | "ram_gb" | "storage_total_gb">): string | null {
  const parts: string[] = [];
  if (m.cpu_model) parts.push(shortCpu(m.cpu_model));
  if (m.gpu_model) parts.push(shortGpu(m.gpu_model));
  if (m.ram_gb) parts.push(`${m.ram_gb}GB`);
  if (m.storage_total_gb) {
    const tb = m.storage_total_gb >= 1000 ? `${(m.storage_total_gb / 1000).toFixed(1).replace(/\.0$/, "")}TB` : `${m.storage_total_gb}GB`;
    parts.push(tb);
  }
  return parts.length ? parts.join(" · ") : null;
}

function shortCpu(s: string): string {
  return s
    .replace(/\(R\)|\(TM\)|\(C\)/gi, "")
    .replace(/CPU @\s*[\d.]+\s*GHz/i, "")
    .replace(/\bIntel\s+Core\s+/i, "")
    .replace(/\bAMD\s+/i, "")
    .replace(/\bRyzen\s+(\d)\s+/i, "R$1 ")
    .replace(/\bThreadripper\s+/i, "TR ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortGpu(s: string): string {
  return s
    .replace(/NVIDIA Corporation\s+/i, "")
    .replace(/Advanced Micro Devices, Inc\.?\s+\[?AMD\/?ATI\]?\s*/i, "")
    .replace(/Intel Corporation\s+/i, "")
    .replace(/GeForce\s+/i, "")
    .replace(/Radeon\s+/i, "")
    .replace(/Graphics\s+Controller/i, "GPU")
    .replace(/\s+\[.*\]/g, "")
    .trim();
}

export interface BootProfile {
  name: string;
  display_name: string;
  description: string | null;
  category: string;
  icon: string | null;
  enabled: boolean;
}

export interface BootIntent {
  id: number;
  mac: string;
  profile: string;
  parameters: Record<string, unknown>;
  set_by: string | null;
  set_at: string;
  consumed_at: string | null;
  expires_at: string | null;
  one_shot: boolean;
  notes: string | null;
}

export interface BootSession {
  id: number;
  mac: string;
  intent_id: number | null;
  profile: string | null;
  client_ip: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  stages: Array<{ stage: string; ts: string }>;
  bytes_served: number;
}

export interface DashboardStats {
  machines_total: number;
  sessions_active: number;
  sessions_today: number;
  intents_pending: number;
  profiles_enabled: number;
}

// ---- API methods ----
export const api = {
  stats: () => http<DashboardStats>("/api/v1/dashboard/stats"),

  machines: () => http<Machine[]>("/api/v1/machines"),
  machine: (mac: string) => http<Machine>(`/api/v1/machines/${encodeURIComponent(mac)}`),
  updateMachine: (mac: string, patch: Partial<Pick<Machine, "hostname" | "asset_tag" | "notes">>) =>
    http<Machine>(`/api/v1/machines/${encodeURIComponent(mac)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  profiles: () => http<BootProfile[]>("/api/v1/profiles"),

  intents: (params?: { mac?: string; pending_only?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.mac) qs.set("mac", params.mac);
    if (params?.pending_only !== undefined) qs.set("pending_only", String(params.pending_only));
    return http<BootIntent[]>(`/api/v1/intents${qs.toString() ? `?${qs}` : ""}`);
  },
  createIntent: (body: {
    mac: string;
    profile: string;
    parameters?: Record<string, unknown>;
    one_shot?: boolean;
    notes?: string;
  }) =>
    http<BootIntent>("/api/v1/intents", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cancelIntent: (id: number) => http<void>(`/api/v1/intents/${id}`, { method: "DELETE" }),

  sessions: (params?: { active_only?: boolean; mac?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.active_only !== undefined) qs.set("active_only", String(params.active_only));
    if (params?.mac) qs.set("mac", params.mac);
    if (params?.limit) qs.set("limit", String(params.limit));
    return http<BootSession[]>(`/api/v1/sessions${qs.toString() ? `?${qs}` : ""}`);
  },
};

export const wsUrl = () => {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/v1/events`;
};
