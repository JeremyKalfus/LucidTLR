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
  upsert(table: string, payload: Record<string, unknown>): Promise<void>;
  insert(table: string, payload: Record<string, unknown>): Promise<void>;
}

export function assertCanInitializeSupabase(config: SupabaseClientConfig): void {
  if (!config.url || !config.anonKey) {
    throw new Error("Supabase URL and anon key are required for consented sync.");
  }
}
