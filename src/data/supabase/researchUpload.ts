import type { LocalDb } from "@/src/data/local/localDb";
import {
  deleteAppSettingsWithPrefix,
  getAppSetting,
  setAppSetting,
} from "@/src/data/local/repositories";
import {
  createSupabaseClientAdapter,
  getSupabaseConfigFromEnv,
  type SupabaseAuthStorage,
} from "./client";

const APP_VERSION = "0.1.0";
const SUPABASE_AUTH_SETTING_PREFIX = "supabase_auth:";
const SUPABASE_USER_ID_SETTING = "supabase_user_id";

function storageKey(key: string): string {
  return `${SUPABASE_AUTH_SETTING_PREFIX}${key}`;
}

export function createSupabaseSettingsStorage(
  db: LocalDb,
): SupabaseAuthStorage {
  return {
    async getItem(key): Promise<string | null> {
      const value = await getAppSetting<unknown>(db, storageKey(key));
      return typeof value === "string" ? value : null;
    },
    async setItem(key, value): Promise<void> {
      await setAppSetting(db, storageKey(key), value, new Date().toISOString());
    },
    async removeItem(key): Promise<void> {
      await deleteAppSettingsWithPrefix(db, storageKey(key));
    },
  };
}

export async function prepareAnonymousResearchUpload(input: {
  db: LocalDb;
  participantId: string;
  consentVersion: string;
  acceptedAt: string;
}): Promise<void> {
  const config = getSupabaseConfigFromEnv();

  if (!config) {
    throw new Error("Study upload is not configured for this build.");
  }

  const client = createSupabaseClientAdapter(
    config,
    createSupabaseSettingsStorage(input.db),
  );
  const session = await client.createAnonymousUser();

  await setAppSetting(
    input.db,
    SUPABASE_USER_ID_SETTING,
    session.userId,
    input.acceptedAt,
  );

  await client.upsert(
    "participants",
    {
      user_id: session.userId,
      participant_id: input.participantId,
      app_version: APP_VERSION,
      platform: null,
      structured_upload_enabled: true,
      dream_upload_enabled: false,
    },
    { onConflict: "participant_id" },
  );

  await client.insert("consents", {
    participant_id: input.participantId,
    consent_type: "structured_research_upload",
    consent_version: input.consentVersion,
    accepted_at: input.acceptedAt,
    app_version: APP_VERSION,
  });
}

export async function clearSupabaseSessionForLocalReset(
  db: LocalDb,
): Promise<void> {
  // TODO: implement full remote deletion if CNL/IRB scope requires it.
  // This reset is intentionally local-only, so avoid remote sign-out here.
  // Supabase's network sign-out can fail offline and should not block deletion
  // of local app data or navigation back to onboarding.
  await deleteAppSettingsWithPrefix(db, SUPABASE_AUTH_SETTING_PREFIX);
  await deleteAppSettingsWithPrefix(db, SUPABASE_USER_ID_SETTING);
}
