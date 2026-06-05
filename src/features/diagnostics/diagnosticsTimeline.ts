import type { LocalDb } from "@/src/data/local/localDb";
import type { NightSession } from "@/src/domain/types";
import type { EngineSnapshot } from "@/src/engine";
import type {
  NativePhoneRuntimeEvent,
  PhoneRuntimeStatus,
} from "@/src/native/phoneRuntime";
import type {
  WatchOwnedImportPayloadV2,
  WatchOwnedStatusV2,
} from "@/src/native/watch";

import { loadDiagnosticsRouteEvents } from "./diagnosticsRouteStore";

export const DIAGNOSTICS_TIMELINE_SCHEMA =
  "lucidcue-diagnostics-timeline-v1";
export const DEFAULT_DIAGNOSTICS_LOOKBACK_MINUTES = 60;

type RecentSessionRow = {
  id: string;
  participant_id: string;
  session_type: string;
  mode: string | null;
  status: string;
  protocol_version: string;
  started_at: string;
  ended_at: string | null;
  training_started_at: string | null;
  training_ended_at: string | null;
  cueing_started_at: string | null;
  selected_cue_id: string | null;
  guided_training_skipped: number;
};

type RecentWatchRuntimeEventRow = {
  id: string;
  session_id: string;
  timestamp: string;
  event_type: string;
  payload_json: string;
};

type RecentWatchEpochRow = {
  id: string;
  session_id: string;
  epoch_start: string;
  epoch_end: string;
  heart_rate_summary: number | null;
  motion_summary: number | null;
  sensor_quality: string | null;
  rem_probability: number | null;
  rem_label: string | null;
  classifier_version: string | null;
  watch_battery_level: number | null;
  watch_connectivity_state: string | null;
  cue_decision_reason: string | null;
  sample_counts_json: string | null;
  epoch_features_json: string | null;
};

type RecentCueEventRow = {
  id: string;
  session_id: string;
  timestamp: string;
  cue_id: string;
  volume_level: number;
  delivery_device: string;
  played: number;
  suppression_reason: string;
};

type RecentMovementEventRow = {
  id: string;
  session_id: string;
  timestamp: string;
  source: string;
  intensity: number | null;
  was_cue_associated: number;
  pause_started_at: string | null;
  pause_ended_at: string | null;
};

export type DiagnosticsTimelineEvent = {
  timestamp: string;
  source:
    | "phone_ui"
    | "phone_runtime"
    | "session"
    | "watch_runtime"
    | "watch_epoch"
    | "cue_event"
    | "movement_event"
    | "live_status"
    | "native_watch_import";
  kind: string;
  sessionId?: string;
  label: string;
  payload: Record<string, unknown>;
};

export type DiagnosticsTimelineExport = {
  exportSchema: typeof DIAGNOSTICS_TIMELINE_SCHEMA;
  exportedAt: string;
  window: {
    startsAt: string;
    endsAt: string;
    lookbackMinutes: number;
  };
  app: {
    participantId: string;
    selectedMode: string;
    activeSession: NightSession | null;
    sessionHistoryCount: number;
    engineStatus: string;
    latestDecisionReason: string;
  };
  liveStatus: {
    phoneRuntimeStatus: PhoneRuntimeStatus | null;
    watchOwnedStatus: WatchOwnedStatusV2 | null;
    pendingNativeWatchImport: PendingNativeWatchImportSnapshot | null;
  };
  counts: Record<string, number>;
  timeline: DiagnosticsTimelineEvent[];
};

export type PendingNativeWatchImportSnapshot = {
  sessionId: string;
  complete: boolean;
  epochCount: number;
  cueDeliveryCount: number;
  runtimeEventCount: number;
  summary?: WatchOwnedImportPayloadV2["summary"];
  error?: string;
};

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { raw: value, parseError: true };
  }
}

function isFiniteTime(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function eventTimeMs(event: DiagnosticsTimelineEvent): number {
  const timestampMs = Date.parse(event.timestamp);

  return Number.isFinite(timestampMs) ? timestampMs : 0;
}

function sessionEvent(
  session: RecentSessionRow,
  timestamp: string,
  kind: string,
): DiagnosticsTimelineEvent {
  return {
    timestamp,
    source: "session",
    kind,
    sessionId: session.id,
    label: `${session.mode ?? "unknown"} ${session.session_type} ${kind}`,
    payload: {
      sessionId: session.id,
      participantId: session.participant_id,
      sessionType: session.session_type,
      mode: session.mode,
      status: session.status,
      protocolVersion: session.protocol_version,
      selectedCueId: session.selected_cue_id,
      guidedTrainingSkipped: session.guided_training_skipped === 1,
    },
  };
}

function pushSessionEvents(
  events: DiagnosticsTimelineEvent[],
  session: RecentSessionRow,
): void {
  const sessionTimestamps = [
    ["session_started", session.started_at],
    ["training_started", session.training_started_at],
    ["training_ended", session.training_ended_at],
    ["cueing_started", session.cueing_started_at],
    ["session_ended", session.ended_at],
  ] as const;

  for (const [kind, timestamp] of sessionTimestamps) {
    if (isFiniteTime(timestamp)) {
      events.push(sessionEvent(session, timestamp, kind));
    }
  }
}

function countBySource(events: DiagnosticsTimelineEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of events) {
    counts[event.source] = (counts[event.source] ?? 0) + 1;
  }

  return counts;
}

