import { router } from "expo-router";
import { Eye, Save } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
  TextField,
} from "@/src/components/ui";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  saveMorningReport,
  saveWatchEpochs,
  saveWatchRuntimeEvents,
  updatePhoneNightCalibrationFeedback,
} from "@/src/data/local/repositories";
import type { MorningReport } from "@/src/domain/types";
import {
  MORNING_REPORT_CORE_FIELDS,
  MORNING_REPORT_OPTIONAL_LUCIDITY_FIELDS,
  MORNING_REPORT_OPTIONAL_LUCIDITY_STORAGE,
  type MorningReportField,
} from "@/src/features/reports/morningReportSchema";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import {
  importPhoneRuntimeLogsToLocalRecords,
  latestPhoneRuntimeStopTimestamp,
  phoneRuntime,
  summarizePhoneRuntimeEvents,
  type PhoneRuntimeLogSummary,
} from "@/src/native/phoneRuntime";
import {
  latestWatchRuntimeStopTimestamp,
  summarizeWatchRuntime,
  watchRuntime,
  type WatchRuntimeLogSummary,
} from "@/src/native/watch";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

type FieldValue = boolean | number | null;

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nullableBoolean(value: FieldValue): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberValue(value: FieldValue): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: MorningReportField;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  if (field.type === "rating") {
    return (
      <TextField
        height={44}
        keyboardType="numeric"
        placeholder="1-5"
        value={typeof value === "number" ? String(value) : ""}
        onChangeText={(text) => {
          const sanitized = text.replace(/\D/g, "");

          onChange(sanitized ? Number(sanitized) : null);
        }}
      />
    );
  }

  const options =
    field.type === "boolean"
      ? [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ]
      : [
          { label: "Yes", value: true },
          { label: "No", value: false },
          { label: "Skip", value: null },
        ];

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="button"
          key={option.label}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 42,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: borders.hairline,
            borderRadius: radii.card,
            borderColor:
              value === option.value ? colors.textMuted : colors.cardBorder,
            backgroundColor: colors.card,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <Text
            selectable
            style={{
              color:
                value === option.value ? colors.textPrimary : colors.textMuted,
              fontSize: typography.label.fontSize,
              lineHeight: typography.label.lineHeight,
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ReviewField({
  field,
  value,
  onChange,
}: {
  field: MorningReportField;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  return (
    <Card compact>
      <Text
        selectable
        style={{
          color: colors.textPrimary,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {field.label}
      </Text>
      <FieldControl field={field} value={value} onChange={onChange} />
    </Card>
  );
}

export function MorningReviewScreen() {
  const { activeSession, refreshPhoneNightCalibration, sendSessionEvent } =
    useAppState();
  const [answers, setAnswers] = useState<Record<string, FieldValue>>({});
  const [showOptional, setShowOptional] = useState(false);
  const [runtimeSummary, setRuntimeSummary] =
    useState<PhoneRuntimeLogSummary | null>(null);
  const [runtimeSummaryError, setRuntimeSummaryError] = useState<string | null>(
    null,
  );
  const [watchRuntimeSummary, setWatchRuntimeSummary] =
    useState<WatchRuntimeLogSummary | null>(null);
  const [watchRuntimeSummaryError, setWatchRuntimeSummaryError] = useState<
    string | null
  >(null);
  const usesPhoneRuntime =
    activeSession?.sessionType === "tlr" && activeSession.mode === "phone";
  const usesWatchRuntime =
    activeSession?.sessionType === "tlr" && activeSession.mode === "watch";

  React.useEffect(() => {
    let cancelled = false;

    async function loadRuntimeSummary() {
      if (!activeSession || !usesPhoneRuntime) {
        return;
      }

      try {
        const logs = await phoneRuntime.getPhoneRuntimeLogs(activeSession.id);
        const summary = summarizePhoneRuntimeEvents(logs);

        await importPhoneRuntimeLogsToLocalRecords(logs);
        await refreshPhoneNightCalibration();

        if (
          (summary.stopped || summary.completed || summary.errored) &&
          canTransitionSession(
            activeSession.sessionType,
            activeSession.status,
            "end_session",
          )
        ) {
          sendSessionEvent(
            "end_session",
            latestPhoneRuntimeStopTimestamp(logs) ?? new Date().toISOString(),
          );
        }

        if (!cancelled) {
          setRuntimeSummary(summary);
          setRuntimeSummaryError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRuntimeSummaryError(
            error instanceof Error
              ? error.message
              : "Could not load native phone runtime logs.",
          );
        }
      }
    }

    void loadRuntimeSummary();

    return () => {
      cancelled = true;
    };
  }, [
    activeSession,
    refreshPhoneNightCalibration,
    sendSessionEvent,
    usesPhoneRuntime,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadWatchRuntimeSummary() {
      if (!activeSession || !usesWatchRuntime) {
        return;
      }

      try {
        const [epochs, logs] = await Promise.all([
          watchRuntime.getWatchEpochs(activeSession.id),
          watchRuntime.getWatchRuntimeLogs(activeSession.id),
        ]);
        const summary = summarizeWatchRuntime(logs, epochs);
        const db = await getLocalDb();

        await saveWatchEpochs({ db, records: epochs });
        await saveWatchRuntimeEvents({ db, events: logs });

        if (
          (summary.stopped || summary.completed || summary.errored) &&
          canTransitionSession(
            activeSession.sessionType,
            activeSession.status,
            "end_session",
          )
        ) {
          sendSessionEvent(
            "end_session",
            latestWatchRuntimeStopTimestamp(logs) ?? new Date().toISOString(),
          );
        }

        if (!cancelled) {
          setWatchRuntimeSummary(summary);
          setWatchRuntimeSummaryError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setWatchRuntimeSummaryError(
            error instanceof Error
              ? error.message
              : "Could not load native watch runtime logs.",
          );
        }
      }
    }

    void loadWatchRuntimeSummary();

    return () => {
      cancelled = true;
    };
  }, [activeSession, sendSessionEvent, usesWatchRuntime]);

  return (
    <Screen>
      <SectionTitle>Morning review</SectionTitle>

      {usesPhoneRuntime ? (
        <Card>
          <InfoRow
            label="cues played"
            value={runtimeSummary ? String(runtimeSummary.cuesPlayed) : "loading"}
          />
          <InfoRow
            label="cue failures"
            value={runtimeSummary ? String(runtimeSummary.cueFailures) : "loading"}
          />
          <InfoRow
            label="motion summaries"
            value={
              runtimeSummary ? String(runtimeSummary.motionSummaries) : "loading"
            }
          />
          <InfoRow
            label="movement pauses"
            value={
              runtimeSummary ? String(runtimeSummary.movementPauses) : "loading"
            }
          />
          <InfoRow
            label="interruptions"
            value={runtimeSummary ? String(runtimeSummary.interruptions) : "loading"}
          />
          <InfoRow
            label="runtime status"
            value={
              runtimeSummary
                ? runtimeSummary.errored
                  ? "error"
                  : runtimeSummary.completed
                    ? "completed"
                    : runtimeSummary.stopped
                      ? "stopped"
                      : "not stopped"
                : "loading"
            }
          />
          {runtimeSummaryError ? (
            <Text
              selectable
              style={{
                color: colors.textSecondary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              {runtimeSummaryError}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {usesWatchRuntime ? (
        <Card>
          <InfoRow
            label="watch epochs"
            value={
              watchRuntimeSummary
                ? String(watchRuntimeSummary.epochsReceived)
                : "loading"
            }
          />
          <InfoRow
            label="likely rem epochs"
            value={
              watchRuntimeSummary
                ? String(watchRuntimeSummary.likelyRemEpochs)
                : "loading"
            }
          />
          <InfoRow
            label="cues played"
            value={
              watchRuntimeSummary
                ? String(watchRuntimeSummary.cuesPlayed)
                : "loading"
            }
          />
          <InfoRow
            label="cue suppressions"
            value={
              watchRuntimeSummary
                ? String(watchRuntimeSummary.cueSuppressions)
                : "loading"
            }
          />
          <InfoRow
            label="movement pauses"
            value={
              watchRuntimeSummary
                ? String(watchRuntimeSummary.movementPauses)
                : "loading"
            }
          />
          <InfoRow
            label="classifier"
            value={
              watchRuntimeSummary
                ? watchRuntimeSummary.classifierVersions.join(", ") || "unknown"
                : "loading"
            }
          />
          <InfoRow
            label="runtime status"
            value={
              watchRuntimeSummary
                ? watchRuntimeSummary.errored
                  ? "error"
                  : watchRuntimeSummary.completed
                    ? "completed"
                    : watchRuntimeSummary.stopped
                      ? "stopped"
                      : "not stopped"
                : "loading"
            }
          />
          {watchRuntimeSummaryError ? (
            <Text
              selectable
              style={{
                color: colors.textSecondary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              {watchRuntimeSummaryError}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Core report fields stay short by default. Dream journal text/audio is
          separate and local-only unless explicit dream upload consent is
          enabled later.
        </Text>
      </Card>

      {MORNING_REPORT_CORE_FIELDS.map((field) => (
        <ReviewField
          key={field.id}
          field={field}
          value={answers[field.id] ?? null}
          onChange={(value) =>
            setAnswers((current) => ({ ...current, [field.id]: value }))
          }
        />
      ))}

      <PrimaryPillButton
        icon={Eye}
        label={showOptional ? "Hide Optional Detail" : "Optional Lucidity Detail"}
        onPress={() => setShowOptional((value) => !value)}
      />

      {showOptional ? (
        <View style={{ gap: 12 }}>
          <Card>
            <Text
              selectable
              style={{
                color: colors.textMuted,
                fontSize: typography.label.fontSize,
                lineHeight: typography.label.lineHeight,
              }}
            >
              Optional lucidity detail is conceptually stored through{" "}
              {MORNING_REPORT_OPTIONAL_LUCIDITY_STORAGE.table} with form id{" "}
              {MORNING_REPORT_OPTIONAL_LUCIDITY_STORAGE.formId}.
            </Text>
          </Card>
          {MORNING_REPORT_OPTIONAL_LUCIDITY_FIELDS.map((field) => (
            <ReviewField
              key={field.id}
              field={field}
              value={answers[field.id] ?? null}
              onChange={(value) =>
                setAnswers((current) => ({ ...current, [field.id]: value }))
              }
            />
          ))}
        </View>
      ) : null}

      <PrimaryPillButton
        icon={Save}
        label="Save Review"
        onPress={async () => {
          if (activeSession) {
            const submittedAt = new Date().toISOString();
            const report: MorningReport = {
              id: createId("morning-report"),
              sessionId: activeSession.id,
              submittedAt,
              rememberedDream: answers.remembered_dream === true,
              lucidDream: nullableBoolean(answers.lucid_dream),
              heardCue: nullableBoolean(answers.heard_cue),
              cueIncorporated: nullableBoolean(answers.cue_incorporated),
              cueWokeUser: nullableBoolean(answers.cue_woke_user),
              returnedToSleep: nullableBoolean(answers.returned_to_sleep),
              sleepQualityRating: numberValue(answers.sleep_quality_rating),
            };
            const db = await getLocalDb();

            await saveMorningReport({ db, report });
            await updatePhoneNightCalibrationFeedback({
              db,
              sessionId: activeSession.id,
              cueWokeUser: report.cueWokeUser,
              sleepQualityRating: report.sleepQualityRating,
              updatedAt: submittedAt,
            });
            await refreshPhoneNightCalibration();

            if (
              canTransitionSession(
                activeSession.sessionType,
                activeSession.status,
                "complete_morning_review",
              )
            ) {
              sendSessionEvent("complete_morning_review");
            }
          }

          router.push("/data");
        }}
      />
    </Screen>
  );
}
