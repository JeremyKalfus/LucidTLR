import type { WatchEpochRecordDraft, WatchEpochMessage } from "./WatchModeTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Watch epoch message missing ${key}.`);
  }

  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Watch epoch message missing ${key}.`);
  }

  return value;
}

export function parseWatchEpochMessage(value: unknown): WatchEpochMessage {
  if (!isRecord(value)) {
    throw new Error("Watch epoch message must be an object.");
  }

  if (value.schemaVersion !== "watch-epoch-v1") {
    throw new Error("Watch epoch message schemaVersion must be watch-epoch-v1.");
  }

  const heartRate = isRecord(value.heartRate) ? value.heartRate : {};
  const motion = isRecord(value.motion) ? value.motion : {};
  const modelFeatures = isRecord(value.modelFeatures) ? value.modelFeatures : {};
  const battery = isRecord(value.battery) ? value.battery : {};
  const sensorQuality = value.sensorQuality;

  if (
    sensorQuality !== "good" &&
    sensorQuality !== "degraded" &&
    sensorQuality !== "missing" &&
    sensorQuality !== "bad"
  ) {
    throw new Error("Watch epoch message sensorQuality is invalid.");
  }

  return {
    schemaVersion: "watch-epoch-v1",
    sessionId: requiredString(value, "sessionId"),
    watchSessionId: requiredString(value, "watchSessionId"),
    epochIndex: requiredNumber(value, "epochIndex"),
    epochStart: requiredString(value, "epochStart"),
    epochEnd: requiredString(value, "epochEnd"),
    elapsedSessionSeconds: requiredNumber(value, "elapsedSessionSeconds"),
    heartRate: {
      sampleCount: requiredNumber(heartRate, "sampleCount"),
      meanBpm: optionalNumber(heartRate.meanBpm),
      minBpm: optionalNumber(heartRate.minBpm),
      maxBpm: optionalNumber(heartRate.maxBpm),
      lastBpm: optionalNumber(heartRate.lastBpm),
      hrEma: optionalNumber(heartRate.hrEma),
      hrFeature: optionalNumber(heartRate.hrFeature),
    },
    motion: {
      sampleCount: requiredNumber(motion, "sampleCount"),
      meanMagnitude: optionalNumber(motion.meanMagnitude),
      maxMagnitude: optionalNumber(motion.maxMagnitude),
      activityCountMagnitudeSum: optionalNumber(motion.activityCountMagnitudeSum),
      motionEma: optionalNumber(motion.motionEma),
      motionFeature: optionalNumber(motion.motionFeature),
      stableLowMovementSeconds: optionalNumber(motion.stableLowMovementSeconds),
      roughMovementIntensity:
        motion.roughMovementIntensity === "still" ||
        motion.roughMovementIntensity === "light" ||
        motion.roughMovementIntensity === "moderate" ||
        motion.roughMovementIntensity === "large"
          ? motion.roughMovementIntensity
          : undefined,
    },
    modelFeatures: {
      hrFeature: optionalNumber(modelFeatures.hrFeature),
      motionFeature: optionalNumber(modelFeatures.motionFeature),
      timeFeatureHours: requiredNumber(modelFeatures, "timeFeatureHours"),
    },
    battery: {
      level: optionalNumber(battery.level),
      state: typeof battery.state === "string" ? battery.state : undefined,
      lowPowerMode:
        typeof battery.lowPowerMode === "boolean" ? battery.lowPowerMode : undefined,
    },
    sensorQuality,
    missingReasons: Array.isArray(value.missingReasons)
      ? value.missingReasons.filter((reason): reason is string => typeof reason === "string")
      : undefined,
    connectivityState:
      value.connectivityState === "connected" ||
      value.connectivityState === "delayed" ||
      value.connectivityState === "disconnected" ||
      value.connectivityState === "unknown"
        ? value.connectivityState
        : "unknown",
    receivedAt: typeof value.receivedAt === "string" ? value.receivedAt : undefined,
  };
}

export function mapWatchEpochMessageToRecord(
  message: WatchEpochMessage,
  now: string,
): WatchEpochRecordDraft {
  return {
    id: `${message.sessionId}:${message.watchSessionId}:${message.epochIndex}`,
    sessionId: message.sessionId,
    epochStart: message.epochStart,
    epochEnd: message.epochEnd,
    heartRateSummary: message.heartRate.meanBpm,
    motionSummary: message.motion.activityCountMagnitudeSum ?? message.motion.meanMagnitude,
    sensorQuality: message.sensorQuality,
    elapsedSessionSeconds: message.elapsedSessionSeconds,
    remLabel: "unknown",
    classifierVersion: "mallela-feature-pipeline-no-model",
    epochFeaturesJson: JSON.stringify(message.modelFeatures),
    watchBatteryLevel: message.battery.level,
    watchConnectivityState: message.connectivityState ?? "unknown",
    sampleCountsJson: JSON.stringify({
      heartRate: message.heartRate.sampleCount,
      motion: message.motion.sampleCount,
    }),
    epochReceivedAt: message.receivedAt ?? now,
    processedAt: now,
    heartRateSampleCount: message.heartRate.sampleCount,
    motionSampleCount: message.motion.sampleCount,
    hrFeature: message.modelFeatures.hrFeature,
    motionFeature: message.modelFeatures.motionFeature,
    motionEma: message.motion.motionEma,
    timeFeature: message.modelFeatures.timeFeatureHours,
    rawEpochAvailable: false,
    stableLowMovementSeconds: message.motion.stableLowMovementSeconds,
    roughMovementIntensity: message.motion.roughMovementIntensity,
  };
}
