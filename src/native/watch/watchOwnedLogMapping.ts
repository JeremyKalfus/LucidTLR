import type {
  WatchCueRecordDraft,
  WatchEpochRecordDraft,
  WatchRuntimeEvent,
} from "./WatchModeTypes";
import type {
  WatchCueDeliveryLogV2,
  WatchEpochLogV2,
  WatchOwnedImportPayloadV2,
  WatchSessionSummaryLogV2,
} from "./WatchOwnedTypes";

function eventId(input: {
  sessionId: string;
  eventType: WatchRuntimeEvent["eventType"];
  timestamp: string;
  suffix: string;
}): string {
  return `${input.sessionId}:${input.eventType}:${input.timestamp}:${input.suffix}`;
}

function cueSuppressionReason(
  delivery: WatchCueDeliveryLogV2,
): WatchCueRecordDraft["suppressionReason"] {
  if (delivery.succeeded) {
    return "none";
  }

  return "session_not_active";
}

export function mapWatchOwnedEpochLogToRecord(
  epoch: WatchEpochLogV2,
): WatchEpochRecordDraft {
  const sensorQuality =
    epoch.accelMissing || epoch.heartRateMissing ? "degraded" : "good";

  return {
    id: `${epoch.sessionId}:watch-owned:${epoch.watchSessionId ?? "local"}:${epoch.epochIndex}`,
    sessionId: epoch.sessionId,
    epochStart: epoch.startedAt,
    epochEnd: epoch.endedAt,
    heartRateSummary: epoch.heartRateMeanBpm,
    motionSummary: epoch.motionMean,
    sensorQuality,
    elapsedSessionSeconds: epoch.elapsedSec,
    remProbability: epoch.remProbability,
    remLabel: epoch.remLabel ?? (epoch.likelyRem ? "likely_rem" : "not_likely_rem"),
    classifierVersion: epoch.modelVersion,
    epochFeaturesJson: JSON.stringify({
      motionMean: epoch.motionMean,
      motionMax: epoch.motionMax,
      heartRateMissing: epoch.heartRateMissing,
      accelMissing: epoch.accelMissing,
      lowPowerModeEnabled: epoch.lowPowerModeEnabled,
    }),
    watchBatteryLevel:
      typeof epoch.batteryPct === "number" ? epoch.batteryPct / 100 : undefined,
    watchConnectivityState: "delayed",
    sampleCountsJson: JSON.stringify({
      heartRate: epoch.heartRateSampleCount,
      motion: epoch.accelSampleCount,
    }),
    epochReceivedAt: epoch.endedAt,
    processedAt: epoch.endedAt,
    heartRateSampleCount: epoch.heartRateSampleCount,
    motionSampleCount: epoch.accelSampleCount,
    rawEpochAvailable: false,
    cueDecisionReason: epoch.cueDecisionReason,
  };
}

export function mapWatchOwnedCueDeliveryToRecord(
  delivery: WatchCueDeliveryLogV2,
): WatchCueRecordDraft {
  return {
    id:
      delivery.id ??
      `${delivery.sessionId}:watch-cue:${delivery.epochIndex}:${delivery.requestedAt}`,
    sessionId: delivery.sessionId,
    timestamp: delivery.requestedAt,
    cueId: delivery.cueId ?? "watch-local-cue",
    volumeLevel: delivery.audioRequested ? 1 : 0,
    deliveryDevice: "watch",
    played: delivery.succeeded,
    suppressionReason: cueSuppressionReason(delivery),
  };
}

export function mapWatchOwnedImportToRuntimeEvents(
  payload: WatchOwnedImportPayloadV2,
): WatchRuntimeEvent[] {
  const events: WatchRuntimeEvent[] = [];

  for (const epoch of payload.epochs) {
    events.push({
      id: eventId({
        sessionId: epoch.sessionId,
        eventType: "watch_epoch_received",
        timestamp: epoch.endedAt,
        suffix: String(epoch.epochIndex),
      }),
      sessionId: epoch.sessionId,
      timestamp: epoch.endedAt,
      eventType: "watch_epoch_received",
      payload: {
        protocol: epoch.protocol,
        epochIndex: epoch.epochIndex,
        remProbability: epoch.remProbability,
        likelyRem: epoch.likelyRem,
        modelVersion: epoch.modelVersion,
        heartRateMissing: epoch.heartRateMissing,
        accelMissing: epoch.accelMissing,
        lowPowerModeEnabled: epoch.lowPowerModeEnabled,
      },
    });
  }

  for (const delivery of payload.cueDeliveries) {
    events.push({
      id:
        delivery.id ??
        eventId({
          sessionId: delivery.sessionId,
          eventType: delivery.succeeded ? "watch_cue_played" : "watch_cue_failed",
          timestamp: delivery.requestedAt,
          suffix: String(delivery.epochIndex),
        }),
      sessionId: delivery.sessionId,
      timestamp: delivery.requestedAt,
      eventType: delivery.succeeded ? "watch_cue_played" : "watch_cue_failed",
      payload: {
        protocol: delivery.protocol,
        epochIndex: delivery.epochIndex,
        cueMode: delivery.cueMode,
        deliveryDevice: delivery.deliveryDevice,
        hapticRequested: delivery.hapticRequested,
        audioRequested: delivery.audioRequested,
        errorCode: delivery.errorCode,
        errorMessage: delivery.errorMessage,
      },
    });
  }

  if (payload.summary) {
    events.push(mapWatchOwnedSummaryToRuntimeEvent(payload.summary));
  }

  return events;
}

function mapWatchOwnedSummaryToRuntimeEvent(
  summary: WatchSessionSummaryLogV2,
): WatchRuntimeEvent {
  return {
    id: eventId({
      sessionId: summary.sessionId,
      eventType: "watch_runtime_stopped",
      timestamp: summary.stoppedAt ?? summary.startedAt,
      suffix: summary.stopReason ?? "summary",
    }),
    sessionId: summary.sessionId,
    timestamp: summary.stoppedAt ?? summary.startedAt,
    eventType: "watch_runtime_stopped",
    payload: {
      protocol: summary.protocol,
      reason:
        summary.stopReason === "completed_stop_at" ? "completed" : summary.stopReason,
      stoppedAt: summary.stoppedAt,
      epochCount: summary.epochCount,
      validEpochCount: summary.validEpochCount,
      cueCount: summary.cueCount,
      batteryStartPct: summary.batteryStartPct,
      batteryEndPct: summary.batteryEndPct,
      classifierVersion: summary.modelVersion,
      syncStatus: summary.syncStatus,
    },
  };
}
