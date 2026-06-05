import type { LocalDb } from "@/src/data/local/localDb";
import { getAppSetting, setAppSetting } from "@/src/data/local/repositories";

export const DIAGNOSTICS_ROUTE_EVENTS_SETTING =
  "diagnostics_route_events_v1";

export type DiagnosticsRouteEvent = {
  id: string;
  timestamp: string;
  pathname: string;
  appState: string;
  reason: "route_change" | "app_state_change";
};

const MAX_ROUTE_EVENTS = 240;
const ROUTE_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;

function createRouteEventId(input: {
  timestamp: string;
  pathname: string;
  reason: DiagnosticsRouteEvent["reason"];
}): string {
  return [
    "route",
    input.timestamp,
    input.reason,
    input.pathname.replace(/[^a-zA-Z0-9._/-]/g, "_"),
  ].join(":");
}

export async function loadDiagnosticsRouteEvents(
  db: LocalDb,
): Promise<DiagnosticsRouteEvent[]> {
  return (
    (await getAppSetting<DiagnosticsRouteEvent[]>(
      db,
      DIAGNOSTICS_ROUTE_EVENTS_SETTING,
    )) ?? []
  );
}

export async function recordDiagnosticsRouteEvent(input: {
  db: LocalDb;
  pathname: string;
  appState: string;
  reason: DiagnosticsRouteEvent["reason"];
  timestamp?: string;
}): Promise<void> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const cutoffMs = Date.parse(timestamp) - ROUTE_EVENT_RETENTION_MS;
  const event: DiagnosticsRouteEvent = {
    id: createRouteEventId({
      timestamp,
      pathname: input.pathname,
      reason: input.reason,
    }),
    timestamp,
    pathname: input.pathname,
    appState: input.appState,
    reason: input.reason,
  };
  const existing = await loadDiagnosticsRouteEvents(input.db);
  const next = [...existing, event]
    .filter((candidate) => {
      const candidateMs = Date.parse(candidate.timestamp);

      return Number.isFinite(candidateMs) && candidateMs >= cutoffMs;
    })
    .slice(-MAX_ROUTE_EVENTS);

  await setAppSetting(
    input.db,
    DIAGNOSTICS_ROUTE_EVENTS_SETTING,
    next,
    timestamp,
  );
}
