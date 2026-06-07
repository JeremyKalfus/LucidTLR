import { describe, expect, it } from "vitest";

import type { LocalDb } from "@/src/data/local/localDb";
import type {
  WatchSyncPackageImportRecord,
  WatchSyncPackageImportStatus,
} from "@/src/data/local/repositories";
import { LOCAL_MIGRATIONS, LOCAL_TABLES } from "@/src/data/local/schema";
import { importWatchPackage } from "@/src/features/watchHistory/importWatchPackage";
import {
  WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
  buildSyntheticSleepLogWatchPackageFixture,
  buildSyntheticTlrWatchPackageFixture,
} from "@/src/features/watchHistory/watchPackageFixtures";
import { validateWatchPackageForImport } from "@/src/features/watchHistory/validateWatchPackageManifest";
import {
  withWatchPackageManifestHash,
  type WatchPackageManifestV3,
} from "@/src/native/watchRuntime";

declare const require: (moduleName: string) => any;

const { readFileSync } = require("fs");
const path = require("path");
const repoRoot = process.cwd();

type Row = Record<string, unknown>;

class FakePackageImportDb implements LocalDb {
  readonly sessions = new Map<string, Row>();
  readonly runtimeEvents = new Map<string, Row>();
  readonly epochs = new Map<string, Row>();
  readonly cueEvents = new Map<string, Row>();
  readonly movementEvents = new Map<string, Row>();
  readonly packages = new Map<string, Row>();

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.includes("insert into watch_sync_packages")) {
      const [
        packageId,
        sessionId,
        planHash,
        packageHash,
        sealedAt,
        manifestJson,
      ] = params;
      const existing = this.packages.get(String(packageId));

      if (!existing || existing.package_hash === packageHash) {
        this.packages.set(String(packageId), {
          package_id: packageId,
          session_id: sessionId,
          plan_hash: planHash,
          package_hash: packageHash,
          sealed_at: sealedAt,
          imported_at: null,
          import_status: "importing",
          manifest_json: manifestJson,
          import_error: null,
        });
      }
      return;
    }

    if (sql.startsWith("update watch_sync_packages")) {
      if (sql.includes("import_status = 'imported'")) {
        const [importedAt, manifestJson, packageId, packageHash] = params;
        const existing = this.packages.get(String(packageId));

        if (existing?.package_hash === packageHash) {
          this.packages.set(String(packageId), {
            ...existing,
            imported_at: importedAt,
            import_status: "imported",
            manifest_json: manifestJson,
            import_error: null,
          });
        }
        return;
      }

      if (sql.includes("import_status = 'import_failed'")) {
        const [importError, packageId, packageHash] = params;
        const existing = this.packages.get(String(packageId));

        if (existing?.package_hash === packageHash) {
          this.packages.set(String(packageId), {
            ...existing,
            import_status: "import_failed",
            import_error: importError,
          });
        }
        return;
      }
    }

    if (sql.includes("insert into sessions")) {
      const [
        id,
        participantId,
        sessionType,
        mode,
        status,
        protocolVersion,
        startedAt,
        endedAt,
        trainingStartedAt,
        trainingEndedAt,
        cueingStartedAt,
        selectedCueId,
        guidedTrainingSkipped,
      ] = params;

      this.sessions.set(String(id), {
        id,
        participant_id: participantId,
        session_type: sessionType,
        mode,
        status,
        protocol_version: protocolVersion,
        started_at: startedAt,
        ended_at: endedAt,
        training_started_at: trainingStartedAt,
        training_ended_at: trainingEndedAt,
        cueing_started_at: cueingStartedAt,
        selected_cue_id: selectedCueId,
        guided_training_skipped: guidedTrainingSkipped,
      });
      return;
    }

    if (sql.includes("insert into watch_runtime_events")) {
      const [id, sessionId, timestamp, eventType, payloadJson] = params;

      if (!this.runtimeEvents.has(String(id))) {
        this.runtimeEvents.set(String(id), {
          id,
          session_id: sessionId,
          timestamp,
          event_type: eventType,
          payload_json: payloadJson,
        });
      }
      return;
    }

    if (sql.includes("insert into watch_epochs")) {
      const [
        id,
        sessionId,
        epochStart,
        epochEnd,
        heartRateSummary,
        motionSummary,
        sensorQuality,
        sleepProbability,
        elapsedSessionSeconds,
        remProbability,
        remLabel,
        classifierVersion,
      ] = params;

      this.epochs.set(String(id), {
        id,
        session_id: sessionId,
        epoch_start: epochStart,
        epoch_end: epochEnd,
        heart_rate_summary: heartRateSummary,
        motion_summary: motionSummary,
        sensor_quality: sensorQuality,
        sleep_probability: sleepProbability,
        elapsed_session_seconds: elapsedSessionSeconds,
        rem_probability: remProbability,
        rem_label: remLabel,
        classifier_version: classifierVersion,
      });
      return;
    }

    if (sql.includes("insert into cue_events")) {
      const [
        id,
        sessionId,
        timestamp,
        cueId,
        volumeLevel,
        deliveryDevice,
        played,
        suppressionReason,
      ] = params;

      if (!this.cueEvents.has(String(id))) {
        this.cueEvents.set(String(id), {
          id,
          session_id: sessionId,
          timestamp,
          cue_id: cueId,
          volume_level: volumeLevel,
          delivery_device: deliveryDevice,
          played,
          suppression_reason: suppressionReason,
        });
      }
      return;
    }

    if (sql.includes("insert into movement_events")) {
      const [
        id,
        sessionId,
        timestamp,
        intensity,
        wasCueAssociated,
        pauseStartedAt,
        pauseEndedAt,
      ] = params;

      if (!this.movementEvents.has(String(id))) {
        this.movementEvents.set(String(id), {
          id,
          session_id: sessionId,
          timestamp,
          source: "watch",
          intensity,
          was_cue_associated: wasCueAssociated,
          pause_started_at: pauseStartedAt,
          pause_ended_at: pauseEndedAt,
        });
      }
    }
  }

  async query<T>(): Promise<T[]> {
    return [];
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (sql.includes("from watch_sync_packages")) {
      const row = this.packages.get(String(params[0]));

      return row ? (row as T) : null;
    }

    return null;
  }

  seedPackage(record: WatchSyncPackageImportRecord): void {
    this.packages.set(record.packageId, {
      package_id: record.packageId,
      session_id: record.sessionId,
      plan_hash: record.planHash,
      package_hash: record.packageHash,
      sealed_at: record.sealedAt,
      imported_at: record.importedAt ?? null,
      import_status: record.importStatus,
      manifest_json: record.manifestJson,
      import_error: record.importError ?? null,
    });
  }
}

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function packageStatus(db: FakePackageImportDb, packageId: string): string {
  return String(db.packages.get(packageId)?.import_status);
}

