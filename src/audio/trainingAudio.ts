import type { BuiltInCue } from "./cueCatalog";

export const FINAL_LUCID_TRAINING_DURATION_SECONDS = 1340.928753;

export const FINAL_LUCID_TRAINING_CUE_MARKER_MIDPOINTS_SECONDS = [
  111.672,
  174.824,
  239.56,
  303.12,
  365.858,
  514.734,
  584.701,
  639.227,
  706.088,
  774.583,
  855.086,
  920.085,
  980.585,
  1054.585,
  1129.585,
  1219.585,
  1339.585,
] as const;

export type TrainingCueScheduleEntry = {
  markerIndex: number;
  markerMidpointSeconds: number;
  cueStartSeconds: number;
};

export function buildTrainingCueSchedule(
  cue: Pick<BuiltInCue, "durationSeconds">,
): TrainingCueScheduleEntry[] {
  return FINAL_LUCID_TRAINING_CUE_MARKER_MIDPOINTS_SECONDS.map(
    (markerMidpointSeconds, markerIndex) => ({
      markerIndex,
      markerMidpointSeconds,
      cueStartSeconds: Math.max(
        0,
        markerMidpointSeconds - cue.durationSeconds / 2,
      ),
    }),
  );
}
