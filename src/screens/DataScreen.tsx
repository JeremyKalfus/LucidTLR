import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  History,
  Moon,
  Share2,
  Smartphone,
  Trash2,
  Upload,
  Watch,
} from "lucide-react-native";
import React from "react";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Platform, Pressable, Share, Text, View } from "react-native";

import {
  graphPointsForLogs,
  SleepNightGraph,
} from "@/src/components/sleep/SleepNightGraph";
import { graphPointsForWatchData } from "@/src/components/sleep/watchSleepGraphData";
import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import {
  exportFullLocalData,
  loadArchivedPhoneRuntimeLogs,
  parseFullLocalDataExport,
  replaceFullLocalData,
  saveArchivedPhoneRuntimeLogs,
  type FullLocalDataExport,
} from "@/src/data/local/fullDataBackup";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  getLocalParticipant,
  loadLocalSessions,
  loadMorningReportForSession,
  loadWatchEpochsForSession,
  loadWatchRuntimeEventsForSession,
  summarizeWatchSession,
} from "@/src/data/local/repositories";
import {
  DEFAULT_DIAGNOSTICS_LOOKBACK_MINUTES,
  buildDiagnosticsTimeline,
} from "@/src/features/diagnostics/diagnosticsTimeline";
import type {
  ExternalSleepSource,
  MorningReport,
  NightSession,
  PredictedRemWindow,
  RemDensityBin,
  WatchEpoch,
} from "@/src/domain/types";
import { formatEnginePercent } from "@/src/engine";
import { formatSessionLength } from "@/src/features/sessions/sessionLength";
import {
  summarizeWatchRuntime,
  type WatchRuntimeLogSummary,
} from "@/src/features/watchHistory/watchRuntimeLogMapping";
import type { WatchRuntimeEvent } from "@/src/features/watchHistory/watchHistoryTypes";
import {
  phoneRuntime,
  summarizePhoneRuntimeEvents,
  type NativePhoneRuntimeEvent,
} from "@/src/native/phoneRuntime";
import { TLR_PROTOCOL_VERSION } from "@/src/protocol/tlrProtocol";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

type DataRoute =
  | "/data/tlr-engine"
  | "/data/iphone-runtime"
  | "/data/watch-mode"
  | "/data/sleep-history"
  | "/data/sessions";

type RuntimeLogSessionRef = {
  id: string;
  session?: NightSession;
};

type SleepNightRecord = {
  id: string;
  session?: NightSession;
  morningReport?: MorningReport | null;
  logs: NativePhoneRuntimeEvent[];
  watchEpochs: WatchEpoch[];
  watchRuntimeEvents: WatchRuntimeEvent[];
  watchRuntimeSummary: WatchRuntimeLogSummary | null;
};

function isOvernightEngineStatus(status: string): boolean {
  return (
    status === "waiting_for_cue_window" ||
    status === "cueing" ||
    status === "paused_for_movement" ||
    status === "paused_after_awakening"
  );
}

function formatSleepHistorySource(source: ExternalSleepSource | null): string {
  if (source === "apple_health") {
    return "Apple Health";
  }

  if (source === "health_connect") {
    return "Health Connect";
  }

  return "none";
}

function formatWindow(window: PredictedRemWindow): string {
  return `${new Date(window.startAt).toLocaleTimeString()} - ${new Date(
    window.endAt,
  ).toLocaleTimeString()} (${window.confidence.toFixed(2)})`;
}

function formatDensitySummary(density: RemDensityBin[]): string {
  const topBins = [...density]
    .sort((a, b) => b.density - a.density)
    .slice(0, 4)
    .sort((a, b) => a.minuteAfterSleepOnset - b.minuteAfterSleepOnset);

  if (topBins.length === 0) {
    return "none yet";
  }

  return topBins
    .map(
      (bin) =>
        `${bin.minuteAfterSleepOnset}m: ${(bin.density * 100).toFixed(0)}%`,
    )
    .join(" / ");
}

function runtimeEventLabel(event: NativePhoneRuntimeEvent): string {
  const reason =
    typeof event.payload.reason === "string" ? ` / ${event.payload.reason}` : "";
  const cueAsset =
    typeof event.payload.cueAsset === "string" ? ` / ${event.payload.cueAsset}` : "";
  const movement =
    typeof event.payload.roughMovementIntensity === "string"
      ? ` / ${event.payload.roughMovementIntensity}`
      : "";

  return `${new Date(event.timestamp).toLocaleTimeString()} / ${event.eventType}${reason}${cueAsset}${movement}`;
}

function watchRuntimeEventLabel(event: WatchRuntimeEvent): string {
  const reason =
    typeof event.payload.reason === "string" ? ` / ${event.payload.reason}` : "";
  const epochId =
    typeof event.payload.epochId === "string" ? ` / ${event.payload.epochId}` : "";

  return `${new Date(event.timestamp).toLocaleTimeString()} / ${event.eventType}${reason}${epochId}`;
}

function localSessionRecords(
  activeSession: NightSession | null,
  sessionHistory: NightSession[],
): NightSession[] {
  const byId = new Map<string, NightSession>();

  for (const session of [activeSession, ...sessionHistory]) {
    if (session && !byId.has(session.id)) {
      byId.set(session.id, session);
    }
  }

  return [...byId.values()].sort(
    (a, b) => phoneSessionStartedMs(b) - phoneSessionStartedMs(a),
  );
}

function numberPayload(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringPayload(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];

  return typeof value === "string" ? value : undefined;
}

function eventTypeCount(
  logs: NativePhoneRuntimeEvent[],
  eventType: NativePhoneRuntimeEvent["eventType"],
): number {
  return logs.filter((event) => event.eventType === eventType).length;
}

function firstLogTimestamp(logs: NativePhoneRuntimeEvent[]): string | undefined {
  return logs[0]?.timestamp;
}

function lastLogTimestamp(logs: NativePhoneRuntimeEvent[]): string | undefined {
  return logs[logs.length - 1]?.timestamp;
}

function firstWatchEpochTimestamp(epochs: WatchEpoch[]): string | undefined {
  return epochs[0]?.epochStart;
}

function lastWatchEpochTimestamp(epochs: WatchEpoch[]): string | undefined {
  return epochs[epochs.length - 1]?.epochEnd;
}

function runtimeStopTimestamp(logs: NativePhoneRuntimeEvent[]): string | undefined {
  return [...logs]
    .reverse()
    .find((event) => event.eventType === "runtime_stopped")
    ?.timestamp;
}

function nightStartedAt(record: SleepNightRecord): string | undefined {
  return (
    record.session?.trainingStartedAt ??
    record.session?.startedAt ??
    firstLogTimestamp(record.logs) ??
    firstWatchEpochTimestamp(record.watchEpochs)
  );
}

function nightEndedAt(record: SleepNightRecord): string | undefined {
  return (
    record.session?.endedAt ??
    runtimeStopTimestamp(record.logs) ??
    lastLogTimestamp(record.logs) ??
    lastWatchEpochTimestamp(record.watchEpochs)
  );
}

