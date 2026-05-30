import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  History,
  Moon,
  Smartphone,
} from "lucide-react-native";
import React from "react";
import * as FileSystem from "expo-file-system/legacy";
import { Platform, Pressable, Share, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import type {
  ExternalSleepSource,
  PredictedRemWindow,
  RemDensityBin,
} from "@/src/domain/types";
import { formatEnginePercent } from "@/src/engine";
import { formatSessionLength } from "@/src/features/sessions/sessionLength";
import {
  phoneRuntime,
  summarizePhoneRuntimeEvents,
  type NativePhoneRuntimeEvent,
} from "@/src/native/phoneRuntime";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

type DataRoute =
  | "/data/tlr-engine"
  | "/data/iphone-runtime"
  | "/data/sleep-history"
  | "/data/sessions";

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
  const [runtimeLogError, setRuntimeLogError] = React.useState<string | null>(
    null,
  );
  const { activeSession, sessionHistory } = useAppState();
  const runtimeSession =
    activeSession?.sessionType === "tlr" && activeSession.mode === "phone"
      ? activeSession
      : sessionHistory.find(
          (session) =>
            session.sessionType === "tlr" && session.mode === "phone",
        );
  const timelineEvents = runtimeLogs.filter(isTimelineEvent).slice(-40).reverse();

  React.useEffect(() => {
    let cancelled = false;

    async function loadRuntimeLogs() {
      if (!runtimeSession) {
        setRuntimeLogs([]);
        return;
      }

      try {
        const logs = await phoneRuntime.getPhoneRuntimeLogs(runtimeSession.id);

        if (!cancelled) {
          setRuntimeLogs(logs);
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
  }, [runtimeSession]);

  return {
    runtimeLogs,
    runtimeLogError,
    runtimeSession,
    timelineEvents,
  };
}

export function DataScreen() {
  const { latestEngineSnapshot, sessionHistory, sleepHistory } = useAppState();

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

      <Card>
        <InfoRow
          label="engine status"
          value={latestEngineSnapshot.currentValues.currentEngineStatus}
        />
        <InfoRow
          label="decision reason"
          value={latestEngineSnapshot.currentValues.latestDecisionReason}
        />
        <InfoRow label="local sessions" value={String(sessionHistory.length)} />
        <InfoRow
          label="sleep history"
          value={sleepHistory.enabled ? "on" : "off"}
        />
      </Card>

      <Card>
        <BarChart3 color={colors.textMuted} size={23} strokeWidth={1.8} />
        <DataNote>
          Data stays local by default. Structured research upload and dream
          journal upload remain separate opt-ins.
        </DataNote>
      </Card>
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
          label="connectivity"
          value={watch?.connectivityState ?? "not available yet"}
        />
        <InfoRow label="classifier" value="TBD; no real REM classifier connected" />
      </Card>

      <SectionTitle>Decision log</SectionTitle>
      <Card>
        <InfoRow label="cue history" value="see iPhone runtime timeline" />
        <InfoRow label="movement events" value="see iPhone runtime timeline" />
        <InfoRow label="watch epochs" value="no native watch stream connected" />
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
  const { runtimeLogs, runtimeLogError, runtimeSession, timelineEvents } =
    useRuntimeTimeline();
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
        exportSchema: "lucidcue-phone-runtime-export-v1",
        exportedAt: new Date().toISOString(),
        session: runtimeSession,
        status,
        summary: summarizePhoneRuntimeEvents(logs),
        eventCount: logs.length,
        events: logs,
      };
      const json = JSON.stringify(payload, null, 2);
      const fileName = `lucidcue-phone-runtime-${safeFilePart(runtimeSession.id)}-${safeFilePart(payload.exportedAt)}.json`;
      const message = `LucidCue iPhone Phone Mode logs\nsession: ${runtimeSession.id}\nevents: ${logs.length}\nexportedAt: ${payload.exportedAt}`;

      if (Platform.OS === "ios" && FileSystem.documentDirectory) {
        const exportDirectory = `${FileSystem.documentDirectory}lucidcue-exports/`;
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
          latest active or completed TLR phone session. Raw JSON export stays
          local until you choose where to share it.
        </DataNote>
      </Card>
    </Screen>
  );
}

export function SleepHistoryDataScreen() {
  const { latestEngineSnapshot, sleepHistory } = useAppState();
  const historicalWindows = latestEngineSnapshot.sleepTiming.predictedRemWindows.filter(
    (window) => window.source === "historical_sleep",
  );

  return (
    <Screen>
      <DataPageHeader title="Sleep history" />

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
          Sleep-history calibration is local-only by default. No cloud sync, REM
          classifier, or native watch data path is active yet.
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
