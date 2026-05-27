export const TLR_PROTOCOL_VERSION = "tlr-2026-001";

export const cueAudio = {
  defaultCueId: "soft-harp-3s",
  durationSeconds: 3,
  description: "3-second soft harp/melodic cue with fade-in/fade-out",
} as const;

export const presleepTraining = {
  scriptStatus: "placeholder_requires_cnl_approval",
  nightOneGuidedCueRepetitions: 4,
  cueOnlyIntervalsSeconds: [45, 70, 55, 65, 70, 80, 65, 60, 75, 75, 90, 120],
  laterNightGuidedCueRepetitions: 1,
} as const;

export const phoneCueing = {
  cueStartDelayHoursAfterTraining: 6,
  cueIntervalRangeSeconds: [20, 40],
  standardMovementPauseSeconds: 60,
  cueAssociatedMovementWindowSeconds: 30,
  cueAssociatedMovementPauseSeconds: 180,
  userReportedAwakeningPauseSeconds: 45 * 60,
  defaultVolumeRampPerCuePercent: 0.16,
  slowVolumeRampPerCuePercent: 0.08,
} as const;

export const watchCueing = {
  epochSeconds: 30,
  consecutiveLikelyRemSuppressionThreshold: 5,
  standardMovementPauseSeconds: 60,
  cueAssociatedMovementWindowSeconds: 30,
  cueAssociatedMovementPauseSeconds: 180,
} as const;

export const remClassifier = {
  status: "to_be_decided",
} as const;

export const PRESLEEP_SCRIPT_PLACEHOLDER = `
When you hear this sound, bring your attention to your current experience.

Notice your thoughts. Notice where your mind has wandered.

Notice your body, your sensations, and your breathing.

Now inspect your experience carefully. Ask whether anything about this moment is unusual, unstable, or different from normal waking experience.

When you hear this sound later tonight, let it remind you to become lucid: to recognize that you may be dreaming while the dream continues.
`;

export const PRESLEEP_SCRIPT_NOTICE =
  "Not final / requires CNL approval before production use.";