function formatNightTitle(record: SleepNightRecord): string {
  const startAt = nightStartedAt(record);

  if (!startAt) {
    return "Unknown night";
  }

  return new Date(startAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNightInterval(record: SleepNightRecord): string {
  const startAt = nightStartedAt(record);
  const endAt = nightEndedAt(record);

  if (!startAt) {
    return record.id;
  }

  if (!endAt) {
    return `${new Date(startAt).toLocaleTimeString()} - running`;
  }

  return `${new Date(startAt).toLocaleTimeString()} - ${new Date(
    endAt,
  ).toLocaleTimeString()}`;
}

function compactTimelineEvents(logs: NativePhoneRuntimeEvent[]): NativePhoneRuntimeEvent[] {
  return logs
    .filter(
      (event) =>
        event.eventType !== "decision_tick" &&
        event.eventType !== "motion_summary" &&
        event.eventType !== "battery_summary",
    )
    .slice(-60)
    .reverse();
}

function compactWatchRuntimeEvents(events: WatchRuntimeEvent[]): WatchRuntimeEvent[] {
  return events.slice(-60).reverse();
}

function nullableBooleanLabel(value: boolean | null | undefined): string {
  if (value === undefined || value === null) {
    return "skipped";
  }

  return value ? "yes" : "no";
}

function durationLabel(startAt?: string, endAt?: string): string {
  if (!startAt || !endAt) {
    return "not available";
  }

  const durationMs = Date.parse(endAt) - Date.parse(startAt);

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "not available";
  }

  const minutes = Math.round(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return hours > 0 ? `${hours}h ${remainder}m` : `${minutes}m`;
}

function fixedNumberLabel(value: unknown, digits: number): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "not available";
}

function minMaxLabel(values: number[], format: (value: number) => string): string {
  const finite = values.filter((value) => Number.isFinite(value));

  if (finite.length === 0) {
    return "not available";
  }

  return `${format(Math.min(...finite))} - ${format(Math.max(...finite))}`;
}

function batteryLevelLabel(logs: NativePhoneRuntimeEvent[]): string {
  return minMaxLabel(
    logs.flatMap((event) => {
      const level = numberPayload(event.payload, "batteryLevel");

      return event.eventType === "battery_summary" && typeof level === "number"
        ? [level]
        : [];
    }),
    (value) => `${Math.round(value * 100)}%`,
  );
}

function uniquePayloadValues(
  logs: NativePhoneRuntimeEvent[],
  eventType: NativePhoneRuntimeEvent["eventType"],
  key: string,
): string {
  const values = logs.flatMap((event) => {
    const value = stringPayload(event.payload, key);

    return event.eventType === eventType && value ? [value] : [];
  });
  const unique = [...new Set(values)];

  return unique.length > 0 ? unique.join(", ") : "none";
}

function countPayloadMatches(
  logs: NativePhoneRuntimeEvent[],
  eventType: NativePhoneRuntimeEvent["eventType"],
  key: string,
  value: string | boolean,
): number {
  return logs.filter(
    (event) => event.eventType === eventType && event.payload[key] === value,
  ).length;
}

function motionIntensityCounts(logs: NativePhoneRuntimeEvent[]): string {
  const counts = new Map<string, number>();

  for (const event of logs) {
    if (event.eventType !== "motion_summary") {
      continue;
    }

    const intensity = stringPayload(event.payload, "roughMovementIntensity") ?? "unknown";
    counts.set(intensity, (counts.get(intensity) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return "none";
  }

  return ["still", "light", "moderate", "large", "unknown"]
    .flatMap((key) => {
      const count = counts.get(key);

      return count ? [`${key} ${count}`] : [];
    })
    .join(" / ");
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function phoneSessionStartedMs(session: NightSession): number {
  const startedMs = Date.parse(session.startedAt);

  return Number.isFinite(startedMs) ? startedMs : 0;
}

function localPhoneSessions(
  activeSession: NightSession | null,
  sessionHistory: NightSession[],
): NightSession[] {
  const byId = new Map<string, NightSession>();

  for (const session of [activeSession, ...sessionHistory]) {
    if (
      session &&
      session.sessionType === "tlr" &&
      session.mode === "phone" &&
      !byId.has(session.id)
    ) {
      byId.set(session.id, session);
    }
  }

  return [...byId.values()].sort(
    (a, b) => phoneSessionStartedMs(b) - phoneSessionStartedMs(a),
  );
}

function latestRuntimeEventMs(events: NativePhoneRuntimeEvent[]): number {
  const latestEvent = events[events.length - 1];

  if (!latestEvent) {
    return 0;
  }

  const timestampMs = Date.parse(latestEvent.timestamp);

  return Number.isFinite(timestampMs) ? timestampMs : 0;
}

function isTimelineEvent(event: NativePhoneRuntimeEvent): boolean {
  return (
    event.eventType === "cue_candidate" ||
    event.eventType === "training_started" ||
    event.eventType === "training_cue_play_attempted" ||
    event.eventType === "training_cue_played" ||
    event.eventType === "training_cue_failed" ||
    event.eventType === "training_completed" ||
    event.eventType === "training_failed" ||
    event.eventType === "cue_suppressed" ||
    event.eventType === "cue_play_attempted" ||
    event.eventType === "cue_played" ||
    event.eventType === "cue_failed" ||
    event.eventType === "motion_summary" ||
    event.eventType === "movement_pause_started" ||
    event.eventType === "movement_pause_ended" ||
    event.eventType === "cue_associated_movement" ||
    event.eventType === "route_changed" ||
    event.eventType === "interruption_started" ||
    event.eventType === "interruption_ended" ||
    event.eventType === "runtime_error"
  );
}

function DataPageHeader({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable
        accessibilityLabel="Back to data"
        accessibilityRole="button"
        onPress={() => router.replace("/data")}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.68 : 1,
        })}
      >
        <ChevronLeft color={colors.textMuted} size={24} strokeWidth={1.8} />
      </Pressable>
      <SectionTitle>{title}</SectionTitle>
    </View>
  );
}

function DataNavRow({
  detail,
  icon: Icon,
  route,
  title,
}: {
  detail: string;
  icon: LucideIcon;
  route: DataRoute;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(route)}
      style={({ pressed }) => ({
        minHeight: 58,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Icon color={colors.textMuted} size={23} strokeWidth={1.8} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          {title}
        </Text>
        <Text
          selectable
          style={{
            color: colors.textMuted,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
          }}
        >
          {detail}
        </Text>
      </View>
      <ChevronRight color={colors.textDim} size={20} strokeWidth={1.8} />
    </Pressable>
  );
}

function DataNote({ children }: { children: string }) {
  return (
    <Text
      selectable
      style={{
        color: colors.textSecondary,
        fontSize: typography.body.fontSize,
        lineHeight: typography.body.lineHeight,
      }}
    >
      {children}
    </Text>
  );
}

function useRuntimeTimeline() {
  const [runtimeLogs, setRuntimeLogs] = React.useState<NativePhoneRuntimeEvent[]>(
    [],
  );
  const [runtimeSession, setRuntimeSession] =
    React.useState<RuntimeLogSessionRef | null>(null);
  const [scannedSessionCount, setScannedSessionCount] = React.useState(0);
  const [runtimeLogError, setRuntimeLogError] = React.useState<string | null>(
    null,
  );
  const { activeSession, sessionHistory } = useAppState();
  const candidateSessions = React.useMemo(
    () => localPhoneSessions(activeSession, sessionHistory),
    [activeSession, sessionHistory],
  );
  const timelineEvents = runtimeLogs.filter(isTimelineEvent).slice(-40).reverse();

  React.useEffect(() => {
    let cancelled = false;

    async function loadRuntimeLogs() {
      try {
        const nativeLogSessionIds = await phoneRuntime.getPhoneRuntimeLogSessionIds();
        const localSessionById = new Map(
          candidateSessions.map((session) => [session.id, session]),
        );
        const candidateIds = [
          ...candidateSessions.map((session) => session.id),
          ...nativeLogSessionIds,
        ].filter((id, index, ids) => ids.indexOf(id) === index);

        if (candidateIds.length === 0) {
          if (!cancelled) {
            setRuntimeLogs([]);
            setRuntimeSession(null);
            setScannedSessionCount(0);
          }

          return;
        }

        const candidatesWithLogs = await Promise.all(
          candidateIds.map(async (sessionId) => ({
            ref: {
              id: sessionId,
              session: localSessionById.get(sessionId),
            },
            logs: await phoneRuntime.getPhoneRuntimeLogs(sessionId),
          })),
        );
        const selected =
          [...candidatesWithLogs]
            .filter((candidate) => candidate.logs.length > 0)
            .sort(
              (a, b) =>
                latestRuntimeEventMs(b.logs) - latestRuntimeEventMs(a.logs),
            )[0] ??
          candidatesWithLogs[0];

        if (!cancelled) {
          setRuntimeLogs(selected.logs);
          setRuntimeSession(selected.ref);
          setScannedSessionCount(candidatesWithLogs.length);
          setRuntimeLogError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRuntimeLogError(
            error instanceof Error
              ? error.message
              : "Could not load iPhone runtime logs.",
          );
        }
      }
    }

    void loadRuntimeLogs();

    return () => {
      cancelled = true;
    };
  }, [candidateSessions]);

  return {
    runtimeLogs,
    runtimeLogError,
    runtimeSession,
    scannedSessionCount,
    timelineEvents,
  };
}

function useSleepNightRecords() {
  const { activeSession, sessionHistory } = useAppState();
  const localSessions = React.useMemo(
    () => localSessionRecords(activeSession, sessionHistory),
    [activeSession, sessionHistory],
  );
  const [records, setRecords] = React.useState<SleepNightRecord[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    async function loadRecords() {
      try {
        const nativeLogSessionIds = await phoneRuntime.getPhoneRuntimeLogSessionIds();
        const db = await getLocalDb();
        const participant = await getLocalParticipant(db);
        const persistedSessions = participant
          ? await loadLocalSessions({ db, participantId: participant.id })
          : [];
        const allLocalSessions = localSessionRecords(null, [
          ...localSessions,
          ...persistedSessions,
        ]);
        const archivedRuntimeLogs = await loadArchivedPhoneRuntimeLogs(db);
        const localSessionById = new Map(
          allLocalSessions.map((session) => [session.id, session]),
        );
        const candidateIds = [
          ...allLocalSessions.map((session) => session.id),
          ...nativeLogSessionIds,
          ...Object.keys(archivedRuntimeLogs),
        ].filter((id, index, ids) => ids.indexOf(id) === index);
        const loaded = await Promise.all(
          candidateIds.map(async (id) => {
            const session = localSessionById.get(id);
            const shouldTryNativeLogs =
              nativeLogSessionIds.includes(id) ||
              (session?.sessionType === "tlr" && session.mode === "phone");
            let nativeLogs: NativePhoneRuntimeEvent[] = [];
            let watchEpochs: WatchEpoch[] = [];
            let watchRuntimeEvents: WatchRuntimeEvent[] = [];

            if (shouldTryNativeLogs) {
              try {
                nativeLogs = await phoneRuntime.getPhoneRuntimeLogs(id);
              } catch {
                nativeLogs = [];
              }
            }

            if (session?.mode === "watch") {
              const [storedEpochs, storedEvents] = await Promise.all([
                loadWatchEpochsForSession({ db, sessionId: id }),
                loadWatchRuntimeEventsForSession({ db, sessionId: id }),
              ]);

              watchEpochs = storedEpochs;
              watchRuntimeEvents = storedEvents;
            }

            return {
              id,
              session,
              morningReport: session
                ? await loadMorningReportForSession({ db, sessionId: id })
                : null,
              logs: nativeLogs.length > 0
                ? nativeLogs
                : archivedRuntimeLogs[id] ?? [],
              watchEpochs,
              watchRuntimeEvents,
              watchRuntimeSummary:
                watchEpochs.length > 0 || watchRuntimeEvents.length > 0
                  ? summarizeWatchRuntime(watchRuntimeEvents, watchEpochs)
                  : null,
            };
          }),
        );
        const sorted = loaded.sort((a, b) => {
          const bStart = Date.parse(nightStartedAt(b) ?? "");
          const aStart = Date.parse(nightStartedAt(a) ?? "");

          return (Number.isFinite(bStart) ? bStart : 0) -
            (Number.isFinite(aStart) ? aStart : 0);
        });

        if (!cancelled) {
          setRecords(sorted);
          setError(null);
        }

        const nextArchive = { ...archivedRuntimeLogs };
        let archiveChanged = false;

        for (const record of loaded) {
          if (record.logs.length > 0 && nextArchive[record.id] !== record.logs) {
            nextArchive[record.id] = record.logs;
            archiveChanged = true;
          }
        }

        if (archiveChanged) {
          await saveArchivedPhoneRuntimeLogs({
            db,
            logs: nextArchive,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setRecords(
            localSessions.map((session) => ({
              id: session.id,
              session,
              morningReport: null,
              logs: [],
              watchEpochs: [],
              watchRuntimeEvents: [],
              watchRuntimeSummary: null,
            })),
          );
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load local sleep history.",
          );
        }
      }
    }

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, [localSessions, reloadKey]);

  return {
    error,
    records,
    reloadRecords: () => setReloadKey((key) => key + 1),
  };
}

async function collectPhoneRuntimeLogsForExport(
  db: Awaited<ReturnType<typeof getLocalDb>>,
): Promise<Record<string, NativePhoneRuntimeEvent[]>> {
  const archivedLogs = await loadArchivedPhoneRuntimeLogs(db);
  const localPhoneSessions = await db.query<{ id: string }>(
    `select id from sessions
where session_type = 'tlr'
  and mode = 'phone'
order by started_at desc`,
  );
  const nativeLogSessionIds = await phoneRuntime.getPhoneRuntimeLogSessionIds();
  const nativeLogs = { ...archivedLogs };
  const candidateSessionIds = [
    ...localPhoneSessions.map((session) => session.id),
    ...nativeLogSessionIds,
  ].filter((id, index, ids) => ids.indexOf(id) === index);

  for (const sessionId of candidateSessionIds) {
    try {
      const logs = await phoneRuntime.getPhoneRuntimeLogs(sessionId);

      if (logs.length > 0) {
        nativeLogs[sessionId] = logs;
      }
    } catch {
      // Keep exporting the rest of the local account if one native log fails.
    }
  }

  return nativeLogs;
}

async function collectRecentPhoneRuntimeLogs(input: {
  sessionIds: string[];
  sinceMs: number;
}): Promise<Record<string, NativePhoneRuntimeEvent[]>> {
  const nativeLogSessionIds = await phoneRuntime.getPhoneRuntimeLogSessionIds();
  const candidateSessionIds = [
    ...input.sessionIds,
    ...nativeLogSessionIds,
  ].filter((id, index, ids) => ids.indexOf(id) === index);
  const logsBySession: Record<string, NativePhoneRuntimeEvent[]> = {};

  for (const sessionId of candidateSessionIds) {
    try {
      const logs = await phoneRuntime.getPhoneRuntimeLogs(sessionId);
      const recentLogs = logs.filter((log) => {
        const timestampMs = Date.parse(log.timestamp);

        return Number.isFinite(timestampMs) && timestampMs >= input.sinceMs;
      });

      if (recentLogs.length > 0) {
        logsBySession[sessionId] = recentLogs;
      }
    } catch {
      // Diagnostics should include every source that can be read.
    }
  }

  return logsBySession;
}

function confirmFullDataImport(): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(
      globalThis.confirm(
        "Importing this file will overwrite all local LucidTLR data on this device.",
      ),
    );
  }

  return new Promise((resolve) => {
    Alert.alert(
      "Overwrite local data?",
      "Importing this file will replace the entire local LucidTLR account on this device, including engine settings, sessions, dream journal, and local logs.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Overwrite",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
    );
  });
}

function confirmSleepNightDelete(record: SleepNightRecord): Promise<boolean> {
  const message = `Delete ${formatNightTitle(record)} and its local sleep data?`;

  if (Platform.OS === "web") {
    return Promise.resolve(globalThis.confirm(message));
  }

  return new Promise((resolve) => {
    Alert.alert("Delete sleep night?", message, [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => resolve(true),
      },
    ]);
  });
}

async function shareFullLocalDataExport(snapshot: FullLocalDataExport) {
  const json = JSON.stringify(snapshot, null, 2);
  const fileName = `lucidtlr-full-data-${safeFilePart(snapshot.exportedAt)}.json`;
  const message = `LucidTLR full local data export\nexportedAt: ${snapshot.exportedAt}`;

  if (Platform.OS === "ios" && FileSystem.documentDirectory) {
    const exportDirectory = `${FileSystem.documentDirectory}lucidtlr-exports/`;
    const fileUri = `${exportDirectory}${fileName}`;

    await FileSystem.makeDirectoryAsync(exportDirectory, {
      intermediates: true,
    });
    await FileSystem.writeAsStringAsync(fileUri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await Share.share({
      title: fileName,
      message,
      url: fileUri,
    });
    return `${fileName} (${formatBytes(json.length)})`;
  }

  await Share.share({
    title: fileName,
    message: `${message}\n\n${json}`,
  });
  return `pasteable JSON (${formatBytes(json.length)})`;
}

async function pickFullLocalDataImportFile() {
  let DocumentPicker: typeof import("expo-document-picker");

  try {
    DocumentPicker = await import("expo-document-picker");
  } catch {
    throw new Error(
      "Full Data Import needs the next development build. Full Data Export works in this build, so export before rebuilding.",
    );
  }

  return DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });
}

