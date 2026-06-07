import type { CueSuppressionReason, NightSession } from "@/src/domain/types";
import {
  loadWatchSyncPackageImport,
  markWatchSyncPackageImported,
  markWatchSyncPackageImportFailed,
  markWatchSyncPackageImporting,
  saveWatchCueRecords,
  saveWatchEpochs,
  saveWatchMovementRecords,
  saveWatchRuntimeEvents,
  upsertLocalSession,
} from "@/src/data/local/repositories";
import type {
  WatchCueRecordDraft,
  WatchEpochRecordDraft,
  WatchMovementRecordDraft,
  WatchRuntimeEvent,
} from "./watchHistoryTypes";
import {
  decodeValidWatchPackageForImport,
  encodeWatchPackageJson,
} from "./validateWatchPackageManifest";
import type {
  DecodedWatchPackageV3,
  WatchCuePackageRecordV3,
  WatchEpochPackageRecordV3,
  WatchMovementPackageRecordV3,
  WatchPackageImportInput,
  WatchPackageImportResult,
  WatchRuntimeEventPackageRecordV3,
} from "./watchPackageImportTypes";

function buildImportResult(input: {
  decoded: DecodedWatchPackageV3;
  status: WatchPackageImportResult["status"];
  importedAt: string;
}): WatchPackageImportResult {
  const { manifest } = input.decoded;

  return {
    status: input.status,
    packageId: manifest.packageId,
    sessionId: manifest.sessionId,
    packageHash: manifest.packageHash,
    importedAt: input.importedAt,
    ackEligible: true,
    counts: {
      events: manifest.eventCount,
      epochs: manifest.epochCount,
      cueEvents: manifest.cueEventCount,
      movementEvents: manifest.movementEventCount,
    },
  };
}

function eventTimestamp(
  decoded: DecodedWatchPackageV3,
  eventType: string,
): string | undefined {
  return decoded.events.find((event) => event.eventType === eventType)?.timestamp;
}

function toImportedSession(decoded: DecodedWatchPackageV3): NightSession {
  const { manifest, plan } = decoded;
  const startedAt = manifest.runtimeSummary.startedAt;
  const endedAt = manifest.runtimeSummary.endedAt;

  return {
    id: manifest.sessionId,
    participantId: plan.participantId,
    sessionType: plan.sessionType,
    mode: "watch",
    status: "ended",
    protocolVersion: plan.protocolVersion,
    startedAt,
    endedAt,
    trainingStartedAt:
      eventTimestamp(decoded, "training_started") ??
      (plan.training.enabled ? startedAt : undefined),
    trainingEndedAt: eventTimestamp(decoded, "training_completed"),
    cueingStartedAt:
      eventTimestamp(decoded, "tlr_interval_started") ??
      (plan.sessionType === "tlr" ? plan.tlrInterval.earliestCueAt : undefined),
    selectedCueId: plan.sessionType === "tlr" ? plan.selectedCueId : undefined,
    guidedTrainingSkipped: plan.training.skipped,
  };
}

function toWatchRuntimeEvent(
  record: WatchRuntimeEventPackageRecordV3,
): WatchRuntimeEvent {
  return {
    id: record.eventId,
    sessionId: record.sessionId,
    timestamp: record.timestamp,
    eventType: record.eventType as WatchRuntimeEvent["eventType"],
    payload: {
      ...record.payload,
      sequenceNumber: record.sequenceNumber,
      monotonicOffsetSeconds: record.monotonicOffsetSeconds ?? null,
      previousRecordHash: record.previousRecordHash,
      recordHash: record.recordHash,
    },
  };
}

function toRemLabel(
  remLabel: WatchEpochPackageRecordV3["remLabel"],
): WatchEpochRecordDraft["remLabel"] {
  if (remLabel === "likely_rem") {
    return "likely_rem";
  }

  if (remLabel === "unlikely_rem" || remLabel === "not_likely_rem") {
    return "not_likely_rem";
  }

  return "unknown";
}

function toRoughMovementIntensity(
  intensity: number,
): WatchEpochRecordDraft["roughMovementIntensity"] {
  if (intensity >= 2) {
    return "large";
  }

  if (intensity >= 1) {
    return "moderate";
  }

  if (intensity > 0) {
    return "light";
  }

  return "still";
}

function toWatchEpoch(record: WatchEpochPackageRecordV3): WatchEpochRecordDraft {
  return {
    id: record.eventId,
    sessionId: record.sessionId,
    epochStart: record.epochStart,
    epochEnd: record.epochEnd,
    elapsedSessionSeconds: record.elapsedSessionSeconds,
    heartRateSummary: record.heartRateSummary ?? undefined,
    motionSummary: record.motionSummary ?? undefined,
    sensorQuality: record.sensorQuality,
    sleepProbability: record.sleepProbability ?? undefined,
    remProbability: record.remProbability ?? undefined,
    remLabel: toRemLabel(record.remLabel),
    classifierVersion: record.classifierVersion,
    epochFeaturesJson: encodeWatchPackageJson({
      schemaVersion: record.schemaVersion,
      sequenceNumber: record.sequenceNumber,
      epochSequenceNumber: record.epochSequenceNumber,
      modelVersion: record.modelVersion,
      movementState: record.movementState,
      monotonicOffsetSeconds: record.monotonicOffsetSeconds ?? null,
      previousRecordHash: record.previousRecordHash,
      recordHash: record.recordHash,
    }),
    watchBatteryLevel: record.batteryLevel ?? undefined,
    watchConnectivityState: "unknown",
    sampleCountsJson: encodeWatchPackageJson({
      heartRate: record.heartRateSampleCount,
      motion: record.motionSampleCount,
    }),
    epochReceivedAt: record.timestamp,
    processedAt: record.timestamp,
    heartRateSampleCount: record.heartRateSampleCount,
    motionSampleCount: record.motionSampleCount,
    hrFeature: record.heartRateSummary ?? undefined,
    motionFeature: record.motionSummary ?? undefined,
    rawEpochAvailable: false,
    stableLowMovementSeconds: record.stableLowMovementSeconds,
    roughMovementIntensity: toRoughMovementIntensity(record.roughMovementIntensity),
    cueDecisionReason: record.cueDecisionReason,
  };
}

