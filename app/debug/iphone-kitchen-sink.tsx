import { Redirect, router } from "expo-router";
import {
  ArrowLeft,
  Download,
  Play,
  RefreshCw,
  Share2,
  Square,
} from "lucide-react-native";
import React from "react";
import { Alert, Platform, Share, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  getAppSetting,
  setAppSetting,
  upsertLocalSession,
} from "@/src/data/local/repositories";
import type { NightSession } from "@/src/domain/types";
import {
  DEV_KITCHEN_SINK_DURATION_SECONDS,
  buildDevKitchenSinkPhoneSessionPlan,
  importPhoneRuntimeLogsToLocalRecords,
  latestPhoneRuntimeStopTimestamp,
  phoneRuntime,
  summarizePhoneRuntimeEvents,
  type NativePhoneRuntimeEvent,
  type PhoneRuntimeLogSummary,
  type PhoneRuntimeStatus,
} from "@/src/native/phoneRuntime";
import { TLR_PROTOCOL_VERSION } from "@/src/protocol/tlrProtocol";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

const DEV_KITCHEN_SINK_SESSION_ID_SETTING =
  "dev_phone_kitchen_sink_session_id";

function createDevSession(input: {
  participantId: string;
  now: string;
  selectedCueId: string;
}): NightSession {
  const startedAt = new Date(Date.parse(input.now) - 30 * 1000).toISOString();

  return {
    id: `dev-kitchen-sink-${Date.now()}`,
    participantId: input.participantId,
    sessionType: "tlr",
    mode: "phone",
    status: "cueing",
    protocolVersion: TLR_PROTOCOL_VERSION,
    startedAt,
    trainingStartedAt: startedAt,
    trainingEndedAt: input.now,
    cueingStartedAt: input.now,
    selectedCueId: input.selectedCueId,
    guidedTrainingSkipped: true,
  };
}

function formatPayload(payload: Record<string, unknown>): string {
  const serialized = JSON.stringify(payload, null, 2);

  return serialized.length > 700 ? `${serialized.slice(0, 700)}...` : serialized;
}

function formatSummary(summary: PhoneRuntimeLogSummary | null): string {
  if (!summary) {
    return "none";
  }

  return [
    `${summary.cuesPlayed} cues`,
    `${summary.cueFailures} cue failures`,
    `${summary.motionSummaries} motion summaries`,
    `${summary.movementPauses} movement pauses`,
    `${summary.interruptions} interruptions`,
  ].join(" / ");
}

export default function IPhoneKitchenSinkRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  const {
    engineSettings,
    isHydrated,
    participantId,
    tlrOptions,
  } = useAppState();
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<PhoneRuntimeStatus | null>(null);
  const [logs, setLogs] = React.useState<NativePhoneRuntimeEvent[]>([]);
  const [summary, setSummary] = React.useState<PhoneRuntimeLogSummary | null>(
    null,
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const [busyLabel, setBusyLabel] = React.useState<string | null>(null);

  const activeLogSessionId = status?.sessionId ?? sessionId;
  const latestEvent = logs[logs.length - 1] ?? null;

  const refresh = React.useCallback(
    async (explicitSessionId?: string): Promise<void> => {
      const runtimeStatus = await phoneRuntime.getPhoneRuntimeStatus();
      const logSessionId = explicitSessionId ?? runtimeStatus.sessionId ?? sessionId;

      setStatus(runtimeStatus);

      if (!logSessionId) {
        setLogs([]);
        setSummary(null);
        return;
      }

      setSessionId(logSessionId);

      const nextLogs = await phoneRuntime.getPhoneRuntimeLogs(logSessionId);

      setLogs(nextLogs);
      setSummary(summarizePhoneRuntimeEvents(nextLogs));
    },
    [sessionId],
  );

  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let cancelled = false;

    async function restoreLastSessionId(): Promise<void> {
      const db = await getLocalDb();
      const persistedSessionId = await getAppSetting<string>(
        db,
        DEV_KITCHEN_SINK_SESSION_ID_SETTING,
      );

      if (cancelled) {
        return;
      }

      if (persistedSessionId) {
        setSessionId(persistedSessionId);
      }

      await refresh(persistedSessionId ?? undefined);
    }

    void restoreLastSessionId().catch((error) => {
      if (!cancelled) {
        setMessage(
          error instanceof Error ? error.message : "Could not load runtime state.",
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isHydrated, refresh]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [refresh]);

  async function startTest(): Promise<void> {
    if (Platform.OS !== "ios") {
      setMessage("This dev smoke test requires an iPhone development build.");
      return;
    }

    setBusyLabel("Starting...");

    try {
      const now = new Date().toISOString();
      const session = createDevSession({
        participantId,
        now,
        selectedCueId: tlrOptions.selectedCueId,
      });
      const plan = buildDevKitchenSinkPhoneSessionPlan({
        session,
        settings: engineSettings,
        tlrOptions,
        now,
      });
      const db = await getLocalDb();

      await upsertLocalSession({ db, session });
      await setAppSetting(
        db,
        DEV_KITCHEN_SINK_SESSION_ID_SETTING,
        session.id,
        now,
      );
      await phoneRuntime.clearPhoneRuntimeLogs(session.id);
      await phoneRuntime.startPhoneTlrSession(plan);
      setSessionId(session.id);
      setMessage("Kitchen sink started. Lock the iPhone now.");
      await refresh(session.id);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Could not start kitchen sink.";

      setMessage(nextMessage);

      Alert.alert("Kitchen sink failed", nextMessage);
    } finally {
      setBusyLabel(null);
    }
  }

  async function stopTest(): Promise<void> {
    setBusyLabel("Stopping...");

    try {
      await phoneRuntime.stopPhoneTlrSession({ reason: "user_stopped" });
      setMessage("Runtime stopped. Refresh or import logs.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not stop test.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function importLogs(): Promise<void> {
    if (!activeLogSessionId) {
      setMessage("No kitchen sink session id is available.");
      return;
    }

    setBusyLabel("Importing...");

    try {
      const nextLogs = await phoneRuntime.getPhoneRuntimeLogs(activeLogSessionId);
      const nextSummary = summarizePhoneRuntimeEvents(nextLogs);
      const stoppedAt =
        latestPhoneRuntimeStopTimestamp(nextLogs) ?? new Date().toISOString();
      const db = await getLocalDb();

      await importPhoneRuntimeLogsToLocalRecords(nextLogs);

      if (nextSummary.stopped || nextSummary.completed || nextSummary.errored) {
        await upsertLocalSession({
          db,
          session: {
            id: activeLogSessionId,
            participantId,
            sessionType: "tlr",
            mode: "phone",
            status: "ended",
            protocolVersion: TLR_PROTOCOL_VERSION,
            startedAt: nextLogs[0]?.timestamp ?? stoppedAt,
            endedAt: stoppedAt,
            trainingStartedAt: nextLogs[0]?.timestamp ?? stoppedAt,
            trainingEndedAt: nextLogs[0]?.timestamp ?? stoppedAt,
            cueingStartedAt: nextLogs[0]?.timestamp ?? stoppedAt,
            selectedCueId: tlrOptions.selectedCueId,
            guidedTrainingSkipped: true,
          },
        });
      }

      setLogs(nextLogs);
      setSummary(nextSummary);
      setMessage("Native runtime logs imported into local cue/movement records.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import logs.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function shareLogs(): Promise<void> {
    await Share.share({
      message: JSON.stringify(
        {
          sessionId: activeLogSessionId,
          status,
          summary,
          logs,
        },
        null,
        2,
      ),
      title: "LucidTLR 45-minute kitchen sink logs",
    });
  }

  return (
    <Screen bottomNav={false}>
      <SectionTitle>45-minute kitchen sink</SectionTitle>

      <Card>
        <InfoRow label="dev-only" value="production native runtime smoke test" />
        <InfoRow label="runtime" value={status?.available ? "available" : "unavailable"} />
        <InfoRow
          label="running"
          value={status?.running ? "yes" : "no"}
        />
        <InfoRow label="session" value={activeLogSessionId ?? "none"} />
        <InfoRow
          label="duration"
          value={`${DEV_KITCHEN_SINK_DURATION_SECONDS / 60} minutes`}
        />
        <InfoRow label="summary" value={formatSummary(summary)} />
        <InfoRow label="latest event" value={latestEvent?.eventType ?? "none"} />
      </Card>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Start, lock the iPhone, keep it charging, enable Low Power Mode and
          Sleep Focus, create one interruption or route change, and add movement
          after the first quiet minute. This uses the real native Phone runtime
          with a compressed test-only predicted REM window. Native logs are the
          recording surface; raw microphone recording is not used.
        </Text>
      </Card>

      {status && !status.available ? (
        <Card>
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
            }}
          >
            {status.unavailableReason ?? "Native runtime unavailable."}
          </Text>
        </Card>
      ) : null}

      {message ? (
        <Card>
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
            }}
          >
            {message}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: 8 }}>
        <PrimaryPillButton
          disabled={Boolean(busyLabel)}
          icon={Play}
          label={busyLabel ?? "Start 45-minute locked kitchen sink"}
          onPress={() => void startTest()}
        />
        <PrimaryPillButton
          disabled={Boolean(busyLabel)}
          icon={Square}
          label="Stop runtime"
          onPress={() => void stopTest()}
        />
        <PrimaryPillButton
          disabled={Boolean(busyLabel)}
          icon={RefreshCw}
          label="Refresh logs"
          onPress={() => void refresh()}
        />
        <PrimaryPillButton
          disabled={Boolean(busyLabel) || logs.length === 0}
          icon={Download}
          label="Import logs"
          onPress={() => void importLogs()}
        />
        <PrimaryPillButton
          disabled={logs.length === 0}
          icon={Share2}
          label="Share logs"
          onPress={() => void shareLogs()}
        />
        <PrimaryPillButton
          icon={ArrowLeft}
          label="Back to iOS Phone Mode"
          onPress={() => router.push("/settings/ios-phone-mode")}
        />
      </View>

      <View style={{ gap: 8 }}>
        {[...logs].reverse().slice(0, 80).map((event) => (
          <Card compact key={event.id}>
            <InfoRow
              label={event.eventType}
              value={new Date(event.timestamp).toLocaleString()}
            />
            <Text
              selectable
              style={{
                color: colors.textMuted,
                fontSize: typography.label.fontSize,
                lineHeight: typography.label.lineHeight,
              }}
            >
              {formatPayload(event.payload)}
            </Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
