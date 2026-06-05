export const WATCH_MODE_ENABLED = false;

export const WATCH_MODE_DISABLED_STATUS = "planned_rebuild";

export const WATCH_MODE_DISABLED_TITLE = "Watch Mode is being rebuilt";

export const WATCH_MODE_DISABLED_MESSAGE =
  "Watch Mode is visible as a planned option, but it cannot start a night in this build. Use Phone Mode for tonight.";

export function isWatchModeAvailable(): boolean {
  return WATCH_MODE_ENABLED;
}

