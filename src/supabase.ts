import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSessionToken } from "./session";

const RUNTIME_KEY = "catering-crm:supabase";

export type CloudConfig = { url: string; anonKey: string };

export function getEnvCloudConfig(): CloudConfig {
  return {
    url: import.meta.env.VITE_SUPABASE_URL?.trim() ?? "",
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "",
  };
}

export function getRuntimeCloudConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(RUNTIME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CloudConfig>;
    const url = String(parsed.url ?? "").trim();
    const anonKey = String(parsed.anonKey ?? "").trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
  } catch {
    return null;
  }
}

export function saveRuntimeCloudConfig(config: CloudConfig | null): void {
  if (!config) {
    localStorage.removeItem(RUNTIME_KEY);
    return;
  }
  localStorage.setItem(RUNTIME_KEY, JSON.stringify(config));
}

export function getCloudConfig(): CloudConfig {
  return getRuntimeCloudConfig() ?? getEnvCloudConfig();
}

export function isSupabaseConfigured(): boolean {
  const cfg = getCloudConfig();
  return Boolean(cfg.url && cfg.anonKey);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no está configurado");
  }
  if (!client) {
    const cfg = getCloudConfig();
    client = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          const token = getSessionToken();
          if (token) headers.set("x-team-token", token);
          return fetch(input, { ...init, headers });
        },
      },
    });
  }
  return client;
}

