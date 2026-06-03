import type {
  AlarmOptions,
  BackgroundNoiseOption,
  TlrOptions,
} from "@/src/domain/types";
import { DEFAULT_CUE_ID, normalizeCueId } from "@/src/audio/cueCatalog";

export const TLR_OPTIONS_KEY = "tlr_options_v1";
export const DEFAULT_ALARM_RING_DURATION_MINUTES = 5;
export const DEFAULT_ALARM_VOLUME = 0.72;
export const BACKGROUND_AUDIO_VOLUME = 0.035;
export const BINAURAL_CARRIER_FREQUENCY_HZ = 200;
export const BINAURAL_BEAT_FREQUENCY_HZ = 4;

export const backgroundNoiseOptions: Array<{
  value: BackgroundNoiseOption;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "white_noise", label: "White noise" },
  { value: "binaural_beats", label: "Binaural beats (headphones)" },
];

export type TlrOptionsPatch = Partial<Omit<TlrOptions, "alarm">> & {
  alarm?: Partial<AlarmOptions>;
};

type PersistedTlrOptions = Partial<Omit<TlrOptions, "alarm">> & {
  alarm?: Partial<AlarmOptions>;
};

function isBackgroundNoiseOption(
  value: unknown,
): value is BackgroundNoiseOption {
  return (
    value === "none" ||
    value === "white_noise" ||
    value === "binaural_beats"
  );
}

export function normalizeAlarmTime(
  value: unknown,
  fallback = "07:00",
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return fallback;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function createDefaultTlrOptions(
  typicalWakeTime = "07:00",
): TlrOptions {
  return {
    selectedCueId: DEFAULT_CUE_ID,
    backgroundNoise: "none",
    watchAudioCueEnabled: true,
    watchHapticCueEnabled: true,
    skipGuidedTraining: false,
    requireAccelerometer: true,
    alarm: {
      enabled: false,
      time: normalizeAlarmTime(typicalWakeTime),
      autoShutoff: true,
      ringDurationMinutes: DEFAULT_ALARM_RING_DURATION_MINUTES,
    },
  };
}

export function normalizeTlrOptions(
  value: PersistedTlrOptions | null | undefined,
  typicalWakeTime = "07:00",
): TlrOptions {
  const defaults = createDefaultTlrOptions(typicalWakeTime);
  const alarm = value?.alarm ?? {};
  const ringDurationMinutes =
    typeof alarm.ringDurationMinutes === "number" &&
    Number.isFinite(alarm.ringDurationMinutes)
      ? alarm.ringDurationMinutes
      : defaults.alarm.ringDurationMinutes;

  return {
    selectedCueId: normalizeCueId(value?.selectedCueId),
    backgroundNoise: isBackgroundNoiseOption(value?.backgroundNoise)
      ? value.backgroundNoise
      : defaults.backgroundNoise,
    watchAudioCueEnabled: value?.watchAudioCueEnabled !== false,
    watchHapticCueEnabled: value?.watchHapticCueEnabled !== false,
    skipGuidedTraining: value?.skipGuidedTraining === true,
    requireAccelerometer: value?.requireAccelerometer !== false,
    alarm: {
      enabled: alarm.enabled === true,
      time: normalizeAlarmTime(alarm.time, defaults.alarm.time),
      autoShutoff: alarm.autoShutoff !== false,
      ringDurationMinutes: Math.min(
        60,
        Math.max(1, Math.round(ringDurationMinutes)),
      ),
    },
  };
}

export function mergeTlrOptionsPatch(
  current: TlrOptions,
  patch: TlrOptionsPatch,
  typicalWakeTime = "07:00",
): TlrOptions {
  return normalizeTlrOptions(
    {
      ...current,
      ...patch,
      alarm: {
        ...current.alarm,
        ...patch.alarm,
      },
    },
    typicalWakeTime,
  );
}

export function formatBackgroundNoiseOption(
  value: BackgroundNoiseOption,
): string {
  return (
    backgroundNoiseOptions.find((option) => option.value === value)?.label ??
    "None"
  );
}

export function resolveAlarmFireAt(input: {
  alarmTime: string;
  after: string;
}): string {
  const [hourText, minuteText] = normalizeAlarmTime(input.alarmTime).split(":");
  const afterDate = new Date(input.after);
  const candidate = new Date(afterDate);

  candidate.setHours(Number(hourText), Number(minuteText), 0, 0);

  if (candidate.getTime() <= afterDate.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate.toISOString();
}