export function DataScreen() {
  const {
    activeSession,
    latestEngineSnapshot,
    participantId,
    reloadLocalData,
    selectedMode,
    sessionHistory,
  } = useAppState();
  const [dataTransferError, setDataTransferError] = React.useState<string | null>(
    null,
  );
  const [dataTransferInfo, setDataTransferInfo] = React.useState<string | null>(
    null,
  );
  const [isExportingFullData, setIsExportingFullData] = React.useState(false);
  const [isImportingFullData, setIsImportingFullData] = React.useState(false);
  const [isCopyingDiagnostics, setIsCopyingDiagnostics] = React.useState(false);

  async function exportFullData() {
    setIsExportingFullData(true);
    setDataTransferError(null);

    try {
      const db = await getLocalDb();
      const nativePhoneRuntimeLogs = await collectPhoneRuntimeLogsForExport(db);
      await saveArchivedPhoneRuntimeLogs({
        db,
        logs: nativePhoneRuntimeLogs,
        updatedAt: new Date().toISOString(),
      });
      const snapshot = await exportFullLocalData({
        db,
        nativePhoneRuntimeLogs,
      });
      const exportLabel = await shareFullLocalDataExport(snapshot);

      setDataTransferInfo(`Shared ${exportLabel}.`);
    } catch (error) {
      setDataTransferError(
        error instanceof Error ? error.message : "Could not export local data.",
      );
    } finally {
      setIsExportingFullData(false);
    }
  }

  async function importFullData() {
    setIsImportingFullData(true);
    setDataTransferError(null);

    try {
      const picked = await pickFullLocalDataImportFile();

      if (picked.canceled) {
        return;
      }

      const asset = picked.assets[0];

      if (!asset) {
        throw new Error("No import file selected.");
      }

      const json = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const snapshot = parseFullLocalDataExport(json);
      const confirmed = await confirmFullDataImport();

      if (!confirmed) {
        return;
      }

      const db = await getLocalDb();

      await replaceFullLocalData({ db, snapshot });
      await saveArchivedPhoneRuntimeLogs({
        db,
        logs: snapshot.nativePhoneRuntimeLogs,
        updatedAt: new Date().toISOString(),
      });

      try {
        await phoneRuntime.clearPhoneRuntimeLogs();
      } catch {
        // Native runtime logs are best-effort; imported archive remains in SQLite.
      }

      await reloadLocalData();
      setDataTransferInfo(
        `Imported ${asset.name ?? "LucidTLR export"} and replaced local data.`,
      );
    } catch (error) {
      setDataTransferError(
        error instanceof Error ? error.message : "Could not import local data.",
      );
    } finally {
      setIsImportingFullData(false);
    }
  }

  async function copyDiagnosticsTimeline() {
    setIsCopyingDiagnostics(true);
    setDataTransferError(null);

    try {
      const db = await getLocalDb();
      const now = new Date().toISOString();
      const sinceMs =
        Date.parse(now) - DEFAULT_DIAGNOSTICS_LOOKBACK_MINUTES * 60 * 1000;
      const sessionIds = [activeSession, ...sessionHistory]
        .flatMap((session) => (session ? [session.id] : []))
        .filter((id, index, ids) => ids.indexOf(id) === index);
      const [
        phoneRuntimeStatus,
        nativePhoneRuntimeLogs,
      ] = await Promise.all([
        phoneRuntime.getPhoneRuntimeStatus().catch(() => null),
        collectRecentPhoneRuntimeLogs({ sessionIds, sinceMs }),
      ]);
      const payload = await buildDiagnosticsTimeline({
        db,
        participantId,
        selectedMode,
        activeSession,
        sessionHistory,
        latestEngineSnapshot,
        phoneRuntimeStatus,
        pendingNativeWatchImport: null,
        nativePhoneRuntimeLogs,
        now,
      });
      const json = JSON.stringify(payload, null, 2);
      const Clipboard = await import("expo-clipboard");

      await Clipboard.setStringAsync(json);
      setDataTransferInfo(
        `Copied ${DEFAULT_DIAGNOSTICS_LOOKBACK_MINUTES}m diagnostics (${formatBytes(
          json.length,
        )}).`,
      );
    } catch (error) {
      setDataTransferError(
        error instanceof Error
          ? error.message
          : "Could not copy diagnostics timeline.",
      );
    } finally {
      setIsCopyingDiagnostics(false);
    }
  }

  return (
    <Screen>
      <SectionTitle>Data</SectionTitle>

      <Card>
        <DataNavRow
          detail="Decision status, score breakdown, timing, movement, and budget."
          icon={Activity}
          route="/data/tlr-engine"
          title="TLR engine"
        />
        <DataNavRow
          detail="Native iPhone Phone Mode events for the latest local session."
          icon={Smartphone}
          route="/data/iphone-runtime"
          title="iPhone runtime timeline"
        />
        <DataNavRow
          detail="Historical local Watch epochs and runtime events already synced."
          icon={Watch}
          route="/data/watch-mode"
          title="Watch mode timeline"
        />
        <DataNavRow
          detail="Local sleep-history calibration and predicted REM windows."
          icon={Moon}
          route="/data/sleep-history"
          title="Sleep history"
        />
        <DataNavRow
          detail="Local session records stored on this device."
          icon={History}
          route="/data/sessions"
          title="Sessions"
        />
      </Card>

      <View style={{ gap: 12 }}>
        <InfoRow label="participant ID" value={participantId} />
        <InfoRow label="protocol" value={TLR_PROTOCOL_VERSION} />
        <InfoRow label="app shell" value="0.1.0" />
      </View>

      <View style={{ gap: 12 }}>
        <PrimaryPillButton
          disabled={
            isExportingFullData || isImportingFullData || isCopyingDiagnostics
          }
          icon={Copy}
          label={
            isCopyingDiagnostics
              ? "Copying Diagnostics..."
              : "Copy Recent Diagnostics"
          }
          onPress={() => {
            void copyDiagnosticsTimeline();
          }}
        />
        <PrimaryPillButton
          disabled={
            isExportingFullData || isImportingFullData || isCopyingDiagnostics
          }
          icon={Upload}
          label={isExportingFullData ? "Preparing Export..." : "Full Data Export"}
          onPress={() => {
            void exportFullData();
          }}
        />
        <PrimaryPillButton
          disabled={
            isExportingFullData || isImportingFullData || isCopyingDiagnostics
          }
          icon={Download}
          label={isImportingFullData ? "Importing..." : "Full Data Import"}
          onPress={() => {
            void importFullData();
          }}
        />
        {dataTransferInfo ? <DataNote>{dataTransferInfo}</DataNote> : null}
        {dataTransferError ? (
          <InfoRow label="data transfer" value={dataTransferError} />
        ) : null}
      </View>
    </Screen>
  );
}

