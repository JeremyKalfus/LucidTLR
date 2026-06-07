import {
  assertValidWatchRuntimePlan,
  hashWatchRuntimePayload,
  sha256Hex,
  validateWatchPackageManifest as validateNativeWatchPackageManifest,
  validateWatchRuntimePlan,
  type WatchPackageFileEntryV3,
} from "@/src/native/watchRuntime";

import {
  REQUIRED_WATCH_PACKAGE_FILES,
  WATCH_PACKAGE_COMMIT_FILE,
  WATCH_PACKAGE_CUE_EVENTS_FILE,
  WATCH_PACKAGE_EPOCHS_FILE,
  WATCH_PACKAGE_EVENTS_FILE,
  WATCH_PACKAGE_MOVEMENT_EVENTS_FILE,
  WATCH_PACKAGE_PLAN_FILE,
  WATCH_PACKAGE_RUNTIME_SUMMARY_FILE,
  type DecodedWatchPackageV3,
  type WatchCuePackageRecordV3,
  type WatchEpochPackageRecordV3,
  type WatchMovementPackageRecordV3,
  type WatchPackageFilePayloadV3,
  type WatchRuntimeEventPackageRecordV3,
  type WatchSealedPackageV3,
  type WatchSessionCommitPackageRecordV3,
} from "./watchPackageImportTypes";

export function watchPackageUtf8ByteLength(value: string): number {
  let byteLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) {
      continue;
    }

    if (codePoint > 0xffff) {
      index += 1;
    }

    if (codePoint <= 0x7f) {
      byteLength += 1;
    } else if (codePoint <= 0x7ff) {
      byteLength += 2;
    } else if (codePoint <= 0xffff) {
      byteLength += 3;
    } else {
      byteLength += 4;
    }
  }

  return byteLength;
}

export function encodeWatchPackageJson(value: unknown): string {
  return JSON.stringify(value);
}

export function encodeWatchPackageJsonl(records: readonly unknown[]): string {
  return records.length === 0
    ? ""
    : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export function buildWatchPackageFileEntry(
  file: WatchPackageFilePayloadV3,
): WatchPackageFileEntryV3 {
  return {
    relativePath: file.relativePath,
    byteLength: watchPackageUtf8ByteLength(file.contents),
    sha256: sha256Hex(file.contents),
  };
}

function parseJson<T>(contents: string, relativePath: string, errors: string[]): T | null {
  try {
    return JSON.parse(contents) as T;
  } catch {
    errors.push(`${relativePath} must contain valid JSON.`);
    return null;
  }
}

function parseJsonl<T>(
  contents: string,
  relativePath: string,
  errors: string[],
): T[] {
  if (contents.trim().length === 0) {
    return [];
  }

  return contents
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        errors.push(`${relativePath} line ${index + 1} must contain valid JSON.`);
        return null as T;
      }
    })
    .filter((record): record is T => record !== null);
}

function fileMapFor(
  files: WatchPackageFilePayloadV3[],
  errors: string[],
): Map<string, WatchPackageFilePayloadV3> {
  const fileMap = new Map<string, WatchPackageFilePayloadV3>();

  for (const file of files) {
    if (fileMap.has(file.relativePath)) {
      errors.push(`Package contains duplicate file ${file.relativePath}.`);
      continue;
    }

    fileMap.set(file.relativePath, file);
  }

  return fileMap;
}

function requireFile(
  fileMap: Map<string, WatchPackageFilePayloadV3>,
  relativePath: string,
  errors: string[],
): WatchPackageFilePayloadV3 | null {
  const file = fileMap.get(relativePath);

  if (!file) {
    errors.push(`Package is missing required file ${relativePath}.`);
    return null;
  }

  return file;
}

