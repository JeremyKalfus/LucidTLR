import { describe, expect, it } from "vitest";

import type { ConsentState } from "@/src/domain/types";
import { canUploadEntity } from "@/src/data/supabase/uploadPolicy";

const optedIn: ConsentState = {
  structuredResearchUploadAccepted: true,
  structuredResearchUploadWithdrawn: false,
  dreamJournalUploadAccepted: false,
  dreamJournalUploadWithdrawn: false,
};

describe("uploadPolicy", () => {
  it("does not treat study opt-in as sleep-history upload consent", () => {
    expect(canUploadEntity("session", optedIn)).toBe(true);
    expect(canUploadEntity("external_sleep_session", optedIn)).toBe(false);
    expect(canUploadEntity("external_sleep_stage_segment", optedIn)).toBe(false);
    expect(canUploadEntity("sleep_prior_profile", optedIn)).toBe(false);
  });
});