export function TlrEngineDataScreen() {
  const { engineDecisionLog, latestEngineSnapshot } = useAppState();
  const decision = latestEngineSnapshot.decision;
  const watch = decision.watch;
  const visibleRemThreshold =
    typeof decision.metadata.threshold === "number"
      ? decision.metadata.threshold
      : undefined;
  const showDecisionLog = isOvernightEngineStatus(
    latestEngineSnapshot.sessionStatus,
  );

  return (
    <Screen>
      <DataPageHeader title="TLR engine" />

      <Card>
        <InfoRow
          label="engine status"
          value={latestEngineSnapshot.currentValues.currentEngineStatus}
        />
        <InfoRow
          label="decision reason"
          value={latestEngineSnapshot.currentValues.latestDecisionReason}
        />
        <InfoRow
          label="opportunity score"
          value={showDecisionLog ? decision.opportunityScore.toFixed(2) : "not running"}
        />
        <InfoRow
          label="next check"
          value={latestEngineSnapshot.currentValues.nextCheckTime}
        />
        <InfoRow
          label="suppression reason"
          value={latestEngineSnapshot.currentValues.suppressionReason}
        />
      </Card>

      <SectionTitle>Score breakdown</SectionTitle>
      <Card compact>
        {latestEngineSnapshot.scoreRows.map((row) => (
          <InfoRow key={row.label} label={row.label} value={row.value} />
        ))}
      </Card>

      <SectionTitle>Sleep timing prior</SectionTitle>
      <Card>
        <InfoRow
          label="training ended"
          value={latestEngineSnapshot.currentValues.trainingEndTime}
        />
        <InfoRow
          label="estimated sleep onset"
          value={latestEngineSnapshot.currentValues.estimatedSleepOnset}
        />
        <InfoRow
          label="expected wake"
          value={latestEngineSnapshot.currentValues.expectedWakeTime}
        />
        <InfoRow
          label="cue window"
          value={latestEngineSnapshot.currentValues.nextOrActiveCueWindow}
        />
        <InfoRow
          label="next predicted REM"
          value={latestEngineSnapshot.currentValues.nextPredictedRemWindow}
        />
        <InfoRow
          label="confidence"
          value={latestEngineSnapshot.sleepTiming.confidence}
        />
        <InfoRow
          label="source"
          value={latestEngineSnapshot.sleepTiming.source.replaceAll("_", " ")}
        />
        <InfoRow
          label="local phone nights"
          value={latestEngineSnapshot.currentValues.phoneNightCalibrationStatus}
        />
        <InfoRow
          label="observed night end"
          value={latestEngineSnapshot.currentValues.phoneNightObservedEnd}
        />
        <InfoRow
          label="quiet runtime"
          value={latestEngineSnapshot.currentValues.phoneNightQuietRuntime}
        />
        <InfoRow
          label="budget adjustment"
          value={latestEngineSnapshot.currentValues.phoneNightBudgetAdjustment}
        />
      </Card>

      <SectionTitle>Movement and pauses</SectionTitle>
      <Card>
        <InfoRow
          label="movement intensity"
          value={decision.movement.recentMovementIntensity.toFixed(2)}
        />
        <InfoRow
          label="large movement threshold"
          value={decision.movement.largeMovementThreshold.toFixed(2)}
        />
        <InfoRow
          label="stable low movement"
          value={latestEngineSnapshot.currentValues.stableLowMovementSeconds}
        />
        <InfoRow
          label="movement pause"
          value={latestEngineSnapshot.currentValues.movementPauseStatus}
        />
        <InfoRow
          label="cue-associated pause"
          value={latestEngineSnapshot.currentValues.cueAssociatedMovementPause}
        />
        <InfoRow
          label="awakening pause"
          value={latestEngineSnapshot.currentValues.userReportedAwakeningPause}
        />
      </Card>

      <SectionTitle>Volume and budget</SectionTitle>
      <Card>
        <InfoRow
          label="current volume"
          value={formatEnginePercent(decision.volume.currentVolumeLevel)}
        />
        <InfoRow
          label="next cue volume"
          value={formatEnginePercent(decision.volume.nextCueVolumeLevel)}
        />
        <InfoRow
          label="volume start"
          value={formatEnginePercent(decision.volume.startLevel)}
        />
        <InfoRow
          label="volume ramp"
          value={latestEngineSnapshot.currentValues.volumeRamp}
        />
        <InfoRow
          label="volume cap"
          value={latestEngineSnapshot.currentValues.volumeCap}
        />
        <InfoRow
          label="cue count tonight"
          value={latestEngineSnapshot.currentValues.cueCountTonight}
        />
        <InfoRow
          label="block cues"
          value={`${decision.budget.cuesInCurrentBlock} / ${decision.budget.maxCuesPerBlock}`}
        />
        <InfoRow
          label="block rest until"
          value={
            decision.budget.blockRestUntil
              ? new Date(decision.budget.blockRestUntil).toLocaleString()
              : "off"
          }
        />
      </Card>

      <SectionTitle>Watch signal</SectionTitle>
      <Card>
        <InfoRow
          label="REM probability"
          value={formatEnginePercent(watch?.remProbability)}
        />
        <InfoRow
          label="REM threshold"
          value={formatEnginePercent(watch?.remThreshold ?? visibleRemThreshold)}
        />
        <InfoRow
          label="sleep probability"
          value={formatEnginePercent(watch?.sleepProbability)}
        />
        <InfoRow
          label="sensor quality"
          value={watch?.sensorQuality ?? "not available yet"}
        />
        <InfoRow
          label="consecutive likely REM"
          value={watch ? String(watch.consecutiveLikelyRemEpochs) : "not available yet"}
        />
        <InfoRow
          label="setup/sync link"
          value={watch?.connectivityState ?? "not available yet"}
        />
        <InfoRow
          label="classifier"
          value={watch ? "historical Watch signal" : "Watch Mode disabled"}
        />
      </Card>

      <SectionTitle>Decision log</SectionTitle>
      <Card>
        <InfoRow label="cue history" value="see iPhone runtime timeline" />
        <InfoRow label="movement events" value="see iPhone runtime timeline" />
        <InfoRow label="watch epochs" value="see Watch mode timeline" />
        {!showDecisionLog ? (
          <InfoRow label="latest entries" value="no active overnight engine log" />
        ) : engineDecisionLog.length === 0 ? (
          <InfoRow label="latest entries" value="none yet" />
        ) : (
          engineDecisionLog.slice(0, 8).map((line) => (
            <Text
              selectable
              key={line}
              style={{
                color: colors.textSecondary,
                fontSize: typography.label.fontSize,
                lineHeight: typography.label.lineHeight,
              }}
            >
              {line}
            </Text>
          ))
        )}
      </Card>
    </Screen>
  );
}