function validateFileEntries(
  sealedPackage: WatchSealedPackageV3,
  fileMap: Map<string, WatchPackageFilePayloadV3>,
  errors: string[],
): void {
  for (const requiredFile of REQUIRED_WATCH_PACKAGE_FILES) {
    const payload = requireFile(fileMap, requiredFile, errors);
    const manifestEntry = sealedPackage.manifest.files.find(
      (entry) => entry.relativePath === requiredFile,
    );

    if (!manifestEntry) {
      errors.push(`Manifest is missing file entry for ${requiredFile}.`);
      continue;
    }

    if (!payload) {
      continue;
    }

    const expectedEntry = buildWatchPackageFileEntry(payload);

    if (manifestEntry.byteLength !== expectedEntry.byteLength) {
      errors.push(`Manifest byteLength does not match ${requiredFile}.`);
    }

    if (manifestEntry.sha256 !== expectedEntry.sha256) {
      errors.push(`Manifest sha256 does not match ${requiredFile}.`);
    }
  }
}

function validateEventSequence(
  decoded: DecodedWatchPackageV3,
  errors: string[],
): void {
  const { manifest, events } = decoded;

  if (events.length !== manifest.eventCount) {
    errors.push("Manifest eventCount must match events.jsonl records.");
  }

  const expectedSequences = new Set<number>();
  for (
    let sequenceNumber = manifest.firstSequenceNumber;
    sequenceNumber <= manifest.lastSequenceNumber;
    sequenceNumber += 1
  ) {
    expectedSequences.add(sequenceNumber);
  }

  const eventSequences = new Set(events.map((event) => event.sequenceNumber));
  if (
    eventSequences.size !== expectedSequences.size ||
    [...expectedSequences].some((sequence) => !eventSequences.has(sequence))
  ) {
    errors.push("Package events must be contiguous across the manifest sequence range.");
  }

  const eventIds = new Set<string>();
  for (const event of events) {
    if (event.sessionId !== manifest.sessionId) {
      errors.push("Package event sessionId must match manifest sessionId.");
    }

    if (!event.eventId || !event.eventType || !event.recordHash) {
      errors.push("Package events require eventId, eventType, and recordHash.");
    }

    eventIds.add(event.eventId);
  }

  if (eventIds.size !== events.length) {
    errors.push("Package eventIds must be unique.");
  }
}

function validateRecordCountsAndSessions(
  decoded: DecodedWatchPackageV3,
  errors: string[],
): void {
  const { manifest, events, epochs, cueEvents, movementEvents } = decoded;
  const eventSequences = new Set(events.map((event) => event.sequenceNumber));

  if (epochs.length !== manifest.epochCount) {
    errors.push("Manifest epochCount must match epochs.jsonl records.");
  }

  if (cueEvents.length !== manifest.cueEventCount) {
    errors.push("Manifest cueEventCount must match cue_events.jsonl records.");
  }

  if (movementEvents.length !== manifest.movementEventCount) {
    errors.push("Manifest movementEventCount must match movement_events.jsonl records.");
  }

  for (const record of [...epochs, ...cueEvents, ...movementEvents]) {
    if (record.sessionId !== manifest.sessionId) {
      errors.push("Package record sessionId must match manifest sessionId.");
    }

    if (!eventSequences.has(record.sequenceNumber)) {
      errors.push("Package summary records must reference an event sequenceNumber.");
    }
  }
}

