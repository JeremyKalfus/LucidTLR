import { describe, expect, it } from "vitest";

import type { LocalDb } from "@/src/data/local/localDb";
import type { NightSession } from "@/src/domain/types";
import type { EngineSnapshot } from "@/src/engine";
import {
  DIAGNOSTICS_TIMELINE_SCHEMA,
  buildDiagnosticsTimeline,
} from "@/src/features/diagnostics/diagnosticsTimeline";
import {
  DIAGNOSTICS_ROUTE_EVENTS_SETTING,
  type DiagnosticsRouteEvent,
} from "@/src/features/diagnostics/diagnosticsRouteStore";
import type { NativePhoneRuntimeEvent } from "@/src/native/phoneRuntime";

class FakeDiagnosticsDb implements LocalDb {
  constructor(
    private readonly tables: Record<string, Record<string, unknown>[]> = {},
    private readonly settings: Record<string, unknown> = {},
  ) {}

  async execute(): Promise<void> {}

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes("from sessions")) {
      return (this.tables.sessions ?? []) as T[];
    }

    if (sql.includes("from watch_runtime_events")) {
      return (this.tables.watch_runtime_events ?? []) as T[];
    }

    if (sql.includes("from watch_epochs")) {
      return (this.tables.watch_epochs ?? []) as T[];
    }

    if (sql.includes("from cue_events")) {
      return (this.tables.cue_events ?? []) as T[];
    }

    if (sql.includes("from movement_events")) {
      return (this.tables.movement_events ?? []) as T[];
    }

    if (sql.includes("from watch_session_sync_states")) {
      return (this.tables.watch_session_sync_states ?? []) as T[];
    }

    return [];
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (sql.includes("from app_settings")) {
      const value = this.settings[String(params[0])];

      return value === undefined
        ? null
        : ({ value_json: JSON.stringify(value) } as T);
    }

    return null;
  }
}

function session(overrides: Partial<NightSession> = {}): NightSession {
  return {
    id: "watch-session-1",
    participantId: "participant-1",
    sessionType: "tlr",
    mode: "watch",
    status: "ended",
    protocolVersion: "tlr-protocol-2026-001",
    startedAt: "2026-06-03T14:15:00.000Z",
    endedAt: "2026-06-03T14:50:00.000Z",
    selectedCueId: "harp-flourish",
    guidedTrainingSkipped: false,
    ...overrides,
  };
}

