import { hashWatchRuntimePayload } from "./watchRuntimeHashes";

export const WATCH_PACKAGE_MANIFEST_SCHEMA_VERSION =
  "watch-package-manifest-v3";

export type WatchPackageManifestSchemaVersion =
  typeof WATCH_PACKAGE_MANIFEST_SCHEMA_VERSION;

export type WatchPackageSealReason =
  | "completed"
  | "user_wake"
  | "safe_low_battery"
  | "runtime_error"
  | "manual_force_seal";

export type WatchPackageImportStatus =
  | "sealed_waiting_for_phone"
  | "transfer_pending"
  | "imported"
  | "import_failed"
  | "acknowledged_by_watch";

export interface WatchPackageFileEntryV3 {
  relativePath: string;
  byteLength: number;
  sha256: string;
}

export interface WatchPackageRuntimeSummaryV3 {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  sealReason: WatchPackageSealReason;
  batteryStart: number;
  batteryEnd: number;
  missingEpochCount: number;
  sensorQualitySummary: "good" | "degraded" | "missing" | "bad";
  cuesAttempted: number;
  cuesDelivered: number;
  cueFailures: number;
  movementPauses: number;
}

export interface WatchPackageManifestV3 {
  schemaVersion: WatchPackageManifestSchemaVersion;
  packageId: string;
  sessionId: string;
  planHash: string;
  packageHash: string;
  sealedAt: string;
  sealReason: WatchPackageSealReason;
  startReceiptId: string;
  firstSequenceNumber: number;
  lastSequenceNumber: number;
  eventCount: number;
  epochCount: number;
  cueEventCount: number;
  movementEventCount: number;
  files: WatchPackageFileEntryV3[];
  runtimeSummary: WatchPackageRuntimeSummaryV3;
  importStatus: WatchPackageImportStatus;
  importedAt?: string;
  importAckId?: string;
}

export function buildWatchPackageId(input: {
  sessionId: string;
  planHash: string;
  firstSequenceNumber: number;
  lastSequenceNumber: number;
}): string {
  const hash = hashWatchRuntimePayload({
    schemaVersion: WATCH_PACKAGE_MANIFEST_SCHEMA_VERSION,
    sessionId: input.sessionId,
    planHash: input.planHash,
    firstSequenceNumber: input.firstSequenceNumber,
    lastSequenceNumber: input.lastSequenceNumber,
  });

  return `watch-package-v3-${hash.slice(0, 24)}`;
}

export function hashWatchPackageManifest(
  manifest: WatchPackageManifestV3,
): string {
  return hashWatchRuntimePayload(manifest, ["packageHash"]);
}

export function withWatchPackageManifestHash(
  manifest: Omit<WatchPackageManifestV3, "packageHash"> & {
    packageHash?: string;
  },
): WatchPackageManifestV3 {
  const nextManifest = {
    ...manifest,
    packageHash: "",
  } satisfies WatchPackageManifestV3;

  return {
    ...nextManifest,
    packageHash: hashWatchPackageManifest(nextManifest),
  };
}

export function validateWatchPackageManifest(
  manifest: WatchPackageManifestV3,
): string[] {
  const errors: string[] = [];

  if (manifest.schemaVersion !== WATCH_PACKAGE_MANIFEST_SCHEMA_VERSION) {
    errors.push("Manifest schemaVersion must be watch-package-manifest-v3.");
  }

  const expectedPackageId = buildWatchPackageId({
    sessionId: manifest.sessionId,
    planHash: manifest.planHash,
    firstSequenceNumber: manifest.firstSequenceNumber,
    lastSequenceNumber: manifest.lastSequenceNumber,
  });

  if (manifest.packageId !== expectedPackageId) {
    errors.push("Manifest packageId does not match session, plan, and sequence range.");
  }

  if (manifest.packageHash !== hashWatchPackageManifest(manifest)) {
    errors.push("Manifest packageHash does not match manifest contents.");
  }

  const sequenceCount =
    manifest.lastSequenceNumber - manifest.firstSequenceNumber + 1;

  if (
    manifest.firstSequenceNumber < 1 ||
    manifest.lastSequenceNumber < manifest.firstSequenceNumber ||
    manifest.eventCount !== sequenceCount
  ) {
    errors.push("Manifest eventCount must match the contiguous sequence range.");
  }

  if (manifest.runtimeSummary.sealReason !== manifest.sealReason) {
    errors.push("Manifest sealReason must match runtimeSummary sealReason.");
  }

  if (manifest.runtimeSummary.cuesDelivered > manifest.runtimeSummary.cuesAttempted) {
    errors.push("Manifest cuesDelivered cannot exceed cuesAttempted.");
  }

  if (manifest.epochCount < 0 || manifest.cueEventCount < 0 || manifest.movementEventCount < 0) {
    errors.push("Manifest counts cannot be negative.");
  }

  if (
    manifest.files.some(
      (file) =>
        !file.relativePath ||
        file.byteLength < 0 ||
        !/^[a-f0-9]{64}$/.test(file.sha256),
    )
  ) {
    errors.push("Manifest files must include relativePath, byteLength, and sha256.");
  }

  return errors;
}

export function assertValidWatchPackageManifest(
  manifest: WatchPackageManifestV3,
): void {
  const errors = validateWatchPackageManifest(manifest);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}