function decodeWatchPackage(
  sealedPackage: WatchSealedPackageV3,
  errors: string[],
): DecodedWatchPackageV3 | null {
  const fileMap = fileMapFor(sealedPackage.files, errors);

  const planFile = requireFile(fileMap, WATCH_PACKAGE_PLAN_FILE, errors);
  const commitFile = requireFile(fileMap, WATCH_PACKAGE_COMMIT_FILE, errors);
  const eventsFile = requireFile(fileMap, WATCH_PACKAGE_EVENTS_FILE, errors);
  const epochsFile = requireFile(fileMap, WATCH_PACKAGE_EPOCHS_FILE, errors);
  const cueEventsFile = requireFile(fileMap, WATCH_PACKAGE_CUE_EVENTS_FILE, errors);
  const movementEventsFile = requireFile(
    fileMap,
    WATCH_PACKAGE_MOVEMENT_EVENTS_FILE,
    errors,
  );
  const runtimeSummaryFile = requireFile(
    fileMap,
    WATCH_PACKAGE_RUNTIME_SUMMARY_FILE,
    errors,
  );

  if (
    !planFile ||
    !commitFile ||
    !eventsFile ||
    !epochsFile ||
    !cueEventsFile ||
    !movementEventsFile ||
    !runtimeSummaryFile
  ) {
    return null;
  }

  const plan = parseJson<DecodedWatchPackageV3["plan"]>(
    planFile.contents,
    WATCH_PACKAGE_PLAN_FILE,
    errors,
  );
  const commit = parseJson<WatchSessionCommitPackageRecordV3>(
    commitFile.contents,
    WATCH_PACKAGE_COMMIT_FILE,
    errors,
  );
  const runtimeSummary = parseJson<DecodedWatchPackageV3["runtimeSummary"]>(
    runtimeSummaryFile.contents,
    WATCH_PACKAGE_RUNTIME_SUMMARY_FILE,
    errors,
  );

  if (!plan || !commit || !runtimeSummary) {
    return null;
  }

  return {
    manifest: sealedPackage.manifest,
    plan,
    commit,
    runtimeSummary,
    events: parseJsonl<WatchRuntimeEventPackageRecordV3>(
      eventsFile.contents,
      WATCH_PACKAGE_EVENTS_FILE,
      errors,
    ),
    epochs: parseJsonl<WatchEpochPackageRecordV3>(
      epochsFile.contents,
      WATCH_PACKAGE_EPOCHS_FILE,
      errors,
    ),
    cueEvents: parseJsonl<WatchCuePackageRecordV3>(
      cueEventsFile.contents,
      WATCH_PACKAGE_CUE_EVENTS_FILE,
      errors,
    ),
    movementEvents: parseJsonl<WatchMovementPackageRecordV3>(
      movementEventsFile.contents,
      WATCH_PACKAGE_MOVEMENT_EVENTS_FILE,
      errors,
    ),
  };
}

export function validateWatchPackageForImport(
  sealedPackage: WatchSealedPackageV3,
): string[] {
  const errors = [...validateNativeWatchPackageManifest(sealedPackage.manifest)];
  const fileMap = fileMapFor(sealedPackage.files, errors);

  validateFileEntries(sealedPackage, fileMap, errors);

  const decoded = decodeWatchPackage(sealedPackage, errors);

  if (!decoded) {
    return errors;
  }

  errors.push(...validateWatchRuntimePlan(decoded.plan));

  if (decoded.plan.mode !== "watch") {
    errors.push("Imported Watch package plan must be watch-owned.");
  }

  if (decoded.plan.sessionId !== decoded.manifest.sessionId) {
    errors.push("Plan sessionId must match manifest sessionId.");
  }

  if (decoded.plan.planHash !== decoded.manifest.planHash) {
    errors.push("Plan hash must match manifest planHash.");
  }

  if (
    decoded.commit.sessionId !== decoded.manifest.sessionId ||
    decoded.commit.planHash !== decoded.manifest.planHash
  ) {
    errors.push("Commit must match manifest sessionId and planHash.");
  }

  if (
    hashWatchRuntimePayload(decoded.runtimeSummary) !==
    hashWatchRuntimePayload(decoded.manifest.runtimeSummary)
  ) {
    errors.push("Runtime summary file must match manifest runtimeSummary.");
  }

  if (
    decoded.manifest.importStatus !== "sealed_waiting_for_phone" &&
    decoded.manifest.importStatus !== "transfer_pending"
  ) {
    errors.push("Watch package must be sealed or transfer-pending before phone import.");
  }

  validateEventSequence(decoded, errors);
  validateRecordCountsAndSessions(decoded, errors);

  return [...new Set(errors)];
}

export function decodeValidWatchPackageForImport(
  sealedPackage: WatchSealedPackageV3,
): DecodedWatchPackageV3 {
  const errors = validateWatchPackageForImport(sealedPackage);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  assertValidWatchRuntimePlan(
    JSON.parse(
      requireFile(
        fileMapFor(sealedPackage.files, []),
        WATCH_PACKAGE_PLAN_FILE,
        [],
      )?.contents ?? "{}",
    ),
  );

  const decoded = decodeWatchPackage(sealedPackage, []);

  if (!decoded) {
    throw new Error("Watch package decode failed after validation.");
  }

  return decoded;
}