describe("diagnostics timeline", () => {
  it("builds a recent Watch/session/sync timeline from local and live sources", async () => {
    const routeEvents: DiagnosticsRouteEvent[] = [
      {
        id: "route-1",
        timestamp: "2026-06-03T14:45:00.000Z",
        pathname: "/morning-review",
        appState: "active",
        reason: "route_change",
      },
    ];
    const phoneRuntimeLog: NativePhoneRuntimeEvent = {
      id: "phone-log-1",
      sessionId: "phone-session-1",
      timestamp: "2026-06-03T14:46:00.000Z",
      eventType: "runtime_error",
      payload: { reason: "diagnostic_sample" },
    };
    const db = new FakeDiagnosticsDb(
      {
        sessions: [
          {
            id: "watch-session-1",
            participant_id: "participant-1",
            session_type: "tlr",
            mode: "watch",
            status: "ended",
            protocol_version: "tlr-protocol-2026-001",
            started_at: "2026-06-03T14:15:00.000Z",
            ended_at: "2026-06-03T14:50:00.000Z",
            training_started_at: "2026-06-03T14:15:00.000Z",
            training_ended_at: "2026-06-03T14:37:20.000Z",
            cueing_started_at: "2026-06-03T14:37:20.000Z",
            selected_cue_id: "harp-flourish",
            guided_training_skipped: 0,
          },
        ],
        watch_runtime_events: [
          {
            id: "watch-event-1",
            session_id: "watch-session-1",
            timestamp: "2026-06-03T14:37:20.000Z",
            event_type: "watch_training_completed",
            payload_json: JSON.stringify({ reason: "training_audio_finished" }),
          },
        ],
        watch_epochs: [
          {
            id: "epoch-1",
            session_id: "watch-session-1",
            epoch_start: "2026-06-03T14:38:00.000Z",
            epoch_end: "2026-06-03T14:38:30.000Z",
            heart_rate_summary: 62,
            motion_summary: 0.01,
            sensor_quality: "good",
            rem_probability: 0.7,
            rem_label: "likely_rem",
            classifier_version: "historical-watch-rem",
            watch_battery_level: 0.8,
            watch_connectivity_state: "delayed",
            cue_decision_reason: "watch_likely_rem",
            sample_counts_json: JSON.stringify({ heartRate: 1, motion: 900 }),
            epoch_features_json: JSON.stringify({ motionMean: 0.01 }),
          },
        ],
        cue_events: [],
        movement_events: [],
      },
      {
        [DIAGNOSTICS_ROUTE_EVENTS_SETTING]: routeEvents,
      },
    );
    const payload = await buildDiagnosticsTimeline({
      db,
      participantId: "participant-1",
      selectedMode: "watch",
      activeSession: session(),
      sessionHistory: [session()],
      latestEngineSnapshot: {
        sessionStatus: "ended",
        currentValues: {
          latestDecisionReason: "watch_mode_disabled",
        },
      } as unknown as EngineSnapshot,
      phoneRuntimeStatus: {
        available: true,
        running: false,
        audioBedRunning: false,
        backgroundAudioRunning: false,
        alarmRinging: false,
        motionRunning: false,
        cueCount: 0,
        cuesInBlock: 0,
        tlrPaused: false,
      },
      pendingNativeWatchImport: null,
      nativePhoneRuntimeLogs: {
        "phone-session-1": [phoneRuntimeLog],
      },
      now: "2026-06-03T15:00:00.000Z",
    });

    expect(payload.exportSchema).toBe(DIAGNOSTICS_TIMELINE_SCHEMA);
    expect(payload.window.lookbackMinutes).toBe(60);
    expect(payload.timeline.map((event) => event.source)).toContain("phone_ui");
    expect(payload.timeline.map((event) => event.source)).toContain(
      "watch_runtime",
    );
    expect(payload.timeline.map((event) => event.source)).toContain("watch_epoch");
    expect(payload.timeline.map((event) => event.source)).not.toContain(
      "native_watch_import",
    );
    expect(payload.liveStatus.watchModeStatus).toBe("planned_rebuild");
    expect(payload.liveStatus.watchModeSyncState).toBeNull();
    expect(payload.counts.watch_epoch).toBe(1);
  });

  it("reports internal Watch product ledger status in live diagnostics", async () => {
    const db = new FakeDiagnosticsDb({
      sessions: [],
      watch_runtime_events: [],
      watch_epochs: [],
      cue_events: [],
      movement_events: [],
      watch_session_sync_states: [
        {
          session_id: "watch-product-1",
          participant_id: "participant-1",
          plan_id: "watch-mode-product-plan-v3",
          plan_hash: "c".repeat(64),
          package_id: null,
          package_hash: null,
          status: "watch_committed",
          last_known_watch_state: "planCommitted",
          last_status_at: "2026-06-03T14:45:00.000Z",
          started_at: null,
          committed_at: "2026-06-03T14:45:00.000Z",
          sealed_at: null,
          imported_at: null,
          ack_eligible_at: null,
          ack_sent_at: null,
          unresolved_reason: null,
          metadata_json: JSON.stringify({ source: "phone_watch_mode_v3" }),
          updated_at: "2026-06-03T14:45:00.000Z",
        },
      ],
    });

    const payload = await buildDiagnosticsTimeline({
      db,
      participantId: "participant-1",
      selectedMode: "watch",
      activeSession: session({ status: "setup" }),
      sessionHistory: [session({ status: "setup" })],
      latestEngineSnapshot: {
        sessionStatus: "setup",
        currentValues: {
          latestDecisionReason: "session_not_active",
        },
      } as unknown as EngineSnapshot,
      phoneRuntimeStatus: null,
      pendingNativeWatchImport: null,
      nativePhoneRuntimeLogs: {},
      watchModeLabAvailable: true,
      now: "2026-06-03T15:00:00.000Z",
    });

    expect(payload.liveStatus.watchModeStatus).toBe("watch_committed");
    expect(payload.liveStatus.watchModeSyncState?.sessionId).toBe(
      "watch-product-1",
    );
    expect(
      payload.timeline.find((event) => event.kind === "watch_mode_status"),
    ).toMatchObject({
      sessionId: "watch-product-1",
      label: "Watch Mode watch_committed",
      payload: {
        status: "watch_committed",
        ledgerStatus: "watch_committed",
        lastKnownWatchState: "planCommitted",
        internalLabAvailable: true,
        nativeRuntimeQueried: false,
      },
    });
  });
});
