import { FINAL_LUCID_TRAINING_DURATION_SECONDS } from "@/src/audio/trainingAudio";
import type { NightSession } from "@/src/domain/types";

export const WATCH_MODE_SKIP_TRAINING_CONFIRM_COPY = {
  title: "Skip training?",
  message: "Tonight's cue timing stays the same.",
  confirm: "Skip Training",
} as const;

export interface WatchModeTrainingPlaybackState {
  visible: boolean;
  enabled: boolean;
  plannedTrainingEndAt?: string;
  elapsedSeconds: number;
  remainingSeconds: number;
  shouldStartPlayback: boolean;
  windowExpired: boolean;
}

function timestampMs(value: string | Date | number): number {
  if (typeof value === "number") {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return Date.parse(value);
}

function plannedTrainingEndMs(session: NightSession): number {
  return (
    Date.parse(session.startedAt) +
    FINAL_LUCID_TRAINING_DURATION_SECONDS * 1000
  );
}

export function formatWatchTrainingPlaybackTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainderSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainderSeconds).padStart(2, "0")}`;
}

export function watchSessionHasPhoneTrainingAudio(
  session: NightSession | null | undefined,
): session is NightSession {
  return (
    Boolean(session) &&
    session?.mode === "watch" &&
    session.sessionType === "tlr" &&
    session.guidedTrainingSkipped !== true
  );
}

export function getWatchModeTrainingPlaybackState(input: {
  session: NightSession | null | undefined;
  now: string | Date | number;
}): WatchModeTrainingPlaybackState {
  const { session } = input;
  const nowMs = timestampMs(input.now);

  if (!watchSessionHasPhoneTrainingAudio(session) || !Number.isFinite(nowMs)) {
    return {
      visible: false,
      enabled: false,
      elapsedSeconds: 0,
      remainingSeconds: 0,
      shouldStartPlayback: false,
      windowExpired: false,
    };
  }

  const plannedEndMs = plannedTrainingEndMs(session);
  const startMs = Date.parse(session.trainingStartedAt ?? session.startedAt);
  const hasTrainingEnded = Boolean(session.trainingEndedAt);
  const windowExpired = nowMs >= plannedEndMs;
  const elapsedSeconds = Math.max(0, (nowMs - startMs) / 1000);
  const remainingSeconds = Math.max(0, (plannedEndMs - nowMs) / 1000);

  return {
    visible: !hasTrainingEnded && !windowExpired,
    enabled: true,
    plannedTrainingEndAt: new Date(plannedEndMs).toISOString(),
    elapsedSeconds,
    remainingSeconds,
    shouldStartPlayback:
      !session.trainingStartedAt && !hasTrainingEnded && !windowExpired,
    windowExpired,
  };
}
