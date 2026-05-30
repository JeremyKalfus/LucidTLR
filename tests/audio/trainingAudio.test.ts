import { describe, expect, it } from "vitest";

import { getBuiltInCue } from "@/src/audio/cueCatalog";
import {
  FINAL_LUCID_TRAINING_CUE_MARKER_MIDPOINTS_SECONDS,
  FINAL_LUCID_TRAINING_DURATION_SECONDS,
  buildTrainingCueSchedule,
} from "@/src/audio/trainingAudio";

describe("FINAL Lucid Training cue schedule", () => {
  it("centers cue overlays on each marker midpoint", () => {
    const cue = getBuiltInCue("harp-flourish");
    const schedule = buildTrainingCueSchedule(cue);

    expect(schedule).toHaveLength(17);
    expect(schedule[0]).toMatchObject({
      markerIndex: 0,
      markerMidpointSeconds: 111.672,
    });
    expect(schedule[0].cueStartSeconds).toBeCloseTo(
      111.672 - cue.durationSeconds / 2,
      6,
    );
  });

  it("does not alter the training bed timeline", () => {
    const schedule = buildTrainingCueSchedule(getBuiltInCue("dx-harp-c5"));
    const finalMarker =
      FINAL_LUCID_TRAINING_CUE_MARKER_MIDPOINTS_SECONDS[
        FINAL_LUCID_TRAINING_CUE_MARKER_MIDPOINTS_SECONDS.length - 1
      ];

    expect(finalMarker).toBe(1339.585);
    expect(FINAL_LUCID_TRAINING_DURATION_SECONDS).toBeCloseTo(1340.928753, 6);
    expect(schedule[schedule.length - 1].markerMidpointSeconds).toBe(finalMarker);
    expect(FINAL_LUCID_TRAINING_DURATION_SECONDS).toBeGreaterThan(finalMarker);
  });
});
