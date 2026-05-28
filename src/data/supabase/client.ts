import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";

export interface SupabaseSession {
  userId: string;
  accessToken: string;
}

export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseClientAdapter {
  createAnonymousUser(): Promise<SupabaseSession>;
  signOut(): Promise<void>;
  upsert(
    table: string,
    payload: Record<string, unknown>,
    options?: { onConflict?: string },
  ): Promise<void>;
  insert(table: string, payload: Record<string, unknown>): Promise<void>;
}

export interface SupabaseAuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function assertCanInitializeSupabase(config: SupabaseClientConfig): void {
  if (!config.url || !config.anonKey) {
    throw new Error("Supabase URL and anon key are required for consented sync.");
  }
}

export function getSupabaseConfigFromEnv(): SupabaseClientConfig | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  return url && anonKey ? { url, anonKey } : null;
}

function getNetworkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Network request failed.";
}

const quietSupabaseFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    const response = new Response(
      JSON.stringify({
        message: getNetworkErrorMessage(error),
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );

    Object.defineProperty(response, "message", {
      value: getNetworkErrorMessage(error),
    });

    return response;
  }
};

export function createSupabaseClientAdapter(
  config: SupabaseClientConfig,
  storage: SupabaseAuthStorage,
): SupabaseClientAdapter {
  assertCanInitializeSupabase(config);

  const client = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage,
    },
    global: {
      fetch: quietSupabaseFetch,
    },
  });

  return {
    async createAnonymousUser(): Promise<SupabaseSession> {
      const { data, error } = await client.auth.signInAnonymously();

      if (error) {
        throw error;
      }

      if (!data.user?.id || !data.session?.access_token) {
        throw new Error("Anonymous study account was not created.");
      }

      return {
        userId: data.user.id,
        accessToken: data.session.access_token,
      };
    },
    async signOut(): Promise<void> {
      const { error } = await client.auth.signOut();

      if (error) {
        throw error;
      }
    },
    async upsert(table, payload, options): Promise<void> {
      const { error } = await client
        .from(table)
        .upsert(payload, { onConflict: options?.onConflict });

      if (error) {
        throw error;
      }
    },
    async insert(table, payload): Promise<void> {
      const { error } = await client.from(table).insert(payload);

      if (error) {
        throw error;
      }
    },
  };
}
