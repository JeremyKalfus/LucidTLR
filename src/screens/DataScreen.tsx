import { ChevronDown, ChevronRight } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import type { ExternalSleepSource, PredictedRemWindow, RemDensityBin } from "@/src/domain/types";
import { formatEnginePercent } from "@/src/engine";
import { formatSessionLength } from "@/src/features/sessions/sessionLength";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

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

export function DataScreen() {
  const [showEngineDetails, setShowEngineDetails] = React.useState(false);
  const { engineDecisionLog, latestEngineSnapshot, sessionHistory, sleepHistory } =
    useAppState();
  const decision = latestEngineSnapshot.decision;
  const watch = decision.watch;
  const historicalWindows = latestEngineSnapshot.sleepTiming.predictedRemWindows.filter(
    (window) => window.source === "historical_sleep",
  );
  const visibleRemThreshold =
    typeof decision.metadata.threshold === "number"
      ? decision.metadata.threshold
      : undefined;
  const showDecisionLog = isOvernightEngineStatus(
    latestEngineSnapshot.sessionStatus,
  );

  return (
    <Screen>
      <SectionTitle>Data</SectionTitle>

      <Card compact>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            showEngineDetails ? "Hide TLR engine details" : "Show TLR engine details"
          }
          onPress={() => setShowEngineDetails((value) => !value)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text
              selectable
              style={{
                color: colors.textPrimary,
                flex: 1,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              TLR engine
            </Text>
            {showEngineDetails ? (
              <ChevronDown color={colors.textMuted} size={22} strokeWidth={1.8} />
            ) : (
              <ChevronRight color={colors.textMuted} size={22} strokeWidth={1.8} />
            )}
          </View>
        </Pressable>
      </Card>

      {showEngineDetails ? (
        <View style={{ gap: 12 }}>
          <Card>
            <InfoRow label="engine status" value={latestEngineSnapshot.currentValues.currentEngineStatus} />
            <InfoRow label="decision reason" value={latestEngineSnapshot.currentValues.latestDecisionReason} />
            <InfoRow label="opportunity score" value={showDecisionLog ? decision.opportunityScore.toFixed(2) : "not running"} />
            <InfoRow label="next check" value={latestEngineSnapshot.currentValues.nextCheckTime} />
            <InfoRow label="suppression reason" value={latestEngineSnapshot.currentValues.suppressionReason} />
          </Card>

          <SectionTitle>Score breakdown</SectionTitle>
          <Card compact>
            {latestEngineSnapshot.scoreRows.map((row) => (
              <InfoRow key={row.label} label={row.label} value={row.value} />
            ))}
          </Card>

          <SectionTitle>Sleep timing prior</SectionTitle>
          <Card>
            <InfoRow label="training ended" value={latestEngineSnapshot.currentValues.trainingEndTime} />
            <InfoRow label="estimated sleep onset" value={latestEngineSnapshot.currentValues.estimatedSleepOnset} />
            <InfoRow label="expected wake" value={latestEngineSnapshot.currentValues.expectedWakeTime} />
            <InfoRow label="cue window" value={latestEngineSnapshot.currentValues.nextOrActiveCueWindow} />
            <InfoRow label="next predicted REM" value={latestEngineSnapshot.currentValues.nextPredictedRemWindow} />
            <InfoRow label="confidence" value={latestEngineSnapshot.sleepTiming.confidence} />
            <InfoRow label="source" value={latestEngineSnapshot.sleepTiming.source.replaceAll("_", " ")} />
          </Card>

          <SectionTitle>Movement and pauses</SectionTitle>
          <Card>
            <InfoRow label="movement intensity" value={decision.movement.recentMovementIntensity.toFixed(2)} />
            <InfoRow label="large movement threshold" value={decision.movement.largeMovementThreshold.toFixed(2)} />
            <InfoRow label="stable low movement" value={latestEngineSnapshot.currentValues.stableLowMovementSeconds} />
            <InfoRow label="movement pause" value={latestEngineSnapshot.currentValues.movementPauseStatus} />
            <InfoRow label="cue-associated pause" value={latestEngineSnapshot.currentValues.cueAssociatedMovementPause} />
            <InfoRow label="awakening pause" value={latestEngineSnapshot.currentValues.userReportedAwakeningPause} />
          </Card>

          <SectionTitle>Volume and budget</SectionTitle>
          <Card>
            <InfoRow label="current volume" value={formatEnginePercent(decision.volume.currentVolumeLevel)} />
            <InfoRow label="next cue volume" value={formatEnginePercent(decision.volume.nextCueVolumeLevel)} />
            <InfoRow label="volume start" value={formatEnginePercent(decision.volume.startLevel)} />
            <InfoRow label="volume ramp" value={latestEngineSnapshot.currentValues.volumeRamp} />
            <InfoRow label="volume cap" value={latestEngineSnapshot.currentValues.volumeCap} />
            <InfoRow label="cue count tonight" value={latestEngineSnapshot.currentValues.cueCountTonight} />
            <InfoRow label="block cues" value={`${decision.budget.cuesInCurrentBlock} / ${decision.budget.maxCuesPerBlock}`} />
            <InfoRow label="block rest until" value={decision.budget.blockRestUntil ? new Date(decision.budget.blockRestUntil).toLocaleString() : "off"} />
          </Card>

          <SectionTitle>Watch signal</SectionTitle>
          <Card>
            <InfoRow label="REM probability" value={formatEnginePercent(watch?.remProbability)} />
            <InfoRow label="REM threshold" value={formatEnginePercent(watch?.remThreshold ?? visibleRemThreshold)} />
            <InfoRow label="sleep probability" value={formatEnginePercent(watch?.sleepProbability)} />
            <InfoRow label="sensor quality" value={watch?.sensorQuality ?? "not available yet"} />
            <InfoRow label="consecutive likely REM" value={watch ? String(watch.consecutiveLikelyRemEpochs) : "not available yet"} />
            <InfoRow label="connectivity" value={watch?.connectivityState ?? "not available yet"} />
            <InfoRow label="classifier" value="TBD; no real REM classifier connected" />
          </Card>

          <SectionTitle>Decision log</SectionTitle>
          <Card>
            <InfoRow label="cue history" value="no native cue playback connected" />
            <InfoRow label="movement events" value="no native movement stream connected" />
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
        </View>
      ) : null}

      <SectionTitle>Sleep history calibration</SectionTitle>
      <Card>
        <InfoRow label="enabled" value={sleepHistory.enabled ? "on" : "off"} />
        <InfoRow label="source" value={formatSleepHistorySource(sleepHistory.source)} />
        <InfoRow label="permission" value={sleepHistory.permissionStatus} />
        <InfoRow label="imported sessions" value={String(sleepHistory.nightsImported)} />
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

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Sleep-history calibration is local-only by default. No cloud sync, REM
          classifier, or native watch/overnight data path is active yet.
        </Text>
      </Card>
    </Screen>
  );
}
