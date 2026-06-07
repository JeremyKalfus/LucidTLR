import Foundation

struct WatchPackageSealer: WatchPackageSealing {
  func seal(
    plan: WatchRuntimePlanV3,
    logStore: WatchRuntimeLogStore,
    sealReason: WatchRuntimeSealReason,
    sealedAt: Date,
    startedAt: Date,
    endedAt: Date,
    batteryStart: Double,
    batteryEnd: Double
  ) -> WatchPackageManifestV3 {
    let firstSequenceNumber = logStore.events.first?.sequenceNumber ?? 1
    let lastSequenceNumber = logStore.events.last?.sequenceNumber ?? firstSequenceNumber
    let eventCount = logStore.events.count
    let packageId = buildPackageId(
      sessionId: plan.sessionId,
      planHash: plan.planHash,
      firstSequenceNumber: firstSequenceNumber,
      lastSequenceNumber: lastSequenceNumber
    )
    let files = [
      fileEntry(relativePath: "events.jsonl", count: logStore.events.count, seed: "events|\(packageId)"),
      fileEntry(relativePath: "epochs.jsonl", count: logStore.epochRecords.count, seed: "epochs|\(packageId)"),
      fileEntry(relativePath: "cues.jsonl", count: logStore.cueRecords.count, seed: "cues|\(packageId)"),
      fileEntry(relativePath: "movement.jsonl", count: logStore.movementRecords.count, seed: "movement|\(packageId)"),
    ]
    let runtimeSummary = WatchPackageRuntimeSummaryV3(
      startedAt: WatchRuntimeDateFormat.string(from: startedAt),
      endedAt: WatchRuntimeDateFormat.string(from: endedAt),
      durationSeconds: max(0, Int(endedAt.timeIntervalSince(startedAt))),
      sealReason: sealReason.rawValue,
      batteryStart: batteryStart,
      batteryEnd: batteryEnd,
      missingEpochCount: logStore.epochRecords.filter { $0.sensorQuality == "missing" || $0.sensorQuality == "bad" }.count,
      sensorQualitySummary: sensorQualitySummary(for: logStore.epochRecords),
      cuesAttempted: logStore.cueRecords.filter(\.attempted).count,
      cuesDelivered: logStore.cueRecords.filter(\.delivered).count,
      cueFailures: logStore.cueRecords.filter { $0.attempted && !$0.delivered }.count,
      movementPauses: logStore.events.filter {
        $0.eventType == WatchRuntimeEventType.movementPauseStarted.rawValue ||
        $0.eventType == WatchRuntimeEventType.cueAssociatedMovementPauseStarted.rawValue
      }.count
    )
    let packageHash = WatchRuntimeStructuralHash.placeholderHex(
      "\(packageId)|\(eventCount)|\(logStore.epochRecords.count)|\(runtimeSummary.durationSeconds)|\(sealReason.rawValue)"
    )

    return WatchPackageManifestV3(
      schemaVersion: WatchPackageManifestV3Schema.schemaVersion,
      packageId: packageId,
      sessionId: plan.sessionId,
      planHash: plan.planHash,
      packageHash: packageHash,
      sealedAt: WatchRuntimeDateFormat.string(from: sealedAt),
      sealReason: sealReason.rawValue,
      startReceiptId: "synthetic-start-receipt-\(plan.sessionId)",
      firstSequenceNumber: firstSequenceNumber,
      lastSequenceNumber: lastSequenceNumber,
      eventCount: eventCount,
      epochCount: logStore.epochRecords.count,
      cueEventCount: logStore.cueRecords.count,
      movementEventCount: logStore.movementRecords.count,
      files: files,
      runtimeSummary: runtimeSummary,
      importStatus: "sealed_waiting_for_phone",
      importedAt: nil,
      importAckId: nil
    )
  }

  private func buildPackageId(
    sessionId: String,
    planHash: String,
    firstSequenceNumber: Int,
    lastSequenceNumber: Int
  ) -> String {
    let hash = WatchRuntimeStructuralHash.placeholderHex(
      "watch-package-v3|\(sessionId)|\(planHash)|\(firstSequenceNumber)|\(lastSequenceNumber)"
    )
    return "watch-package-v3-\(String(hash.prefix(24)))"
  }

  private func fileEntry(relativePath: String, count: Int, seed: String) -> WatchPackageFileEntryV3 {
    WatchPackageFileEntryV3(
      relativePath: relativePath,
      byteLength: max(2, count * 128),
      sha256: WatchRuntimeStructuralHash.placeholderHex(seed)
    )
  }

  private func sensorQualitySummary(for epochs: [WatchEpochRecordV3]) -> String {
    let qualities = Set(epochs.map(\.sensorQuality))

    if qualities.contains("bad") {
      return "bad"
    }

    if qualities.contains("missing") {
      return "missing"
    }

    if qualities.contains("degraded") {
      return "degraded"
    }

    return "good"
  }
}
