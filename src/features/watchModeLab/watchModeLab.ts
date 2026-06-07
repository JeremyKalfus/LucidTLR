import type { LocalDb } from "@/src/data/local/localDb";
import type { SessionType } from "@/src/domain/types";
import type { CueDecisionSettings } from "@/src/engine";
import type { TlrOptions } from "@/src/domain/types";
import { importWatchPackage } from "@/src/features/watchHistory/importWatchPackage";
import {
  WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
  buildSyntheticSleepLogWatchPackageFixture,
  buildSyntheticTlrWatchPackageFixture,
} from "@/src/features/watchHistory/watchPackageFixtures";
import {
  validateWatchPackageForImport,
} from "@/src/features/watchHistory/validateWatchPackageManifest";
import type {
  WatchPackageImportResult,
  WatchSealedPackageV3,
} from "@/src/features/watchHistory/watchPackageImportTypes";
import {
  buildWatchRuntimePlan,
  withWatchPackageManifestHash,
  type WatchRuntimePlanV3,
} from "@/src/native/watchRuntime";

export type WatchModeLabKind = "tlr" | "sleep_log";

export interface WatchModeLabPlanSummary {
  sessionId: string;
  planHash: string;
  schemaVersion: string;
  selectedCueId: string;
  cueOutputMode: string;
  epochSeconds: number;
  cueingEnabled: boolean;
}

export interface WatchModeLabPackageImportSummary {
  status: WatchPackageImportResult["status"];
  ackEligible: boolean;
  packageId: string;
  packageHash: string;
  sessionId: string;
  counts: WatchPackageImportResult["counts"];
}

export interface WatchModeLabPackageValidationSummary {
  packageId: string;
  validationErrors: string[];
}

export function buildSyntheticWatchModeLabPlan(input: {
  kind: WatchModeLabKind;
  participantId: string;
  selectedCueId: string;
  tlrOptions: Pick<TlrOptions, "watchAudioCueEnabled" | "skipGuidedTraining">;
  engineSettings: Pick<
    CueDecisionSettings,
    | "cueStartDelayHoursAfterTraining"
    | "minimumSecondsSinceLastCue"
    | "userInteractionSuppressionSeconds"
    | "stableLowMovementRequiredSeconds"
    | "cueAssociatedMovementWindowSeconds"
    | "cueAssociatedMovementPauseSeconds"
    | "remThreshold"
    | "minimumWatchSleepProbability"
    | "maxCuesPerNight"
    | "typicalSleepDurationHours"
  >;
  createdAt?: string;
}): WatchRuntimePlanV3 {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const sessionType: Extract<SessionType, "tlr" | "sleep_log"> = input.kind;

  return buildWatchRuntimePlan({
    sessionId: `watch-mode-lab-${input.kind}-${Date.parse(createdAt)}`,
    participantId: input.participantId,
    sessionType,
    createdAt,
    selectedCueId: input.selectedCueId,
    tlrOptions: input.tlrOptions,
    engineSettings: input.engineSettings,
    allowExperimentalAudio: false,
  });
}

export function summarizeWatchModeLabPlan(
  plan: WatchRuntimePlanV3,
): WatchModeLabPlanSummary {
  const cueChannels = [
    plan.cueOutput.hapticEnabled ? "haptic" : null,
    plan.cueOutput.audioEnabled ? "audio" : null,
  ].filter((channel): channel is string => Boolean(channel));

  return {
    sessionId: plan.sessionId,
    planHash: plan.planHash,
    schemaVersion: plan.schemaVersion,
    selectedCueId: plan.selectedCueId,
    cueOutputMode: cueChannels.length > 0 ? cueChannels.join(" + ") : "disabled",
    epochSeconds: plan.epoching.epochSeconds,
    cueingEnabled: plan.tlrInterval.enabled,
  };
}

export function buildSyntheticWatchModeLabPackage(
  kind: WatchModeLabKind,
): WatchSealedPackageV3 {
  return kind === "tlr"
    ? buildSyntheticTlrWatchPackageFixture()
    : buildSyntheticSleepLogWatchPackageFixture();
}

export async function importSyntheticWatchModeLabPackage(input: {
  db: LocalDb;
  kind: WatchModeLabKind;
  importedAt?: string;
}): Promise<WatchModeLabPackageImportSummary> {
  const sealedPackage = buildSyntheticWatchModeLabPackage(input.kind);
  const result = await importWatchPackage({
    db: input.db,
    sealedPackage,
    importedAt: input.importedAt ?? WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
  });

  return {
    status: result.status,
    ackEligible: result.ackEligible,
    packageId: result.packageId,
    packageHash: result.packageHash,
    sessionId: result.sessionId,
    counts: result.counts,
  };
}

export function validateCorruptSyntheticWatchModeLabPackage(
  kind: WatchModeLabKind,
): WatchModeLabPackageValidationSummary {
  const sealedPackage = buildSyntheticWatchModeLabPackage(kind);
  const corruptPackage: WatchSealedPackageV3 = {
    ...sealedPackage,
    manifest: withWatchPackageManifestHash({
      ...sealedPackage.manifest,
      packageHash: "",
      files: sealedPackage.manifest.files.map((file, index) =>
        index === 0
          ? {
              ...file,
              sha256: "0".repeat(64),
            }
          : file,
      ),
    }),
  };

  return {
    packageId: corruptPackage.manifest.packageId,
    validationErrors: validateWatchPackageForImport(corruptPackage),
  };
}