function withManifest(
  manifest: WatchPackageManifestV3,
): WatchPackageManifestV3 {
  return withWatchPackageManifestHash({
    ...manifest,
    packageHash: "",
  });
}

describe("Watch package phone importer", () => {
  it("validates and imports a synthetic TLR Watch package idempotently", async () => {
    const sealedPackage = buildSyntheticTlrWatchPackageFixture();
    const db = new FakePackageImportDb();

    expect(validateWatchPackageForImport(sealedPackage)).toEqual([]);

    await expect(
      importWatchPackage({
        db,
        sealedPackage,
        importedAt: WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
      }),
    ).resolves.toMatchObject({
      status: "imported",
      packageId: sealedPackage.manifest.packageId,
      counts: {
        events: sealedPackage.manifest.eventCount,
        epochs: sealedPackage.manifest.epochCount,
        cueEvents: sealedPackage.manifest.cueEventCount,
        movementEvents: sealedPackage.manifest.movementEventCount,
      },
    });

    expect(db.sessions.get(sealedPackage.manifest.sessionId)).toMatchObject({
      mode: "watch",
      status: "ended",
      session_type: "tlr",
    });
    expect(db.runtimeEvents.size).toBe(sealedPackage.manifest.eventCount);
    expect(db.epochs.size).toBe(sealedPackage.manifest.epochCount);
    expect(db.cueEvents.size).toBe(sealedPackage.manifest.cueEventCount);
    expect(db.movementEvents.size).toBe(
      sealedPackage.manifest.movementEventCount,
    );
    expect([...db.cueEvents.values()]).toEqual([
      expect.objectContaining({
        delivery_device: "watch",
        played: 1,
      }),
    ]);
    expect([...db.movementEvents.values()]).toEqual([
      expect.objectContaining({
        source: "watch",
        was_cue_associated: 1,
      }),
    ]);
    expect(packageStatus(db, sealedPackage.manifest.packageId)).toBe("imported");

    const sizesAfterFirstImport = {
      sessions: db.sessions.size,
      runtimeEvents: db.runtimeEvents.size,
      epochs: db.epochs.size,
      cueEvents: db.cueEvents.size,
      movementEvents: db.movementEvents.size,
    };

    await expect(
      importWatchPackage({
        db,
        sealedPackage,
        importedAt: "2026-06-07T12:30:00.000Z",
      }),
    ).resolves.toMatchObject({
      status: "already_imported",
      importedAt: WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
    });

    expect({
      sessions: db.sessions.size,
      runtimeEvents: db.runtimeEvents.size,
      epochs: db.epochs.size,
      cueEvents: db.cueEvents.size,
      movementEvents: db.movementEvents.size,
    }).toEqual(sizesAfterFirstImport);
  });

  it("imports sleep_log packages without cue rows while preserving sensing rows", async () => {
    const sealedPackage = buildSyntheticSleepLogWatchPackageFixture();
    const db = new FakePackageImportDb();

    await importWatchPackage({
      db,
      sealedPackage,
      importedAt: WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
    });

    expect(db.sessions.get(sealedPackage.manifest.sessionId)).toMatchObject({
      mode: "watch",
      session_type: "sleep_log",
      selected_cue_id: null,
    });
    expect(db.epochs.size).toBe(2);
    expect(db.cueEvents.size).toBe(0);
    expect(packageStatus(db, sealedPackage.manifest.packageId)).toBe("imported");
  });

  it("rejects file hash mismatches before writing local session data", async () => {
    const sealedPackage = buildSyntheticTlrWatchPackageFixture();
    const db = new FakePackageImportDb();
    const brokenPackage = {
      ...sealedPackage,
      manifest: withManifest({
        ...sealedPackage.manifest,
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

    expect(validateWatchPackageForImport(brokenPackage)).toContain(
      "Manifest sha256 does not match plan.json.",
    );
    await expect(
      importWatchPackage({
        db,
        sealedPackage: brokenPackage,
        importedAt: WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
      }),
    ).rejects.toThrow("Manifest sha256 does not match plan.json.");

    expect(db.sessions.size).toBe(0);
    expect(db.packages.size).toBe(0);
  });

  it("rejects conflicting package IDs with different hashes", async () => {
    const sealedPackage = buildSyntheticTlrWatchPackageFixture();
    const db = new FakePackageImportDb();

    db.seedPackage({
      packageId: sealedPackage.manifest.packageId,
      sessionId: sealedPackage.manifest.sessionId,
      planHash: sealedPackage.manifest.planHash,
      packageHash: "f".repeat(64),
      sealedAt: sealedPackage.manifest.sealedAt,
      importedAt: WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
      importStatus: "imported" as WatchSyncPackageImportStatus,
      manifestJson: "{}",
    });

    await expect(
      importWatchPackage({
        db,
        sealedPackage,
        importedAt: WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
      }),
    ).rejects.toThrow("already exists with a different packageHash");
  });

  it("registers the package import table in local migrations and reset-safe table lists", () => {
    expect(LOCAL_MIGRATIONS.map((migration) => migration.id)).toContain(
      "008_watch_sync_packages",
    );
    expect(LOCAL_TABLES).toContain("watch_sync_packages");
    expect(source("src/data/local/runtimeMigrations.ts")).toContain(
      "create table if not exists watch_sync_packages",
    );
    expect(source("src/data/local/migrations/008_watch_sync_packages.sql")).toContain(
      "idx_watch_sync_packages_session",
    );
  });

  it("keeps Watch Mode public-disabled and avoids transport/native runtime imports", () => {
    const availability = source("src/features/watchMode/watchModeAvailability.ts");
    const home = source("src/screens/HomeScreen.tsx");
    const appState = source("src/state/AppState.tsx");
    const importer = source("src/features/watchHistory/importWatchPackage.ts");

    expect(availability).toContain("WATCH_MODE_ENABLED = false");
    expect(home).toContain("WATCH_MODE_DISABLED_MESSAGE");
    expect(appState).toContain("throw new Error(WATCH_MODE_DISABLED_MESSAGE)");
    expect(importer).not.toContain("WatchConnectivity");
    expect(importer).not.toContain("HealthKit");
    expect(importer).not.toContain("CoreMotion");
    expect(importer).not.toContain("AVFoundation");
    expect(importer).not.toContain("HKWorkoutSession");
  });
});
