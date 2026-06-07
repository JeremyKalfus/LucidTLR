import { describe, expect, it } from "vitest";

import {
  WATCH_PACKAGE_MANIFEST_SCHEMA_VERSION,
  buildWatchPackageId,
  hashWatchPackageManifest,
  validateWatchPackageManifest,
  withWatchPackageManifestHash,
  type WatchPackageManifestV3,
} from "@/src/native/watchRuntime";

function manifest(overrides: Partial<WatchPackageManifestV3> = {}): WatchPackageManifestV3 {
  const sequence = {
    sessionId: "session-1",
    planHash: "a".repeat(64),
    firstSequenceNumber: 1,
    lastSequenceNumber: 4,
  };
  const packageId = buildWatchPackageId(sequence);

  return withWatchPackageManifestHash({
    schemaVersion: WATCH_PACKAGE_MANIFEST_SCHEMA_VERSION,
    packageId,
    ...sequence,
    sealedAt: "2026-06-07T12:00:00.000Z",
    sealReason: "completed",
    startReceiptId: "receipt-1",
    eventCount: 4,
    epochCount: 20,
    cueEventCount: 1,
    movementEventCount: 2,
    files: [
      {
        relativePath: "events.jsonl",
        byteLength: 256,
        sha256: "b".repeat(64),
      },
    ],
    runtimeSummary: {
      startedAt: "2026-06-07T04:00:00.000Z",
      endedAt: "2026-06-07T12:00:00.000Z",
      durationSeconds: 28800,
      sealReason: "completed",
      batteryStart: 0.91,
      batteryEnd: 0.42,
      missingEpochCount: 0,
      sensorQualitySummary: "good",
      cuesAttempted: 1,
      cuesDelivered: 1,
      cueFailures: 0,
      movementPauses: 2,
    },
    importStatus: "sealed_waiting_for_phone",
    ...overrides,
  });
}

describe("WatchPackageManifestV3", () => {
  it("builds deterministic package IDs for idempotent import", () => {
    const input = {
      sessionId: "session-1",
      planHash: "a".repeat(64),
      firstSequenceNumber: 1,
      lastSequenceNumber: 4,
    };

    expect(buildWatchPackageId(input)).toBe(buildWatchPackageId({ ...input }));
    expect(buildWatchPackageId(input)).not.toBe(
      buildWatchPackageId({
        ...input,
        lastSequenceNumber: 5,
      }),
    );
  });

  it("validates a hashed manifest", () => {
    expect(validateWatchPackageManifest(manifest())).toEqual([]);
  });

  it("detects package hash mismatches", () => {
    const valid = manifest();
    const invalid = {
      ...valid,
      sealedAt: "2026-06-07T12:01:00.000Z",
    };

    expect(hashWatchPackageManifest(valid)).toBe(valid.packageHash);
    expect(validateWatchPackageManifest(invalid)).toContain(
      "Manifest packageHash does not match manifest contents.",
    );
  });

  it("detects count and sequence mismatches", () => {
    const invalid = manifest({
      eventCount: 3,
    });

    expect(validateWatchPackageManifest(invalid)).toContain(
      "Manifest eventCount must match the contiguous sequence range.",
    );
  });

  it("detects package id mismatches", () => {
    const invalid = manifest({
      packageId: "watch-package-v3-wrong",
    });

    expect(validateWatchPackageManifest(invalid)).toContain(
      "Manifest packageId does not match session, plan, and sequence range.",
    );
  });
});
