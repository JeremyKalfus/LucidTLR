import { Text, View } from "react-native";

import {
  Card,
  InfoRow,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { formatEnginePercent } from "@/src/engine";
import { formatSessionLength } from "@/src/features/sessions/sessionLength";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

export function DataScreen() {
  const { engineDecisionLog, latestEngineSnapshot, sessionHistory } =
    useAppState();
  const decision = latestEngineSnapshot.decision;
  const watch = decision.watch;
  const visibleRemThreshold =
    typeof decision.metadata.threshold === "number"
      ? decision.metadata.threshold
      : undefined;

  return (
    <Screen>
      <SectionTitle>Data</SectionTitle>

      <Card>
        <InfoRow label="last decision" value={decision.action.replaceAll("_", " ")} />
        <InfoRow label="decision reason" value={latestEngineSnapshot.currentValues.latestDecisionReason} />
        <InfoRow label="opportunity score" value={decision.opportunityScore.toFixed(2)} />
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

      <SectionTitle>Decision log</SectionTitle>
      <Card>
        <InfoRow label="cue history" value="no native cue playback connected" />
        <InfoRow label="movement events" value="no native movement stream connected" />
        <InfoRow label="watch epochs" value="no native watch stream connected" />
        {engineDecisionLog.length === 0 ? (
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

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          This screen shows local session placeholders only. No cloud sync, REM
          classifier, or native watch/overnight data path is active yet.
        </Text>
      </Card>
    </Screen>
  );
}