function toSuppressionReason(
  record: WatchCuePackageRecordV3,
): CueSuppressionReason {
  if (record.delivered) {
    return "none";
  }

  if (record.decisionReason.includes("movement_gate")) {
    return "movement";
  }

  if (record.decisionReason.includes("cue_associated")) {
    return "cue_associated_movement";
  }

  if (record.decisionReason.includes("user_interaction")) {
    return "user_reported_awakening";
  }

  if (record.decisionReason.includes("before_tlr")) {
    return "outside_cue_window";
  }

  return "session_not_active";
}

function toWatchCue(record: WatchCuePackageRecordV3): WatchCueRecordDraft {
  return {
    id: record.eventId,
    sessionId: record.sessionId,
    timestamp: record.timestamp,
    cueId: record.cueId,
    volumeLevel: record.outputChannel === "audio" ? 1 : 0,
    deliveryDevice: "watch",
    played: record.delivered,
    suppressionReason: toSuppressionReason(record),
  };
}

function toWatchMovement(
  record: WatchMovementPackageRecordV3,
): WatchMovementRecordDraft {
  return {
    id: record.eventId,
    sessionId: record.sessionId,
    timestamp: record.timestamp,
    intensity: record.intensity,
    wasCueAssociated: record.cueAssociated,
    pauseStartedAt: record.pauseStartedAt ?? undefined,
    pauseEndedAt: record.pauseEndedAt ?? undefined,
  };
}

export async function importWatchPackage(
  input: WatchPackageImportInput,
): Promise<WatchPackageImportResult> {
  const decoded = decodeValidWatchPackageForImport(input.sealedPackage);
  const { manifest } = decoded;
  const manifestJson = encodeWatchPackageJson(manifest);
  const existingPackage = await loadWatchSyncPackageImport({
    db: input.db,
    packageId: manifest.packageId,
  });

  if (existingPackage && existingPackage.packageHash !== manifest.packageHash) {
    throw new Error(
      `Watch package ${manifest.packageId} already exists with a different packageHash.`,
    );
  }

  if (existingPackage?.importStatus === "imported") {
    return buildImportResult({
      decoded,
      status: "already_imported",
      importedAt: existingPackage.importedAt ?? input.importedAt,
    });
  }

  if (!input.db.withTransaction) {
    throw new Error(
      "Watch package import requires LocalDb.withTransaction before it can become ack-eligible.",
    );
  }

  try {
    return await input.db.withTransaction(async (tx) => {
      const transactionPackage = await loadWatchSyncPackageImport({
        db: tx,
        packageId: manifest.packageId,
      });

      if (
        transactionPackage &&
        transactionPackage.packageHash !== manifest.packageHash
      ) {
        throw new Error(
          `Watch package ${manifest.packageId} already exists with a different packageHash.`,
        );
      }

      if (transactionPackage?.importStatus === "imported") {
        return buildImportResult({
          decoded,
          status: "already_imported",
          importedAt: transactionPackage.importedAt ?? input.importedAt,
        });
      }

      await markWatchSyncPackageImporting({
        db: tx,
        packageId: manifest.packageId,
        sessionId: manifest.sessionId,
        planHash: manifest.planHash,
        packageHash: manifest.packageHash,
        sealedAt: manifest.sealedAt,
        manifestJson,
      });
      await upsertLocalSession({
        db: tx,
        session: toImportedSession(decoded),
      });
      await saveWatchRuntimeEvents({
        db: tx,
        events: decoded.events.map(toWatchRuntimeEvent),
      });
      await saveWatchEpochs({
        db: tx,
        records: decoded.epochs.map(toWatchEpoch),
      });
      await saveWatchCueRecords({
        db: tx,
        records: decoded.cueEvents.map(toWatchCue),
      });
      await saveWatchMovementRecords({
        db: tx,
        records: decoded.movementEvents.map(toWatchMovement),
      });
      await markWatchSyncPackageImported({
        db: tx,
        packageId: manifest.packageId,
        packageHash: manifest.packageHash,
        importedAt: input.importedAt,
        manifestJson,
      });

      return buildImportResult({
        decoded,
        status: "imported",
        importedAt: input.importedAt,
      });
    });
  } catch (error) {
    await markWatchSyncPackageImportFailed({
      db: input.db,
      packageId: manifest.packageId,
      packageHash: manifest.packageHash,
      importError: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