export function summarizePendingNativeWatchImport(input: {
  sessionId: string;
  payload?: WatchOwnedImportPayloadV2;
  complete?: boolean;
  error?: string;
}): PendingNativeWatchImportSnapshot {
  return {
    sessionId: input.sessionId,
    complete: input.complete ?? false,
    epochCount: input.payload?.epochs.length ?? 0,
    cueDeliveryCount: input.payload?.cueDeliveries.length ?? 0,
    runtimeEventCount: input.payload?.runtimeEvents?.length ?? 0,
    summary: input.payload?.summary,
    error: input.error,
  };
}

export async function buildDiagnosticsTimeline(input: {
  db: LocalDb;
  participantId: string;
  selectedMode: string;
  activeSession: NightSession | null;
  sessionHistory: NightSession[];
  latestEngineSnapshot: EngineSnapshot;
  phoneRuntimeStatus: PhoneRuntimeStatus | null;
  watchOwnedStatus: WatchOwnedStatusV2 | null;
  pendingNativeWatchImport: PendingNativeWatchImportSnapshot | null;
  nativePhoneRuntimeLogs: Record<string, NativePhoneRuntimeEvent[]>;
  now?: string;
  lookbackMinutes?: number;
}): Promise<DiagnosticsTimelineExport> {
  const exportedAt = input.now ?? new Date().toISOString();
  const lookbackMinutes =
    input.lookbackMinutes ?? DEFAULT_DIAGNOSTICS_LOOKBACK_MINUTES;
  const windowStartMs = Date.parse(exportedAt) - lookbackMinutes * 60 * 1000;
  const startsAt = new Date(windowStartMs).toISOString();
  const events: DiagnosticsTimelineEvent[] = [];
  const [
    routeEvents,
    sessions,
    watchRuntimeEvents,
    watchEpochs,
    cueEvents,
    movementEvents,
  ] = await Promise.all([
    loadDiagnosticsRouteEvents(input.db),
    input.db.query<RecentSessionRow>(
      `select id,
  participant_id,
  session_type,
  mode,
  status,
  protocol_version,
  started_at,
  ended_at,
  training_started_at,
  training_ended_at,
  cueing_started_at,
  selected_cue_id,
  guided_training_skipped
from sessions
where started_at >= ?
   or ended_at >= ?
   or training_started_at >= ?
   or training_ended_at >= ?
   or cueing_started_at >= ?
   or ended_at is null
order by started_at asc`,
      [startsAt, startsAt, startsAt, startsAt, startsAt],
    ),
    input.db.query<RecentWatchRuntimeEventRow>(
      `select id,
  session_id,
  timestamp,
  event_type,
  payload_json
from watch_runtime_events
where timestamp >= ?
order by timestamp asc`,
      [startsAt],
    ),
    input.db.query<RecentWatchEpochRow>(
      `select id,
  session_id,
  epoch_start,
  epoch_end,
  heart_rate_summary,
  motion_summary,
  sensor_quality,
  rem_probability,
  rem_label,
  classifier_version,
  watch_battery_level,
  watch_connectivity_state,
  cue_decision_reason,
  sample_counts_json,
  epoch_features_json
from watch_epochs
where epoch_end >= ?
order by epoch_start asc`,
      [startsAt],
    ),
    input.db.query<RecentCueEventRow>(
      `select id,
  session_id,
  timestamp,
  cue_id,
  volume_level,
  delivery_device,
  played,
  suppression_reason
from cue_events
where timestamp >= ?
order by timestamp asc`,
      [startsAt],
    ),
    input.db.query<RecentMovementEventRow>(
      `select id,
  session_id,
  timestamp,
  source,
  intensity,
  was_cue_associated,
  pause_started_at,
  pause_ended_at
from movement_events
where timestamp >= ?
   or pause_started_at >= ?
   or pause_ended_at >= ?
order by timestamp asc`,
      [startsAt, startsAt, startsAt],
    ),
  ]);

  for (const routeEvent of routeEvents) {
    if (Date.parse(routeEvent.timestamp) >= windowStartMs) {
      events.push({
        timestamp: routeEvent.timestamp,
        source: "phone_ui",
        kind: routeEvent.reason,
        label: `${routeEvent.pathname} / ${routeEvent.appState}`,
        payload: routeEvent,
      });
    }
  }

  for (const session of sessions) {
    pushSessionEvents(events, session);
  }

  for (const event of watchRuntimeEvents) {
    events.push({
      timestamp: event.timestamp,
      source: "watch_runtime",
      kind: event.event_type,
      sessionId: event.session_id,
      label: event.event_type,
      payload: {
        id: event.id,
        ...parseJsonObject(event.payload_json),
      },
    });
  }

  for (const epoch of watchEpochs) {
    events.push({
      timestamp: epoch.epoch_end,
      source: "watch_epoch",
      kind: "watch_epoch",
      sessionId: epoch.session_id,
      label: `epoch ${epoch.epoch_start} - ${epoch.epoch_end}`,
      payload: {
        id: epoch.id,
        epochStart: epoch.epoch_start,
        epochEnd: epoch.epoch_end,
        heartRateSummary: epoch.heart_rate_summary,
        motionSummary: epoch.motion_summary,
        sensorQuality: epoch.sensor_quality,
        remProbability: epoch.rem_probability,
        remLabel: epoch.rem_label,
        classifierVersion: epoch.classifier_version,
        watchBatteryLevel: epoch.watch_battery_level,
        watchConnectivityState: epoch.watch_connectivity_state,
        cueDecisionReason: epoch.cue_decision_reason,
        sampleCounts: epoch.sample_counts_json
          ? parseJsonObject(epoch.sample_counts_json)
          : null,
        epochFeatures: epoch.epoch_features_json
          ? parseJsonObject(epoch.epoch_features_json)
          : null,
      },
    });
  }

  for (const cue of cueEvents) {
    events.push({
      timestamp: cue.timestamp,
      source: "cue_event",
      kind: cue.played === 1 ? "cue_played" : "cue_not_played",
      sessionId: cue.session_id,
      label: `${cue.delivery_device} ${cue.cue_id}`,
      payload: {
        id: cue.id,
        cueId: cue.cue_id,
        volumeLevel: cue.volume_level,
        deliveryDevice: cue.delivery_device,
        played: cue.played === 1,
        suppressionReason: cue.suppression_reason,
      },
    });
  }

  for (const movement of movementEvents) {
    events.push({
      timestamp: movement.timestamp,
      source: "movement_event",
      kind: "movement_event",
      sessionId: movement.session_id,
      label: `${movement.source} movement`,
      payload: {
        id: movement.id,
        source: movement.source,
        intensity: movement.intensity,
        wasCueAssociated: movement.was_cue_associated === 1,
        pauseStartedAt: movement.pause_started_at,
        pauseEndedAt: movement.pause_ended_at,
      },
    });
  }

  for (const [sessionId, logs] of Object.entries(input.nativePhoneRuntimeLogs)) {
    for (const log of logs) {
      if (Date.parse(log.timestamp) < windowStartMs) {
        continue;
      }

      events.push({
        timestamp: log.timestamp,
        source: "phone_runtime",
        kind: log.eventType,
        sessionId,
        label: log.eventType,
        payload: {
          id: log.id,
          ...log.payload,
        },
      });
    }
  }

  events.push({
    timestamp: exportedAt,
    source: "live_status",
    kind: "live_phone_runtime_status",
    sessionId: input.phoneRuntimeStatus?.sessionId,
    label: input.phoneRuntimeStatus
      ? input.phoneRuntimeStatus.available
        ? input.phoneRuntimeStatus.running
          ? "phone runtime running"
          : "phone runtime idle"
        : "phone runtime unavailable"
      : "phone runtime not queried",
    payload: (input.phoneRuntimeStatus ?? {}) as Record<string, unknown>,
  });

  events.push({
    timestamp: exportedAt,
    source: "live_status",
    kind: "live_watch_owned_status",
    sessionId: input.watchOwnedStatus?.sessionId,
    label: input.watchOwnedStatus
      ? `watch ${input.watchOwnedStatus.state}`
      : "watch status not queried",
    payload: (input.watchOwnedStatus ?? {}) as Record<string, unknown>,
  });

  if (input.pendingNativeWatchImport) {
    events.push({
      timestamp: exportedAt,
      source: "native_watch_import",
      kind: input.pendingNativeWatchImport.complete
        ? "native_watch_import_complete"
        : "native_watch_import_incomplete",
      sessionId: input.pendingNativeWatchImport.sessionId,
      label: input.pendingNativeWatchImport.complete
        ? "native Watch import complete"
        : "native Watch import incomplete",
      payload: input.pendingNativeWatchImport as unknown as Record<string, unknown>,
    });
  }

  const sortedEvents = events.sort((a, b) => eventTimeMs(a) - eventTimeMs(b));

  return {
    exportSchema: DIAGNOSTICS_TIMELINE_SCHEMA,
    exportedAt,
    window: {
      startsAt,
      endsAt: exportedAt,
      lookbackMinutes,
    },
    app: {
      participantId: input.participantId,
      selectedMode: input.selectedMode,
      activeSession: input.activeSession,
      sessionHistoryCount: input.sessionHistory.length,
      engineStatus: input.latestEngineSnapshot.sessionStatus,
      latestDecisionReason:
        input.latestEngineSnapshot.currentValues.latestDecisionReason,
    },
    liveStatus: {
      phoneRuntimeStatus: input.phoneRuntimeStatus,
      watchOwnedStatus: input.watchOwnedStatus,
      pendingNativeWatchImport: input.pendingNativeWatchImport,
    },
    counts: countBySource(sortedEvents),
    timeline: sortedEvents,
  };
}