export function IphoneRuntimeDataScreen() {
  const {
    runtimeLogs,
    runtimeLogError,
    runtimeSession,
    scannedSessionCount,
    timelineEvents,
  } = useRuntimeTimeline();
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [exportInfo, setExportInfo] = React.useState<string | null>(null);
  const [isExportingLogs, setIsExportingLogs] = React.useState(false);

  async function shareRuntimeLogs() {
    if (!runtimeSession) {
      return;
    }

    setIsExportingLogs(true);
    setExportError(null);

    try {
      const [status, logs] = await Promise.all([
        phoneRuntime.getPhoneRuntimeStatus(),
        phoneRuntime.getPhoneRuntimeLogs(runtimeSession.id),
      ]);
      const payload = {
        exportSchema: "lucidtlr-phone-runtime-export-v1",
        exportedAt: new Date().toISOString(),
        sessionId: runtimeSession.id,
        session: runtimeSession.session ?? null,
        scannedSessionCount,
        status,
        summary: summarizePhoneRuntimeEvents(logs),
        eventCount: logs.length,
        events: logs,
      };
      const json = JSON.stringify(payload, null, 2);
      const fileName = `lucidtlr-phone-runtime-${safeFilePart(runtimeSession.id)}-${safeFilePart(payload.exportedAt)}.json`;
      const message = `LucidTLR iPhone Phone Mode logs\nsession: ${runtimeSession.id}\nevents: ${logs.length}\nexportedAt: ${payload.exportedAt}`;

      if (Platform.OS === "ios" && FileSystem.documentDirectory) {
        const exportDirectory = `${FileSystem.documentDirectory}lucidtlr-exports/`;
        const fileUri = `${exportDirectory}${fileName}`;

        await FileSystem.makeDirectoryAsync(exportDirectory, {
          intermediates: true,
        });
        await FileSystem.writeAsStringAsync(fileUri, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Share.share({
          title: fileName,
          message,
          url: fileUri,
        });
        setExportInfo(`Shared ${fileName} (${formatBytes(json.length)}).`);
        return;
      }

      await Share.share({
        title: fileName,
        message: `${message}\n\n${json}`,
      });
      setExportInfo(`Shared pasteable JSON (${formatBytes(json.length)}).`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not export runtime logs.";

      setExportError(message);
    } finally {
      setIsExportingLogs(false);
    }
  }

  return (
    <Screen>
      <DataPageHeader title="iPhone runtime" />

      <Card>
        {runtimeSession ? (
          <InfoRow label="session" value={runtimeSession.id} />
        ) : (
          <InfoRow label="session" value="none yet" />
        )}
        {runtimeSession?.session ? null : runtimeSession ? (
          <InfoRow label="session source" value="native log file" />
        ) : null}
        <InfoRow
          label="sessions scanned"
          value={String(scannedSessionCount)}
        />
        {runtimeLogError ? (
          <InfoRow label="runtime logs" value={runtimeLogError} />
        ) : timelineEvents.length === 0 ? (
          <InfoRow label="events" value="none yet" />
        ) : (
          timelineEvents.map((event) => (
            <Text
              selectable
              key={event.id}
              style={{
                color: colors.textSecondary,
                fontSize: typography.label.fontSize,
                lineHeight: typography.label.lineHeight,
              }}
            >
              {runtimeEventLabel(event)}
            </Text>
          ))
        )}
      </Card>

      <Card>
        <InfoRow label="raw events" value={String(runtimeLogs.length)} />
        <PrimaryPillButton
          disabled={!runtimeSession || isExportingLogs}
          icon={Share2}
          label={isExportingLogs ? "Preparing Logs..." : "Share Raw Logs JSON"}
          onPress={() => {
            void shareRuntimeLogs();
          }}
        />
        {exportInfo ? <DataNote>{exportInfo}</DataNote> : null}
        {exportError ? <InfoRow label="export error" value={exportError} /> : null}
      </Card>

      <Card>
        <DataNote>
          This timeline reflects local native iPhone Phone Mode events for the
          newest local TLR phone session with native events. Raw JSON export
          stays local until you choose where to share it.
        </DataNote>
      </Card>
    </Screen>
  );
}

export function WatchModeDataScreen() {
  const { activeSession, sessionHistory } = useAppState();
  const [epochs, setEpochs] = React.useState<WatchEpoch[]>([]);
  const [runtimeEvents, setRuntimeEvents] = React.useState<WatchRuntimeEvent[]>([]);
  const [summary, setSummary] = React.useState<{
    epochsReceived: number;
    usableEpochs: number;
    likelyRemEpochs: number;
    connectivityGaps: number;
    classifierVersions: string[];
  } | null>(null);
  const [runtimeSummary, setRuntimeSummary] =
    React.useState<WatchRuntimeLogSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const latestWatchSession = [activeSession, ...sessionHistory].find(
    (session): session is NightSession => session?.mode === "watch",
  );
  const latestCueDecision = [...runtimeEvents]
    .reverse()
    .find(
      (event) =>
        event.eventType === "watch_cue_decision" ||
        event.eventType === "watch_cue_played" ||
        event.eventType === "watch_cue_suppressed" ||
        event.eventType === "watch_cue_failed",
    );

  React.useEffect(() => {
    let mounted = true;

    async function loadWatchTimeline() {
      if (!latestWatchSession) {
        setEpochs([]);
        setRuntimeEvents([]);
        setSummary(null);
        setRuntimeSummary(null);
        return;
      }

      try {
        const db = await getLocalDb();
        const [nextEpochs, nextSummary, nextEvents] = await Promise.all([
          loadWatchEpochsForSession({
            db,
            sessionId: latestWatchSession.id,
          }),
          summarizeWatchSession({
            db,
            sessionId: latestWatchSession.id,
          }),
          loadWatchRuntimeEventsForSession({
            db,
            sessionId: latestWatchSession.id,
          }),
        ]);

        if (mounted) {
          setEpochs(nextEpochs);
          setRuntimeEvents(nextEvents);
          setSummary(nextSummary);
          setRuntimeSummary(summarizeWatchRuntime(nextEvents, nextEpochs));
          setError(null);
        }
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load watch epochs.",
          );
        }
      }
    }

    void loadWatchTimeline();

    return () => {
      mounted = false;
    };
  }, [latestWatchSession]);

  return (
    <Screen>
      <DataPageHeader title="Watch mode" />

      <Card>
        <InfoRow
          label="latest synced epoch"
          value={epochs[epochs.length - 1]?.epochEnd ?? "none"}
        />
        <InfoRow
          label="REM probability"
          value={
            typeof epochs[epochs.length - 1]?.remProbability === "number"
              ? epochs[epochs.length - 1]?.remProbability?.toFixed(2) ?? "unavailable"
              : "unavailable"
          }
        />
        <InfoRow
          label="sensor quality"
          value={epochs[epochs.length - 1]?.sensorQuality ?? "unknown"}
        />
        <InfoRow
          label="watch battery"
          value={
            typeof epochs[epochs.length - 1]?.watchBatteryLevel === "number"
              ? `${Math.round((epochs[epochs.length - 1]?.watchBatteryLevel ?? 0) * 100)}%`
              : "unknown"
          }
        />
        <InfoRow
          label="classifier"
          value={
            epochs[epochs.length - 1]?.classifierVersion ??
            "classifier unavailable"
          }
        />
        <InfoRow
          label="local session"
          value={latestWatchSession?.id ?? "no local watch session"}
        />
        <InfoRow
          label="epochs"
          value={summary ? String(summary.epochsReceived) : "0"}
        />
        <InfoRow
          label="usable epochs"
          value={summary ? String(summary.usableEpochs) : "0"}
        />
        <InfoRow
          label="likely REM epochs"
          value={summary ? String(summary.likelyRemEpochs) : "0"}
        />
        <InfoRow
          label="sync gaps"
          value={summary ? String(summary.connectivityGaps) : "0"}
        />
        <InfoRow
          label="cue deliveries"
          value={runtimeSummary ? String(runtimeSummary.cuesPlayed) : "0"}
        />
        <InfoRow
          label="cue suppressions"
          value={runtimeSummary ? String(runtimeSummary.cueSuppressions) : "0"}
        />
        <InfoRow
          label="cue failures"
          value={runtimeSummary ? String(runtimeSummary.cueFailures) : "0"}
        />
        <InfoRow
          label="movement pauses"
          value={runtimeSummary ? String(runtimeSummary.movementPauses) : "0"}
        />
        <InfoRow
          label="session classifier"
          value={
            summary && summary.classifierVersions.length > 0
              ? summary.classifierVersions.join(", ")
              : "classifier unavailable"
          }
        />
        <InfoRow
          label="latest decision"
          value={
            latestCueDecision
              ? stringPayload(latestCueDecision.payload, "reason") ??
                latestCueDecision.eventType
              : "none yet"
          }
        />
        {error ? <InfoRow label="error" value={error} /> : null}
      </Card>

      <Card>
        <DataNote>
          Watch data here is the synced/local record from the watch-owned night.
          Reachability only describes setup and post-night sync status.
        </DataNote>
      </Card>

      {runtimeEvents.length === 0 ? null : (
        <Card>
          {runtimeEvents.slice(-8).map((event) => (
            <Text
              selectable
              key={event.id}
              style={{
                color: colors.textSecondary,
                fontSize: typography.label.fontSize,
                lineHeight: typography.label.lineHeight,
              }}
            >
              {watchRuntimeEventLabel(event)}
            </Text>
          ))}
        </Card>
      )}

      {epochs.length === 0 ? (
        <Card>
          <Text
            selectable
            style={{
              color: colors.textDim,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              textAlign: "center",
            }}
          >
            No synced watch epochs yet.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {epochs.slice(-12).map((epoch) => (
            <Card key={epoch.id}>
              <InfoRow
                label="epoch"
                value={`${new Date(epoch.epochStart).toLocaleTimeString()} - ${new Date(
                  epoch.epochEnd,
                ).toLocaleTimeString()}`}
              />
              <InfoRow
                label="HR"
                value={fixedNumberLabel(epoch.heartRateSummary, 1)}
              />
              <InfoRow
                label="motion"
                value={fixedNumberLabel(epoch.motionSummary, 3)}
              />
              <InfoRow
                label="REM probability"
                value={formatEnginePercent(epoch.remProbability)}
              />
              <InfoRow
                label="sleep probability"
                value={formatEnginePercent(epoch.sleepProbability)}
              />
              <InfoRow label="REM label" value={epoch.remLabel ?? "unknown"} />
              <InfoRow
                label="movement stability"
                value={
                  epoch.stableLowMovementSeconds === undefined
                    ? "unknown"
                    : `${Math.round(epoch.stableLowMovementSeconds)}s`
                }
              />
              <InfoRow
                label="rough movement"
                value={epoch.roughMovementIntensity ?? "unknown"}
              />
              <InfoRow
                label="cue decision"
                value={epoch.cueDecisionReason ?? "none yet"}
              />
              <InfoRow
                label="sensor quality"
                value={epoch.sensorQuality ?? "unknown"}
              />
              <InfoRow
                label="battery"
                value={
                  epoch.watchBatteryLevel === undefined
                    ? "unknown"
                    : `${Math.round(epoch.watchBatteryLevel * 100)}%`
                }
              />
              <InfoRow
                label="setup/sync link"
                value={epoch.watchConnectivityState ?? "unknown"}
              />
              <InfoRow
                label="classifier"
                value={epoch.classifierVersion ?? "unknown"}
              />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

export function SleepHistoryDataScreen() {
  const {
    activeSession,
    deleteSession,
    latestEngineSnapshot,
    sleepHistory,
  } = useAppState();
  const { error, records, reloadRecords } = useSleepNightRecords();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const historicalWindows = latestEngineSnapshot.sleepTiming.predictedRemWindows.filter(
    (window) => window.source === "historical_sleep",
  );
  const selectedRecord = records[selectedIndex] ?? records[0];
  const logs = selectedRecord?.logs ?? [];
  const morningReport = selectedRecord?.morningReport;
  const startAt = selectedRecord ? nightStartedAt(selectedRecord) : undefined;
  const endAt = selectedRecord ? nightEndedAt(selectedRecord) : undefined;
  const motionSummaries = eventTypeCount(logs, "motion_summary");
  const cuesPlayed = eventTypeCount(logs, "cue_played");
  const trainingCuesPlayed = eventTypeCount(logs, "training_cue_played");
  const cueFailures = eventTypeCount(logs, "cue_failed") +
    eventTypeCount(logs, "training_cue_failed");
  const movementPauses = eventTypeCount(logs, "movement_pause_started");
  const interruptions = eventTypeCount(logs, "interruption_started") +
    eventTypeCount(logs, "interruption_ended");
  const routeChanges = eventTypeCount(logs, "route_changed");
  const runtimeErrors = eventTypeCount(logs, "runtime_error");
  const graph = graphPointsForLogs(logs);
  const isWatchRecord = selectedRecord?.session?.mode === "watch";
  const watchEpochs = selectedRecord?.watchEpochs ?? [];
  const watchRuntimeEvents = selectedRecord?.watchRuntimeEvents ?? [];
  const watchRuntimeSummary = selectedRecord?.watchRuntimeSummary ?? null;
  const watchGraph = graphPointsForWatchData({
    epochs: watchEpochs,
    runtimeEvents: watchRuntimeEvents,
  });
  const latestWatchEpoch = watchEpochs[watchEpochs.length - 1];
  const latestWatchCueDecision = [...watchRuntimeEvents]
    .reverse()
    .find(
      (event) =>
        event.eventType === "watch_cue_decision" ||
        event.eventType === "watch_cue_played" ||
        event.eventType === "watch_cue_suppressed" ||
        event.eventType === "watch_cue_failed",
    );

  React.useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, records.length - 1)));
  }, [records.length]);

  async function deleteSelectedNight() {
    if (!selectedRecord || isDeleting) {
      return;
    }

    const confirmed = await confirmSleepNightDelete(selectedRecord);

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      const session = selectedRecord.session;

      if (activeSession?.id === selectedRecord.id) {
        if (session?.mode === "phone" && phoneRuntime.isAvailable()) {
          try {
            await phoneRuntime.stopPhoneTlrSession({ reason: "user_stopped" });
          } catch {
            // Local deletion should still work if native runtime cleanup already happened.
          }
        }

      }

      const db = await getLocalDb();
      const archivedLogs = await loadArchivedPhoneRuntimeLogs(db);

      if (archivedLogs[selectedRecord.id]) {
        const nextArchivedLogs = { ...archivedLogs };
        delete nextArchivedLogs[selectedRecord.id];
        await saveArchivedPhoneRuntimeLogs({
          db,
          logs: nextArchivedLogs,
          updatedAt: new Date().toISOString(),
        });
      }

      if (session) {
        await deleteSession(session.id);
      }

      try {
        await phoneRuntime.clearPhoneRuntimeLogs(selectedRecord.id);
      } catch {
        // A non-phone or older native-only record may not have a native log file.
      }

      setSelectedIndex((index) => Math.min(index, Math.max(0, records.length - 2)));
      reloadRecords();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete this sleep night.";

      if (Platform.OS === "web") {
        globalThis.alert(message);
      } else {
        Alert.alert("Delete failed", message);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Screen>
      <DataPageHeader title="Sleep history" />

      {selectedRecord ? (
        <>
          <View style={{ gap: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <Pressable
                accessibilityLabel="Previous night"
                accessibilityRole="button"
                disabled={selectedIndex >= records.length - 1}
                onPress={() =>
                  setSelectedIndex((index) =>
                    Math.min(records.length - 1, index + 1),
                  )
                }
                style={({ pressed }) => ({
                  width: 44,
                  height: 40,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.cardBorder,
                  opacity:
                    selectedIndex >= records.length - 1 ? 0.35 : pressed ? 0.72 : 1,
                })}
              >
                <ChevronLeft color={colors.textPrimary} size={22} />
              </Pressable>
              <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
                <Text
                  selectable
                  style={{
                    color: colors.textPrimary,
                    fontSize: typography.title.fontSize,
                    lineHeight: typography.title.lineHeight,
                    textAlign: "center",
                  }}
                >
                  {formatNightTitle(selectedRecord)}
                </Text>
                <Text
                  selectable
                  style={{
                    color: colors.textMuted,
                    fontSize: typography.label.fontSize,
                    lineHeight: typography.label.lineHeight,
                    textAlign: "center",
                  }}
                >
                  {formatNightInterval(selectedRecord)}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Next night"
                accessibilityRole="button"
                disabled={selectedIndex <= 0}
                onPress={() => setSelectedIndex((index) => Math.max(0, index - 1))}
                style={({ pressed }) => ({
                  width: 44,
                  height: 40,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.cardBorder,
                  opacity: selectedIndex <= 0 ? 0.35 : pressed ? 0.72 : 1,
                })}
              >
                <ChevronRight color={colors.textPrimary} size={22} />
              </Pressable>
            </View>
            <InfoRow
              label="night"
              value={`${selectedIndex + 1} / ${records.length}`}
            />
            <InfoRow
              label="type"
              value={
                selectedRecord.session
                  ? `${selectedRecord.session.sessionType.replaceAll("_", " ")} / ${selectedRecord.session.mode ?? "none"}`
                  : "native phone log"
              }
            />
            <InfoRow
              label="duration"
              value={
                selectedRecord.session
                  ? formatSessionLength(selectedRecord.session)
                  : durationLabel(startAt, endAt)
              }
            />
            <InfoRow
              label="status"
              value={selectedRecord.session?.status.replaceAll("_", " ") ?? "native log only"}
            />
            {error ? <InfoRow label="history load" value={error} /> : null}
            <Pressable
              accessibilityLabel="Delete sleep night"
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={() => {
                void deleteSelectedNight();
              }}
              style={({ pressed }) => ({
                minHeight: 44,
                alignSelf: "flex-end",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: isDeleting ? 0.45 : pressed ? 0.72 : 1,
              })}
            >
              <Trash2 color={colors.textMuted} size={18} strokeWidth={1.8} />
              <Text
                selectable
                style={{
                  color: colors.textMuted,
                  fontSize: typography.body.fontSize,
                  lineHeight: typography.body.lineHeight,
                }}
              >
                {isDeleting ? "Deleting" : "Delete"}
              </Text>
            </Pressable>
          </View>

          <SectionTitle>Night graph</SectionTitle>
          <Card>
            <SleepNightGraph
              endAt={endAt}
              logs={logs}
              startAt={startAt}
              watchEpochs={watchEpochs}
              watchRuntimeEvents={watchRuntimeEvents}
            />
            <InfoRow
              label={isWatchRecord ? "phone motion points" : "motion points"}
              value={String(graph.motion.length)}
            />
            <InfoRow
              label={isWatchRecord ? "phone battery points" : "battery points"}
              value={String(graph.battery.length)}
            />
            <InfoRow
              label={isWatchRecord ? "phone cue markers" : "cue markers"}
              value={String(graph.cues.length)}
            />
            {isWatchRecord || watchEpochs.length > 0 ? (
              <>
                <InfoRow
                  label="sleep phase points"
                  value={String(watchGraph.sleep.length)}
                />
                <InfoRow label="REM points" value={String(watchGraph.rem.length)} />
                <InfoRow
                  label="HR points"
                  value={String(watchGraph.heartRate.length)}
                />
                <InfoRow
                  label="watch movement points"
                  value={String(watchGraph.movement.length)}
                />
                <InfoRow
                  label="sensor quality points"
                  value={String(watchGraph.sensorQuality.length)}
                />
                <InfoRow
                  label="watch battery points"
                  value={String(watchGraph.battery.length)}
                />
                <InfoRow
                  label="watch cue markers"
                  value={String(watchGraph.cues.length)}
                />
              </>
            ) : null}
          </Card>

          <SectionTitle>Session data</SectionTitle>
          <Card>
            <InfoRow label="session id" value={selectedRecord.id} />
            <InfoRow
              label="started"
              value={startAt ? new Date(startAt).toLocaleString() : "not available"}
            />
            <InfoRow
              label="ended"
              value={endAt ? new Date(endAt).toLocaleString() : "not available"}
            />
            <InfoRow
              label="training started"
              value={
                selectedRecord.session?.trainingStartedAt
                  ? new Date(
                      selectedRecord.session.trainingStartedAt,
                    ).toLocaleString()
                  : "not available"
              }
            />
            <InfoRow
              label="training ended"
              value={
                selectedRecord.session?.trainingEndedAt
                  ? new Date(selectedRecord.session.trainingEndedAt).toLocaleString()
                  : "not available"
              }
            />
            <InfoRow
              label="selected cue"
              value={selectedRecord.session?.selectedCueId ?? "not available"}
            />
            <InfoRow
              label="guided training"
              value={
                selectedRecord.session?.guidedTrainingSkipped === undefined
                  ? "not available"
                  : selectedRecord.session.guidedTrainingSkipped
                    ? "skipped"
                    : "completed"
              }
            />
          </Card>

          <SectionTitle>Runtime data</SectionTitle>
          <Card>
            {isWatchRecord ? (
              <>
                <InfoRow label="watch epochs" value={String(watchEpochs.length)} />
                <InfoRow
                  label="runtime events"
                  value={String(watchRuntimeEvents.length)}
                />
                <InfoRow
                  label="latest epoch"
                  value={
                    latestWatchEpoch
                      ? new Date(latestWatchEpoch.epochEnd).toLocaleString()
                      : "none"
                  }
                />
                <InfoRow
                  label="latest HR"
                  value={fixedNumberLabel(latestWatchEpoch?.heartRateSummary, 1)}
                />
                <InfoRow
                  label="latest motion"
                  value={fixedNumberLabel(latestWatchEpoch?.motionSummary, 3)}
                />
                <InfoRow
                  label="REM probability"
                  value={formatEnginePercent(latestWatchEpoch?.remProbability)}
                />
                <InfoRow
                  label="sensor quality"
                  value={latestWatchEpoch?.sensorQuality ?? "unknown"}
                />
                <InfoRow
                  label="setup/sync link"
                  value={latestWatchEpoch?.watchConnectivityState ?? "unknown"}
                />
                <InfoRow
                  label="cue decision"
                  value={
                    latestWatchEpoch?.cueDecisionReason ??
                    (latestWatchCueDecision
                      ? stringPayload(latestWatchCueDecision.payload, "reason")
                      : undefined) ??
                    "none yet"
                  }
                />
                <InfoRow
                  label="cue deliveries"
                  value={
                    watchRuntimeSummary
                      ? String(watchRuntimeSummary.cuesPlayed)
                      : "0"
                  }
                />
                <InfoRow
                  label="cue suppressions"
                  value={
                    watchRuntimeSummary
                      ? String(watchRuntimeSummary.cueSuppressions)
                      : "0"
                  }
                />
                <InfoRow
                  label="cue failures"
                  value={
                    watchRuntimeSummary
                      ? String(watchRuntimeSummary.cueFailures)
                      : "0"
                  }
                />
                <InfoRow
                  label="classifier"
                  value={
                    watchRuntimeSummary &&
                    watchRuntimeSummary.classifierVersions.length > 0
                      ? watchRuntimeSummary.classifierVersions.join(", ")
                      : "unknown"
                  }
                />
              </>
            ) : (
              <>
                <InfoRow label="raw native events" value={String(logs.length)} />
                <InfoRow label="training cues" value={String(trainingCuesPlayed)} />
                <InfoRow label="runtime cues" value={String(cuesPlayed)} />
                <InfoRow label="cue failures" value={String(cueFailures)} />
                <InfoRow label="motion summaries" value={String(motionSummaries)} />
                <InfoRow
                  label="motion intensity"
                  value={motionIntensityCounts(logs)}
                />
                <InfoRow label="movement pauses" value={String(movementPauses)} />
                <InfoRow label="interruptions" value={String(interruptions)} />
                <InfoRow label="route changes" value={String(routeChanges)} />
                <InfoRow label="runtime errors" value={String(runtimeErrors)} />
                <InfoRow
                  label="battery range"
                  value={batteryLevelLabel(logs)}
                />
                <InfoRow
                  label="Low Power samples"
                  value={String(
                    countPayloadMatches(
                      logs,
                      "battery_summary",
                      "lowPowerMode",
                      true,
                    ),
                  )}
                />
                <InfoRow
                  label="thermal states"
                  value={uniquePayloadValues(logs, "battery_summary", "thermalState")}
                />
              </>
            )}
          </Card>

          <SectionTitle>Morning review</SectionTitle>
          <Card>
            {morningReport ? (
              <>
                <InfoRow
                  label="remembered dream"
                  value={morningReport.rememberedDream ? "yes" : "no"}
                />
                <InfoRow
                  label="lucid dream"
                  value={nullableBooleanLabel(morningReport.lucidDream)}
                />
                <InfoRow
                  label="heard cue"
                  value={nullableBooleanLabel(morningReport.heardCue)}
                />
                <InfoRow
                  label="cue in dream"
                  value={nullableBooleanLabel(morningReport.cueIncorporated)}
                />
                <InfoRow
                  label="cue woke user"
                  value={nullableBooleanLabel(morningReport.cueWokeUser)}
                />
                <InfoRow
                  label="returned to sleep"
                  value={nullableBooleanLabel(morningReport.returnedToSleep)}
                />
                <InfoRow
                  label="sleep quality"
                  value={
                    morningReport.sleepQualityRating
                      ? String(morningReport.sleepQualityRating)
                      : "skipped"
                  }
                />
              </>
            ) : (
              <InfoRow label="report" value="not saved for this night" />
            )}
          </Card>

          <SectionTitle>Event listing</SectionTitle>
          <Card>
            {isWatchRecord ? (
              compactWatchRuntimeEvents(watchRuntimeEvents).length === 0 ? (
                <InfoRow label="events" value="none for this night" />
              ) : (
                compactWatchRuntimeEvents(watchRuntimeEvents).map((event) => (
                  <Text
                    selectable
                    key={event.id}
                    style={{
                      color: colors.textSecondary,
                      fontSize: typography.label.fontSize,
                      lineHeight: typography.label.lineHeight,
                    }}
                  >
                    {watchRuntimeEventLabel(event)}
                  </Text>
                ))
              )
            ) : compactTimelineEvents(logs).length === 0 ? (
              <InfoRow label="events" value="none for this night" />
            ) : (
              compactTimelineEvents(logs).map((event) => (
                <Text
                  selectable
                  key={event.id}
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.label.fontSize,
                    lineHeight: typography.label.lineHeight,
                  }}
                >
                  {runtimeEventLabel(event)}
                </Text>
              ))
            )}
          </Card>
        </>
      ) : (
        <Card>
          <Text
            selectable
            style={{
              color: colors.textDim,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              textAlign: "center",
            }}
          >
            No local sleep sessions yet.
          </Text>
        </Card>
      )}

      <SectionTitle>External sleep prior</SectionTitle>
      <Card>
        <InfoRow label="enabled" value={sleepHistory.enabled ? "on" : "off"} />
        <InfoRow
          label="source"
          value={formatSleepHistorySource(sleepHistory.source)}
        />
        <InfoRow label="permission" value={sleepHistory.permissionStatus} />
        <InfoRow
          label="imported sessions"
          value={String(sleepHistory.nightsImported)}
        />
        <InfoRow
          label="prior confidence"
          value={sleepHistory.prior?.confidence ?? "none"}
        />
        <InfoRow
          label="REM density"
          value={formatDensitySummary(sleepHistory.prior?.remDensityByMinute ?? [])}
        />
        <InfoRow
          label="historical REM score"
          value={latestEngineSnapshot.currentValues.historicalRemWindowScore}
        />
        <InfoRow
          label="decision used prior"
          value={latestEngineSnapshot.currentValues.latestDecisionUsedHistoricalSleep}
        />
        {historicalWindows.length === 0 ? (
          <InfoRow label="predicted REM windows" value="none yet" />
        ) : (
          historicalWindows.slice(0, 3).map((window, index) => (
            <InfoRow
              key={`${window.startAt}-${window.endAt}`}
              label={`REM window ${index + 1}`}
              value={formatWindow(window)}
            />
          ))
        )}
      </Card>

      <Card>
        <DataNote>
          Sleep-history calibration is local-only by default and only informs
          local timing and cue scoring.
        </DataNote>
      </Card>
    </Screen>
  );
}

export function SessionsDataScreen() {
  const { sessionHistory } = useAppState();

  return (
    <Screen>
      <DataPageHeader title="Sessions" />

      {sessionHistory.length === 0 ? (
        <Card>
          <Text
            selectable
            style={{
              color: colors.textDim,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              textAlign: "center",
            }}
          >
            No local sessions yet.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {sessionHistory.map((session) => (
            <Card key={session.id}>
              <InfoRow label="session" value={session.sessionType} />
              <InfoRow label="mode" value={session.mode ?? "none"} />
              <InfoRow label="status" value={session.status.replaceAll("_", " ")} />
              <InfoRow label="length" value={formatSessionLength(session)} />
              <InfoRow
                label="started"
                value={new Date(session.startedAt).toLocaleString()}
              />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
