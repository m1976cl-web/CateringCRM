import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSessionToken } from "./session";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no está configurado");
  }
  if (!client) {
    client = createClient(url, anonKey, {
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
