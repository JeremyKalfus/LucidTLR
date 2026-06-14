import * as Notifications from "expo-notifications";

import type { LocalDb } from "@/src/data/local/localDb";
import { getAppSetting, setAppSetting } from "@/src/data/local/repositories";

import {
  clampRealityCheckSettings,
  computeReminderTimestamps,
  DEFAULT_REALITY_CHECK_SETTINGS,
  realityCheckPromptForIndex,
  REALITY_CHECK_SETTINGS_KEY,
  type RealityCheckSettings,
} from "./realityCheckSchedule";

const REALITY_CHECK_NOTIFICATION_KIND = "reality_check";

let handlerConfigured = false;

/** Show reality-check reminders even when the app is foregrounded. */
export function configureRealityCheckNotificationHandler(): void {
  if (handlerConfigured) {
    return;
  }

  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function loadRealityCheckSettings(
  db: LocalDb,
): Promise<RealityCheckSettings> {
  const stored = await getAppSetting<Partial<RealityCheckSettings>>(
    db,
    REALITY_CHECK_SETTINGS_KEY,
  );

  return clampRealityCheckSettings(stored ?? DEFAULT_REALITY_CHECK_SETTINGS);
}

export async function saveRealityCheckSettings(
  db: LocalDb,
  settings: RealityCheckSettings,
  updatedAt: string,
): Promise<void> {
  await setAppSetting(
    db,
    REALITY_CHECK_SETTINGS_KEY,
    clampRealityCheckSettings(settings),
    updatedAt,
  );
}

export async function ensureRealityCheckPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();

  if (current.granted) {
    return true;
  }

  if (current.canAskAgain === false) {
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync();

  return requested.granted;
}

async function cancelRealityCheckReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  await Promise.all(
    scheduled
      .filter(
        (request) =>
          (request.content.data as { kind?: string } | null)?.kind ===
          REALITY_CHECK_NOTIFICATION_KIND,
      )
      .map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier),
      ),
  );
}

/**
 * Cancel any existing reality-check reminders and reschedule from the given
 * settings. Returns how many were scheduled and whether permission is granted.
 */
export async function rescheduleRealityCheckReminders(input: {
  settings: RealityCheckSettings;
  now?: Date;
  /** When false, only schedule if permission is already granted (no prompt). */
  requestPermission?: boolean;
}): Promise<{ scheduled: number; permissionGranted: boolean }> {
  const settings = clampRealityCheckSettings(input.settings);

  await cancelRealityCheckReminders();

  if (!settings.enabled) {
    return { scheduled: 0, permissionGranted: false };
  }

  const permissionGranted =
    input.requestPermission === false
      ? (await Notifications.getPermissionsAsync()).granted
      : await ensureRealityCheckPermission();

  if (!permissionGranted) {
    return { scheduled: 0, permissionGranted: false };
  }

  const timestamps = computeReminderTimestamps({
    settings,
    now: input.now ?? new Date(),
  });

  for (let index = 0; index < timestamps.length; index += 1) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Reality check",
        body: realityCheckPromptForIndex(index),
        data: { kind: REALITY_CHECK_NOTIFICATION_KIND },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: timestamps[index],
      },
    });
  }

  return { scheduled: timestamps.length, permissionGranted: true };
}
