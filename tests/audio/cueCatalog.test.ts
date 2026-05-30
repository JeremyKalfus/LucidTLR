import { describe, expect, it } from "vitest";

import {
  DEFAULT_CUE_ID,
  MAX_BUILT_IN_CUE_DURATION_SECONDS,
  builtInCues,
  getBuiltInCue,
} from "@/src/audio/cueCatalog";

describe("built-in cue catalog", () => {
  it("defaults new users to harp flourish", () => {
    expect(DEFAULT_CUE_ID).toBe("harp-flourish");
    expect(getBuiltInCue(undefined).sourceFileName).toBe(
      "freesound_community-harp-flourish-6251.mp3",
    );
  });

  it("excludes the over-limit remembrance harp cue", () => {
    const sourceFileNames: string[] = builtInCues.map(
      (cue) => cue.sourceFileName,
    );

    expect(sourceFileNames).not.toContain(
      "freesound_community-remembrance-harp-72958.mp3",
    );
  });

  it("keeps every selectable built-in cue at or below the hard duration max", () => {
    expect(builtInCues.length).toBe(5);
    expect(
      builtInCues.every(
        (cue) => cue.durationSeconds <= MAX_BUILT_IN_CUE_DURATION_SECONDS,
      ),
    ).toBe(true);
  });
});
