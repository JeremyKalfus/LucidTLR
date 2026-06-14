// Pure reality-check scheduling logic. No native imports so it stays unit
// testable; the expo-notifications side lives in realityCheckNotifications.ts.

export const REALITY_CHECK_SETTINGS_KEY = "reality_check_settings_v1";

export const REALITY_CHECK_MIN_REMINDERS = 1;
export const REALITY_CHECK_MAX_REMINDERS = 12;
const REALITY_CHECK_DEFAULT_DAYS_AHEAD = 3;

export interface RealityCheckSettings {
  enabled: boolean;
  /** Local "HH:MM" 24h start of the active reminder window. */
  startTime: string;
  /** Local "HH:MM" 24h end of the active reminder window. */
  endTime: string;
  remindersPerDay: number;
}

export const DEFAULT_REALITY_CHECK_SETTINGS: RealityCheckSettings = {
  enabled: false,
  startTime: "10:00",
  endTime: "22:00",
  remindersPerDay: 5,
};

export const REALITY_CHECK_PROMPTS: readonly string[] = [
  "Are you dreaming? Do a reality check.",
  "Reality check — count your fingers. Do you have the right number?",
  "Reality check — pinch your nose. Can you still breathe?",
  "Reality check — read this twice. Did the words change?",
  "Reality check — push a finger into your palm. Does it pass through?",
  "Reality check — look at a clock, look away, look back. Is it stable?",
];

export function realityCheckPromptForIndex(index: number): string {
  return REALITY_CHECK_PROMPTS[index % REALITY_CHECK_PROMPTS.length];
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function parseHHMM(
  value: string,
): { hours: number; minutes: number } | null {
  if (!isValidHHMM(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":");

  return { hours: Number(hours), minutes: Number(minutes) };
}

export function clampRealityCheckSettings(
  raw: Partial<RealityCheckSettings> | null | undefined,
): RealityCheckSettings {
  return {
    enabled: raw?.enabled === true,
    startTime: isValidHHMM(raw?.startTime)
      ? raw.startTime
      : DEFAULT_REALITY_CHECK_SETTINGS.startTime,
    endTime: isValidHHMM(raw?.endTime)
      ? raw.endTime
      : DEFAULT_REALITY_CHECK_SETTINGS.endTime,
    remindersPerDay: clampInt(
      raw?.remindersPerDay ?? DEFAULT_REALITY_CHECK_SETTINGS.remindersPerDay,
      REALITY_CHECK_MIN_REMINDERS,
      REALITY_CHECK_MAX_REMINDERS,
    ),
  };
}

function minutesOfDay(time: { hours: number; minutes: number }): number {
  return time.hours * 60 + time.minutes;
}

/**
 * Compute the future reminder times across the next `daysAhead` days. The
 * active window is split into `remindersPerDay` even slots and one random
 * time is chosen within each slot, so reminders are spaced but unpredictable.
 * Only times strictly after `now` are returned.
 */
export function computeReminderTimestamps(input: {
  settings: RealityCheckSettings;
  now: Date;
  daysAhead?: number;
  random?: () => number;
}): Date[] {
  const settings = clampRealityCheckSettings(input.settings);
  const daysAhead = input.daysAhead ?? REALITY_CHECK_DEFAULT_DAYS_AHEAD;
  const random = input.random ?? Math.random;
  const start = parseHHMM(settings.startTime);
  const end = parseHHMM(settings.endTime);

  if (!settings.enabled || !start || !end) {
    return [];
  }

  const startMinutes = minutesOfDay(start);
  const endMinutes = minutesOfDay(end);

  if (endMinutes <= startMinutes) {
    return [];
  }

  const windowMinutes = endMinutes - startMinutes;
  const slotMinutes = windowMinutes / settings.remindersPerDay;
  const nowMs = input.now.getTime();
  const results: Date[] = [];

  for (let day = 0; day < daysAhead; day += 1) {
    const dayStart = new Date(input.now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() + day);

    for (let slot = 0; slot < settings.remindersPerDay; slot += 1) {
      const offsetMinutes = startMinutes + slotMinutes * (slot + random());
      const at = new Date(dayStart);
      at.setMinutes(Math.floor(offsetMinutes), 0, 0);

      if (at.getTime() > nowMs) {
        results.push(at);
      }
    }
  }

  return results.sort((left, right) => left.getTime() - right.getTime());
}
