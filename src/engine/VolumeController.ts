import type { CueDecisionContext, VolumeState } from "./CueDecisionTypes";
import { clamp } from "./CueDecisionTypes";

export function buildVolumeState(context: CueDecisionContext): VolumeState {
  const {
    cueHistory,
    settings,
    userFeedback: {
      cueIncorporatedIntoDream,
      lucidDreamReported,
    },
  } = context;
  const successCap =
    cueIncorporatedIntoDream || lucidDreamReported
      ? cueHistory.lastSuccessfulCueVolume
      : undefined;
  const awakeningCap = cueHistory.lastAwakeningCueVolume;
  const cap = Math.min(
    settings.volumeCap,
    successCap ?? settings.volumeCap,
    awakeningCap ?? settings.volumeCap,
  );
  const nextCueVolumeLevel = clamp(
    settings.volumeStartLevel +
      settings.volumeRampPerCue * cueHistory.numberOfCuesTonight,
    settings.volumeStartLevel,
    cap,
  );

  return {
    currentVolumeLevel: cueHistory.latestVolumeLevel ?? settings.volumeStartLevel,
    nextCueVolumeLevel,
    startLevel: settings.volumeStartLevel,
    rampPerCue: settings.volumeRampPerCue,
    cap,
    lastSuccessfulCueVolume: cueHistory.lastSuccessfulCueVolume,
    lastAwakeningCueVolume: cueHistory.lastAwakeningCueVolume,
  };
}
