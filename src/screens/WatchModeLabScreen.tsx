import { Redirect, router } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  FileJson,
  RefreshCw,
  Share2,
  ShieldAlert,
  Watch,
} from "lucide-react-native";
import React from "react";
import * as FileSystem from "expo-file-system/legacy";
import { Share, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  buildSyntheticWatchModeLabPlan,
  applyWatchModeLabRecoveryAction,
  importSyntheticWatchModeLabPackage,
  loadWatchModeLabRecoverySummary,
  summarizeWatchModeLabPlan,
  validateCorruptSyntheticWatchModeLabPackage,
  type WatchModeLabRecoveryAction,
  type WatchModeLabRecoverySummary,
  type WatchModeLabKind,
  type WatchModeLabPackageImportSummary,
  type WatchModeLabPackageValidationSummary,
  type WatchModeLabPlanSummary,
} from "@/src/features/watchModeLab/watchModeLab";
import {
  createWatchModeLabDebugBundle,
  watchModeLabDebugBundleFileName,
  type WatchModeLabActionLogEntry,
} from "@/src/features/watchModeLab/watchModeLabDebugExport";
import { appendWatchModeLabDebugEvent } from "@/src/features/watchModeLab/watchModeLabDebugEvents";
import {
  activateWatchModeLabTransport,
  applyWatchTransportReceiptSnapshots,
  clearWatchModeLabTransportStatus,
  importLatestReceivedSyntheticWatchPackage,
  loadWatchModeLabTransportSummary,
  requestWatchModeLabTransportStatus,
  resetWatchModeLabTransportBaselineState,
  sendAckForLatestImportedWatchPackage,
  stageSyntheticWatchModeTransportPlan,
  type WatchModeLabTransportSummary,
} from "@/src/features/watchModeLab/watchModeTransportLab";
import {
  internalLabBuildInfo,
  isWatchModeLabAvailable,
} from "@/src/features/internalBuild/internalBuildFlags";
import type {
  NativeWatchPackageTransferStatus,
  NativeWatchTransportStatus,
} from "@/src/native/watchTransport";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

function LabNote({ children }: { children: string }) {
  return (
    <Text
      selectable
      style={{
        color: colors.textSecondary,
        fontSize: typography.body.fontSize,
        lineHeight: typography.body.lineHeight,
      }}
    >
      {children}
    </Text>
  );
}

function planTitle(kind: WatchModeLabKind): string {
  return kind === "tlr" ? "synthetic TLR plan" : "synthetic sleep log plan";
}

function resultCounts(summary: WatchModeLabPackageImportSummary): string {
  return [
    `${summary.counts.events} events`,
    `${summary.counts.epochs} epochs`,
    `${summary.counts.cueEvents} cues`,
    `${summary.counts.movementEvents} movements`,
  ].join(" / ");
}

function packageTransferBytesLabel(
  transfer?: NativeWatchPackageTransferStatus,
): string {
  if (!transfer) {
    return "none";
  }

  return `manifest ${transfer.manifestJsonByteCount}, file ${transfer.packageFileByteCount}`;
}

function packageTransferOutstandingLabel(
  transfer?: NativeWatchPackageTransferStatus,
): string {
  if (!transfer) {
    return "none";
  }

  return `userInfo ${transfer.outstandingUserInfoTransferCount}, file ${transfer.outstandingFileTransferCount}`;
}

function packageFilePersistenceLabel(
  file?:
    | NativeWatchTransportStatus["latestPackageFile"]
    | NativeWatchTransportStatus["latestReceivedPackage"],
): string {
  if (!file) {
    return "none";
  }

  const persisted = file.persisted === false ? "not persisted" : "persisted";
  const byteCount =
    typeof file.fileByteCount === "number"
      ? `${file.fileByteCount} bytes`
      : "unknown bytes";
  const sourceExists =
    typeof file.sourceExistsBeforeCopy === "boolean"
      ? `source existed: ${file.sourceExistsBeforeCopy ? "yes" : "no"}`
      : "source existed: unknown";

  return `${persisted}, ${byteCount}, ${sourceExists}`;
}

function hasTransportBaselineEvidence(
  summary: WatchModeLabTransportSummary | null,
): boolean {
  return Boolean(currentBaselineSessionId(summary));
}

function currentBaselineSessionId(
  summary: WatchModeLabTransportSummary | null,
): string | undefined {
  const unresolvedTransportState = summary?.recovery.states.find(
    (state) =>
      state.metadataJson.includes('"transportLab":true') &&
      state.status !== "abandoned_local_only",
  );

  return unresolvedTransportState?.sessionId ?? summary?.status.latestStagedPlanId;
}

function currentBaselinePlanHash(
  summary: WatchModeLabTransportSummary | null,
  sessionId: string | undefined,
): string | undefined {
  const unresolvedTransportState = summary?.recovery.states.find(
    (state) => state.sessionId === sessionId,
  );

  return unresolvedTransportState?.planHash ?? summary?.status.latestStagedPlanHash;
}

function matchesBaselineIdentity(
  record:
    | {
        sessionId?: string;
        planHash?: string;
      }
    | undefined,
  sessionId: string | undefined,
  planHash?: string,
): boolean {
  if (!record || !sessionId || record.sessionId !== sessionId) {
    return false;
  }

  return !planHash || !record.planHash || record.planHash === planHash;
}

function matchingBaselineCommitReceipt(
  status: NativeWatchTransportStatus,
  sessionId: string | undefined,
  planHash?: string,
) {
  return matchesBaselineIdentity(status.latestCommitReceipt, sessionId, planHash)
    ? status.latestCommitReceipt
    : undefined;
}

function hasPersistedPackageFileForBaseline(
  status: NativeWatchTransportStatus,
  sessionId: string | undefined,
  planHash?: string,
): boolean {
  if (
    status.latestPackageFile?.persisted === true &&
    matchesBaselineIdentity(status.latestPackageFile, sessionId, planHash)
  ) {
    return true;
  }

  return Boolean(
    status.latestReceivedPackage &&
      status.latestReceivedPackage.persisted !== false &&
      matchesBaselineIdentity(status.latestReceivedPackage, sessionId, planHash),
  );
}

function recoveryActionLabel(action: WatchModeLabRecoveryAction): string {
  switch (action) {
    case "watch_committed":
      return "Simulate watch committed";
    case "watch_running_last_known":
      return "Simulate watch running last-known";
    case "watch_sealed_waiting_import":
      return "Simulate watch sealed waiting import";
    case "phone_import_success_ack_eligible":
      return "Simulate phone import success / ack eligible";
    case "ack_recorded":
      return "Simulate ack recorded";
    case "abandon_local_only":
      return "Mark lab session abandoned local-only";
    case "reload":
      return "Reload recovery state";
  }
}

const GUIDED_TRANSPORT_DRILL_STEPS = [
  "Activate transport on phone and Watch.",
  "Stage synthetic TLR plan from phone.",
  "Commit staged plan on Watch, send receipt, then request Watch status on phone.",
  "Force-quit/reopen phone, activate transport again, then reload recovery from DB.",
  "Seal and transfer synthetic package from Watch.",
  "Request Watch status on phone and confirm package transfer stage/bytes update.",
  "Import latest received synthetic package on phone.",
  "Send ack and confirm Watch records it.",
  "Retry package transfer/import/ack to check idempotency.",
  "Export Watch Lab Debug Bundle.",
] as const;

export interface WatchModeLabAutomationParams {
  autorun?: "baseline" | "import-ack" | "reset";
  exportTo?: "file";
  runId?: string;
}

export const WATCH_MODE_LAB_AUTOMATION_EXPORT_FILE_NAME =
  "watch-lab-debug-latest.json";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function WatchModeLabScreen({
  automationParams,
}: {
  automationParams?: WatchModeLabAutomationParams;
} = {}) {
  if (!isWatchModeLabAvailable()) {
    return <Redirect href="/" />;
  }

  const { engineSettings, participantId, selectedMode, tlrOptions } =
    useAppState();
  const buildInfo = React.useMemo(() => internalLabBuildInfo(), []);
  const [planSummary, setPlanSummary] =
    React.useState<WatchModeLabPlanSummary | null>(null);
  const [importSummary, setImportSummary] =
    React.useState<WatchModeLabPackageImportSummary | null>(null);
  const [validationSummary, setValidationSummary] =
    React.useState<WatchModeLabPackageValidationSummary | null>(null);
  const [recoverySummary, setRecoverySummary] =
    React.useState<WatchModeLabRecoverySummary | null>(null);
  const [transportSummary, setTransportSummary] =
    React.useState<WatchModeLabTransportSummary | null>(null);
  const [busyLabel, setBusyLabel] = React.useState<string | null>(null);
  const [exportInfo, setExportInfo] = React.useState<string | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string>(
    "Internal TestFlight Lab -- synthetic / QA only. Public Watch Mode remains disabled.",
  );
  const [actionLog, setActionLog] = React.useState<WatchModeLabActionLogEntry[]>([]);
  const [guidedDrillActive, setGuidedDrillActive] = React.useState(false);
  const [guidedStepIndex, setGuidedStepIndex] = React.useState(0);
  const labOpenedRecordedRef = React.useRef(false);
  const automationRunRef = React.useRef<string | null>(null);

  const reloadRecoveryState = React.useCallback(async () => {
    const db = await getLocalDb();
    const summary = await loadWatchModeLabRecoverySummary({
      db,
      participantId,
    });

    setRecoverySummary(summary);
  }, [participantId]);

  const reloadTransportState = React.useCallback(async () => {
    const db = await getLocalDb();
    const summary = await loadWatchModeLabTransportSummary({
      db,
      participantId,
    });

    setTransportSummary(summary);
    setRecoverySummary(summary.recovery);
  }, [participantId]);

  React.useEffect(() => {
    void reloadRecoveryState();
    void reloadTransportState();
  }, [reloadRecoveryState, reloadTransportState]);

  React.useEffect(() => {
    if (labOpenedRecordedRef.current) {
      return;
    }

    labOpenedRecordedRef.current = true;

    void getLocalDb()
      .then((db) =>
        appendWatchModeLabDebugEvent({
          db,
          source: "phone_lab",
          eventType: "phone_lab_opened",
          metadata: {
            lane: buildInfo.lane,
            labAvailable: buildInfo.labAvailable,
            publicWatchModeDisabled: true,
          },
        }),
      )
      .catch(() => {
        // The visible lab still works if durable debug recording is unavailable.
      });
  }, [buildInfo.labAvailable, buildInfo.lane]);

  function recordLabAction(input: {
    action: string;
    result: WatchModeLabActionLogEntry["result"];
    message: string;
    details?: Record<string, unknown>;
  }) {
    const entry: WatchModeLabActionLogEntry = {
      at: new Date().toISOString(),
      action: input.action,
      result: input.result,
      message: input.message,
      details: input.details,
    };

    setActionLog((current) => [...current, entry].slice(-80));
    setMessage(input.message);

    void getLocalDb()
      .then((db) =>
        appendWatchModeLabDebugEvent({
          db,
          timestamp: entry.at,
          source: "phone_lab",
          eventType: input.action,
          sessionId:
            typeof input.details?.sessionId === "string"
              ? input.details.sessionId
              : undefined,
          planHash:
            typeof input.details?.planHash === "string"
              ? input.details.planHash
              : undefined,
          packageId:
            typeof input.details?.packageId === "string"
              ? input.details.packageId
              : undefined,
          packageHash:
            typeof input.details?.packageHash === "string"
              ? input.details.packageHash
              : undefined,
          success: input.result === "ok",
          errorMessage: input.result === "error" ? input.message : undefined,
          metadata: {
            message: input.message,
            ...input.details,
          },
        }),
      )
      .catch(() => {
        // Keep lab actions usable even if debug-event persistence fails.
      });
  }

  function startGuidedTransportDrill() {
    setGuidedDrillActive(true);
    setGuidedStepIndex(0);
    recordLabAction({
      action: "guided_transport_drill_started",
      result: "ok",
      message:
        "Started guided synthetic WatchConnectivity transport drill. Fixture import and recovery simulation buttons are separate QA tools.",
      details: {
        stepCount: GUIDED_TRANSPORT_DRILL_STEPS.length,
      },
    });
  }

  function markGuidedStepComplete() {
    const step = GUIDED_TRANSPORT_DRILL_STEPS[guidedStepIndex];
    const nextIndex = Math.min(
      guidedStepIndex + 1,
      GUIDED_TRANSPORT_DRILL_STEPS.length - 1,
    );
    const completed = guidedStepIndex >= GUIDED_TRANSPORT_DRILL_STEPS.length - 1;

    setGuidedDrillActive(!completed);
    setGuidedStepIndex(nextIndex);
    recordLabAction({
      action: completed
        ? "guided_transport_drill_completed"
        : "guided_transport_drill_step_completed",
      result: "ok",
      message: completed
        ? "Completed guided transport drill checklist. Export the bundle for analysis."
        : `Completed guided drill step ${guidedStepIndex + 1}; next: ${GUIDED_TRANSPORT_DRILL_STEPS[nextIndex]}`,
      details: {
        completedStepNumber: guidedStepIndex + 1,
        completedStep: step,
        nextStepNumber: completed ? undefined : nextIndex + 1,
        nextStep: completed ? undefined : GUIDED_TRANSPORT_DRILL_STEPS[nextIndex],
      },
    });
  }

  async function runTransportAction(
    label: string,
    action: () => Promise<string>,
  ) {
    setBusyLabel(label);

    try {
      recordLabAction({
        action: `transport:${label.replace(/\.+$/, "")}`,
        result: "ok",
        message: await action(),
      });
    } catch (error) {
      recordLabAction({
        action: `transport:${label.replace(/\.+$/, "")}`,
        result: "error",
        message:
          error instanceof Error
            ? error.message
            : "Synthetic transport action failed.",
      });
    } finally {
      setBusyLabel(null);
    }
  }

  async function waitForBaselineWatchEvidence(input: {
    db: Awaited<ReturnType<typeof getLocalDb>>;
    baselineSessionId: string | undefined;
    baselinePlanHash: string | undefined;
    timeoutMs?: number;
  }): Promise<WatchModeLabTransportSummary> {
    const deadline = Date.now() + (input.timeoutMs ?? 45000);
    let summary = await loadWatchModeLabTransportSummary({
      db: input.db,
      participantId,
    });
    let baselineSessionId =
      input.baselineSessionId ?? currentBaselineSessionId(summary);
    let baselinePlanHash =
      input.baselinePlanHash ??
      currentBaselinePlanHash(summary, baselineSessionId);

    while (Date.now() < deadline) {
      const commitReceipt = matchingBaselineCommitReceipt(
        summary.status,
        baselineSessionId,
        baselinePlanHash,
      );
      const hasPackageFile = hasPersistedPackageFileForBaseline(
        summary.status,
        baselineSessionId,
        baselinePlanHash,
      );

      if (commitReceipt && hasPackageFile) {
        return summary;
      }

      await sleep(2500);
      summary = await loadWatchModeLabTransportSummary({
        db: input.db,
        participantId,
      });
      baselineSessionId =
        baselineSessionId ?? currentBaselineSessionId(summary);
      baselinePlanHash =
        baselinePlanHash ??
        currentBaselinePlanHash(summary, baselineSessionId);
    }

    return summary;
  }

  async function runOneButtonTransportBaseline() {
    setBusyLabel("Running baseline...");

    try {
      const db = await getLocalDb();
      let summary = await activateWatchModeLabTransport({
        db,
        participantId,
      });

      setTransportSummary(summary);
      setRecoverySummary(summary.recovery);
      recordLabAction({
        action: "automated_transport_baseline_started",
        result: "ok",
        message:
          "Started one-button synthetic transport baseline. This does not replace interruption testing.",
        details: {
          unresolvedCount: summary.recovery.unresolvedCount,
          doesNotReplaceInterruptionTesting: true,
        },
      });

      let baselineSessionId = currentBaselineSessionId(summary);
      let baselinePlanHash = currentBaselinePlanHash(summary, baselineSessionId);

      if (!hasTransportBaselineEvidence(summary)) {
        const staged = await stageSyntheticWatchModeTransportPlan({
          db,
          kind: "tlr",
          participantId,
          selectedCueId: tlrOptions.selectedCueId,
          tlrOptions,
          engineSettings,
        });

        setPlanSummary(staged.plan);
        summary = {
          status: staged.status,
          recovery: staged.recovery,
        };
        setTransportSummary(summary);
        setRecoverySummary(summary.recovery);
        baselineSessionId = staged.plan.sessionId;
        baselinePlanHash = staged.plan.planHash;
        recordLabAction({
          action: "automated_transport_baseline_plan_staged",
          result: "ok",
          message:
            "Baseline staged a synthetic TLR plan. Run the Watch baseline loop next if no Watch proof has returned yet.",
          details: {
            sessionId: staged.plan.sessionId,
            planHash: staged.plan.planHash,
          },
        });
      } else {
        recordLabAction({
          action: "automated_transport_baseline_reused_state",
          result: "ok",
          message:
            "Baseline reused existing synthetic transport/recovery state instead of staging a new plan.",
          details: {
            unresolvedCount: summary.recovery.unresolvedCount,
            stagedPlanId: baselineSessionId,
            commitSessionId: matchingBaselineCommitReceipt(
              summary.status,
              baselineSessionId,
              baselinePlanHash,
            )?.sessionId,
            packageId:
              matchesBaselineIdentity(
                summary.status.latestPackageFile,
                baselineSessionId,
                baselinePlanHash,
              )
                ? summary.status.latestPackageFile?.packageId
                : matchesBaselineIdentity(
                      summary.status.latestReceivedPackage,
                      baselineSessionId,
                      baselinePlanHash,
                    )
                  ? summary.status.latestReceivedPackage?.packageId
                  : undefined,
          },
        });
      }

      summary = await waitForBaselineWatchEvidence({
        db,
        baselineSessionId,
        baselinePlanHash,
      });
      setTransportSummary(summary);
      setRecoverySummary(summary.recovery);
      baselineSessionId =
        baselineSessionId ?? currentBaselineSessionId(summary);
      baselinePlanHash =
        baselinePlanHash ?? currentBaselinePlanHash(summary, baselineSessionId);
      const commitReceipt = matchingBaselineCommitReceipt(
        summary.status,
        baselineSessionId,
        baselinePlanHash,
      );

      if (!commitReceipt) {
        recordLabAction({
          action: "automated_transport_baseline_waiting_for_watch",
          result: "ok",
          message:
            "Baseline is waiting for Watch proof. On Watch, tap Run Watch baseline loop, then tap Run One-Button Baseline again on phone.",
          details: {
            missing: "commit_receipt",
            stagedPlanId: baselineSessionId ?? summary.status.latestStagedPlanId,
            ignoredCommitSessionId: summary.status.latestCommitReceipt?.sessionId,
            ignoredPackageSessionId:
              summary.status.latestPackageManifest?.sessionId ??
              summary.status.latestPackageFile?.sessionId ??
              summary.status.latestReceivedPackage?.sessionId,
          },
        });
        return;
      }

      if (
        !hasPersistedPackageFileForBaseline(
          summary.status,
          baselineSessionId,
          baselinePlanHash,
        )
      ) {
        recordLabAction({
          action: "automated_transport_baseline_waiting_for_package_file",
          result: "ok",
          message:
            "Baseline saw Watch progress but no persisted package file yet. Run the Watch baseline loop or retry package transfer, then tap this again.",
          details: {
            missing: "persisted_package_file",
            sessionId: commitReceipt.sessionId,
            planHash: commitReceipt.planHash,
            packageId:
              matchesBaselineIdentity(
                summary.status.latestPackageManifest,
                baselineSessionId,
                baselinePlanHash,
              )
                ? summary.status.latestPackageManifest?.packageId
                : matchesBaselineIdentity(
                      summary.status.latestPackageFile,
                      baselineSessionId,
                      baselinePlanHash,
                    )
                  ? summary.status.latestPackageFile?.packageId
                  : undefined,
            packageHash:
              matchesBaselineIdentity(
                summary.status.latestPackageManifest,
                baselineSessionId,
                baselinePlanHash,
              )
                ? summary.status.latestPackageManifest?.packageHash
                : matchesBaselineIdentity(
                      summary.status.latestPackageFile,
                      baselineSessionId,
                      baselinePlanHash,
                    )
                  ? summary.status.latestPackageFile?.packageHash
                  : undefined,
            packageFile: summary.status.latestPackageFile,
          },
        });
        return;
      }

      const imported = await importLatestReceivedSyntheticWatchPackage({
        db,
        participantId,
      });
      setImportSummary(imported.importSummary);
      summary = {
        status: imported.status,
        recovery: imported.recovery,
      };
      setTransportSummary(summary);
      setRecoverySummary(summary.recovery);
      recordLabAction({
        action: "automated_transport_baseline_imported_package",
        result: "ok",
        message: `Baseline imported the latest received package with status ${imported.importSummary.status}; ack eligible: ${imported.importSummary.ackEligible ? "yes" : "no"}.`,
        details: {
          sessionId: imported.importSummary.sessionId,
          packageId: imported.importSummary.packageId,
          packageHash: imported.importSummary.packageHash,
          ackEligible: imported.importSummary.ackEligible,
        },
      });

      if (imported.importSummary.sessionId !== baselineSessionId) {
        recordLabAction({
          action: "automated_transport_baseline_incomplete",
          result: "error",
          message:
            "Baseline import belonged to a stale session instead of the current staged plan. Export the debug bundle for analysis.",
          details: {
            expectedSessionId: baselineSessionId,
            expectedPlanHash: baselinePlanHash,
            importedSessionId: imported.importSummary.sessionId,
            packageId: imported.importSummary.packageId,
            packageHash: imported.importSummary.packageHash,
          },
        });
        return;
      }

      if (!imported.importSummary.ackEligible) {
        recordLabAction({
          action: "automated_transport_baseline_incomplete",
          result: "error",
          message:
            "Baseline import completed without ack eligibility. Export the debug bundle for analysis.",
          details: {
            status: imported.importSummary.status,
            sessionId: imported.importSummary.sessionId,
            packageId: imported.importSummary.packageId,
            packageHash: imported.importSummary.packageHash,
          },
        });
        return;
      }

      const acked = await sendAckForLatestImportedWatchPackage({
        db,
        participantId,
      });
      summary = {
        status: acked.status,
        recovery: acked.recovery,
      };
      setTransportSummary(summary);
      setRecoverySummary(summary.recovery);
      recordLabAction({
        action: "automated_transport_baseline_ack_sent",
        result: "ok",
        message: acked.message,
        details: {
          latestAckPackageId: acked.status.latestAck?.packageId,
          latestAckPackageHash: acked.status.latestAck?.packageHash,
          unresolvedCount: acked.recovery.unresolvedCount,
        },
      });

      try {
        summary = await requestWatchModeLabTransportStatus({
          db,
          participantId,
        });
        setTransportSummary(summary);
        setRecoverySummary(summary.recovery);
      } catch {
        // The ack send is the critical phone-side result; the follow-up status
        // refresh may fail if the Watch is not immediately reachable.
      }

      recordLabAction({
        action: "automated_transport_baseline_completed",
        result: "ok",
        message:
          "Completed the one-button baseline path through transport proof, package import, and ack send. Export the bundle for analysis.",
        details: {
          unresolvedCount: summary.recovery.unresolvedCount,
          latestAckPackageId: summary.status.latestAck?.packageId,
          latestAckAt: summary.status.latestAck?.ackedAt,
        },
      });
    } catch (error) {
      recordLabAction({
        action: "automated_transport_baseline_failed",
        result: "error",
        message:
          error instanceof Error
            ? error.message
            : "One-button synthetic transport baseline failed.",
      });
    } finally {
      setBusyLabel(null);
    }
  }

  async function resetCleanTransportBaselineState() {
    setBusyLabel("Resetting baseline...");

    try {
      const db = await getLocalDb();
      const summary = await resetWatchModeLabTransportBaselineState({
        db,
        participantId,
      });

      setPlanSummary(null);
      setImportSummary(null);
      setValidationSummary(null);
      setTransportSummary({
        status: summary.status,
        recovery: summary.recovery,
      });
      setRecoverySummary(summary.recovery);
      recordLabAction({
        action: "clean_transport_baseline_reset",
        result: "ok",
        message: summary.message,
        details: {
          localOnly: true,
          abandonedCount: summary.abandonedCount,
          unresolvedCount: summary.recovery.unresolvedCount,
          watchSideDiscardStillRequiredForColdStart: true,
        },
      });
    } catch (error) {
      recordLabAction({
        action: "clean_transport_baseline_reset",
        result: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not reset synthetic transport baseline state.",
      });
    } finally {
      setBusyLabel(null);
    }
  }

  function buildPlan(kind: WatchModeLabKind) {
    const plan = buildSyntheticWatchModeLabPlan({
      kind,
      participantId,
      selectedCueId: tlrOptions.selectedCueId,
      tlrOptions,
      engineSettings,
    });

    setPlanSummary(summarizeWatchModeLabPlan(plan));
    recordLabAction({
      action: `build_plan:${kind}`,
      result: "ok",
      message: `Built ${planTitle(kind)} locally. No transport message was sent.`,
      details: {
        sessionId: plan.sessionId,
        planHash: plan.planHash,
      },
    });
  }

  async function importFixture(kind: WatchModeLabKind, reimport = false) {
    setBusyLabel(reimport ? "Re-importing..." : "Importing...");

    try {
      const db = await getLocalDb();
      const result = await importSyntheticWatchModeLabPackage({
        db,
        kind,
        participantId,
      });

      setImportSummary(result);
      setValidationSummary(null);
      recordLabAction({
        action: `${reimport ? "reimport" : "import"}_fixture:${kind}`,
        result: "ok",
        message: `${reimport ? "Re-imported" : "Imported"} synthetic ${kind} package with status ${result.status}.`,
        details: {
          sessionId: result.sessionId,
          packageId: result.packageId,
          packageHash: result.packageHash,
          ackEligible: result.ackEligible,
        },
      });
      await reloadRecoveryState();
    } catch (error) {
      recordLabAction({
        action: `${reimport ? "reimport" : "import"}_fixture:${kind}`,
        result: "error",
        message:
          error instanceof Error ? error.message : "Synthetic package import failed.",
      });
    } finally {
      setBusyLabel(null);
    }
  }

  async function runRecoveryAction(action: WatchModeLabRecoveryAction) {
    setBusyLabel("Updating recovery...");

    try {
      const db = await getLocalDb();
      const result = await applyWatchModeLabRecoveryAction({
        db,
        participantId,
        action,
      });

      setRecoverySummary(result.recovery);
      recordLabAction({
        action: `recovery:${action}`,
        result: "ok",
        message: result.message,
        details: {
          unresolvedCount: result.recovery.unresolvedCount,
          startupRecovery: result.recovery.startupRecovery,
        },
      });
    } catch (error) {
      recordLabAction({
        action: `recovery:${action}`,
        result: "error",
        message: error instanceof Error ? error.message : "Recovery action failed.",
      });
    } finally {
      setBusyLabel(null);
    }
  }

  function validateCorruptPackage() {
    const result = validateCorruptSyntheticWatchModeLabPackage("tlr");
    const message =
      result.validationErrors.length > 0
        ? "Corrupt synthetic package was rejected before import."
        : "Unexpected: corrupt synthetic package passed validation.";

    setValidationSummary(result);
    recordLabAction({
      action: "validate_corrupt_package:tlr",
      result: result.validationErrors.length > 0 ? "ok" : "error",
      message,
      details: {
        packageId: result.packageId,
        validationErrors: result.validationErrors,
      },
    });
  }

  function clearStatus() {
    setPlanSummary(null);
    setImportSummary(null);
    setValidationSummary(null);
    recordLabAction({
      action: "clear_lab_status",
      result: "ok",
      message: "Cleared lab status. Local imported fixture rows were not deleted.",
    });
  }

  async function markPhoneReloadRecoveryTested() {
    setBusyLabel("Marking reload recovery...");

    try {
      const db = await getLocalDb();
      const summary = await loadWatchModeLabRecoverySummary({
        db,
        participantId,
      });

      setRecoverySummary(summary);
      recordLabAction({
        action: "phone_reload_recovery_tested",
        result: "ok",
        message:
          "Marked phone reload recovery tested from the current DB-backed recovery state.",
        details: {
          unresolvedCount: summary.unresolvedCount,
          startupRecovery: summary.startupRecovery,
          blocksFutureWatchStart: summary.blocksFutureWatchStart,
          sessionId: summary.states[0]?.sessionId,
          planHash: summary.states[0]?.planHash,
          packageId: summary.states[0]?.packageId,
          packageHash: summary.states[0]?.packageHash,
        },
      });
    } catch (error) {
      recordLabAction({
        action: "phone_reload_recovery_tested",
        result: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not mark phone reload recovery tested.",
      });
    } finally {
      setBusyLabel(null);
    }
  }

  async function copyDebugBundleFallback(
    json: string,
    fileUri?: string,
  ): Promise<string> {
    const Clipboard = await import("expo-clipboard");
    const clipboardValue = fileUri ? `${fileUri}\n\n${json}` : json;

    await Clipboard.setStringAsync(clipboardValue);

    return fileUri
      ? "Share sheet failed; copied the file URI and JSON to clipboard."
      : "Share sheet unavailable; copied the JSON to clipboard.";
  }

  async function exportDebugBundle(options?: {
    exportToFile?: boolean;
    skipShare?: boolean;
  }) {
    setBusyLabel("Exporting debug bundle...");
    setExportInfo(null);
    setExportError(null);

    try {
      const db = await getLocalDb();
      const latestTransportSummary = await loadWatchModeLabTransportSummary({
        db,
        participantId,
      });
      setTransportSummary(latestTransportSummary);
      setRecoverySummary(latestTransportSummary.recovery);
      const exportLogEntry: WatchModeLabActionLogEntry = {
        at: new Date().toISOString(),
        action: "export_debug_bundle",
        result: "ok",
        message: "Export Watch Lab debug bundle requested.",
      };
      const bundle = await createWatchModeLabDebugBundle({
        db,
        participantId,
        selectedMode,
        latestMessage: message,
        latestPlanSummary: planSummary,
        latestImportSummary: importSummary,
        latestValidationSummary: validationSummary,
        transportStatus: latestTransportSummary.status ?? transportSummary?.status,
        actionLog: [...actionLog, exportLogEntry],
      });
      const json = JSON.stringify(bundle, null, 2);
      const fileName = watchModeLabDebugBundleFileName(bundle.exportedAt);
      const shareMessage = `LucidTLR Watch Lab debug bundle\nexportedAt: ${bundle.exportedAt}`;
      let resultMessage = "";

      if (FileSystem.documentDirectory) {
        const exportDirectory = `${FileSystem.documentDirectory}lucidtlr-exports/`;
        const fileUri = `${exportDirectory}${fileName}`;
        const latestFileUri = `${FileSystem.documentDirectory}${WATCH_MODE_LAB_AUTOMATION_EXPORT_FILE_NAME}`;

        await FileSystem.makeDirectoryAsync(exportDirectory, {
          intermediates: true,
        });
        await FileSystem.writeAsStringAsync(fileUri, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (options?.exportToFile) {
          await FileSystem.writeAsStringAsync(latestFileUri, json, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        }

        if (options?.skipShare) {
          resultMessage = options.exportToFile
            ? `Saved ${fileName} and ${WATCH_MODE_LAB_AUTOMATION_EXPORT_FILE_NAME} locally.`
            : `Saved ${fileName} locally.`;
        } else {
          try {
            await Share.share({
              title: fileName,
              message: shareMessage,
              url: fileUri,
            });
            resultMessage = options?.exportToFile
              ? `Saved ${fileName} and ${WATCH_MODE_LAB_AUTOMATION_EXPORT_FILE_NAME} locally, then opened the share sheet.`
              : `Saved ${fileName} locally and opened the share sheet.`;
          } catch {
            resultMessage = await copyDebugBundleFallback(json, fileUri);
          }
        }
      } else {
        if (options?.skipShare) {
          resultMessage = "Document directory unavailable; debug bundle file was not written.";
        } else {
          try {
          await Share.share({
            title: fileName,
            message: `${shareMessage}\n\n${json}`,
          });
          resultMessage = `Opened share sheet for ${fileName}.`;
          } catch {
            resultMessage = await copyDebugBundleFallback(json);
          }
        }
      }

      setExportInfo(resultMessage);
      recordLabAction({
        action: "export_debug_bundle",
        result: "ok",
        message: "Exported Watch Lab debug bundle. Local export only; no upload.",
        details: {
          finalDrillStatus: bundle.summaries.finalDrillStatus,
          unresolvedCount: bundle.summaries.unresolvedCount,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Could not export Watch Lab debug bundle.";

      setExportError(errorMessage);
      recordLabAction({
        action: "export_debug_bundle",
        result: "error",
        message: errorMessage,
      });
    } finally {
      setBusyLabel(null);
    }
  }

  async function runImportAckAutomation() {
    setBusyLabel("Importing and acking...");

    try {
      const db = await getLocalDb();
      const imported = await importLatestReceivedSyntheticWatchPackage({
        db,
        participantId,
      });

      setImportSummary(imported.importSummary);
      setTransportSummary({
        status: imported.status,
        recovery: imported.recovery,
      });
      setRecoverySummary(imported.recovery);
      recordLabAction({
        action: "automation_import_ack_imported_package",
        result: "ok",
        message: `Automation imported package with status ${imported.importSummary.status}; ack eligible: ${imported.importSummary.ackEligible ? "yes" : "no"}.`,
        details: {
          sessionId: imported.importSummary.sessionId,
          packageId: imported.importSummary.packageId,
          packageHash: imported.importSummary.packageHash,
          ackEligible: imported.importSummary.ackEligible,
        },
      });

      const acked = await sendAckForLatestImportedWatchPackage({
        db,
        participantId,
      });

      setTransportSummary({
        status: acked.status,
        recovery: acked.recovery,
      });
      setRecoverySummary(acked.recovery);
      recordLabAction({
        action: "automation_import_ack_ack_sent",
        result: "ok",
        message: acked.message,
        details: {
          unresolvedCount: acked.recovery.unresolvedCount,
          latestAckPackageId: acked.status.latestAck?.packageId,
        },
      });
    } catch (error) {
      recordLabAction({
        action: "automation_import_ack_failed",
        result: "error",
        message:
          error instanceof Error
            ? error.message
            : "Automation import/ack failed.",
      });
    } finally {
      setBusyLabel(null);
    }
  }

  async function runDeepLinkAutomation() {
    if (!automationParams?.autorun) {
      return;
    }

    recordLabAction({
      action: "deep_link_automation_started",
      result: "ok",
      message: `Started deep-link automation: ${automationParams.autorun}.`,
      details: {
        autorun: automationParams.autorun,
        exportTo: automationParams.exportTo,
        runId: automationParams.runId,
      },
    });

    if (automationParams.autorun === "reset") {
      await resetCleanTransportBaselineState();
    } else if (automationParams.autorun === "baseline") {
      await runOneButtonTransportBaseline();
    } else if (automationParams.autorun === "import-ack") {
      await runImportAckAutomation();
    }

    if (automationParams.exportTo === "file") {
      await exportDebugBundle({
        exportToFile: true,
        skipShare: true,
      });
    }
  }

  React.useEffect(() => {
    if (!automationParams?.autorun) {
      return;
    }

    const runKey = [
      automationParams.autorun,
      automationParams.exportTo ?? "no-export",
      automationParams.runId ?? "no-run-id",
    ].join("|");

    if (automationRunRef.current === runKey) {
      return;
    }

    automationRunRef.current = runKey;
    void runDeepLinkAutomation();
  }, [automationParams?.autorun, automationParams?.exportTo, automationParams?.runId]);

  return (
    <Screen>
      <PrimaryPillButton
        icon={ArrowLeft}
        label="Back to Watch settings"
        onPress={() => router.replace("/settings/watch-mode")}
      />

      <SectionTitle>Watch Mode Lab</SectionTitle>

      <Card>
        <InfoRow label="lane" value={buildInfo.lane} />
        <InfoRow label="app version" value={buildInfo.version} />
        <InfoRow label="build" value={buildInfo.build} />
        <InfoRow label="scope" value="synthetic only" />
        <InfoRow label="QA label" value="Internal TestFlight Lab" />
        <InfoRow label="public Watch Mode" value="disabled" />
        <InfoRow label="real overnight Watch Mode" value="not available" />
        <InfoRow label="real Watch sensors" value="not used" />
        <InfoRow label="WatchConnectivity" value="synthetic lab transport only" />
        <InfoRow label="uploads" value="none" />
        <LabNote>
          Internal TestFlight Lab -- synthetic / QA only. This does not start an
          overnight Watch session, does not use real Watch sensors or
          live Watch cue timing, keeps data local, and does not upload anything.
        </LabNote>
      </Card>

      <Card>
        <InfoRow label="guided drill" value="synthetic transport checklist" />
        <InfoRow
          label="current step"
          value={
            guidedDrillActive
              ? `${guidedStepIndex + 1}/${GUIDED_TRANSPORT_DRILL_STEPS.length}`
              : "not started"
          }
        />
        <LabNote>
          Run Transport Drill keeps the TestFlight path ordered. Use the
          Transport section and Watch lab controls for proof; fixture import and
          recovery simulation controls are separate QA checks and do not prove
          WatchConnectivity.
        </LabNote>
        <View style={{ gap: 6 }}>
          {GUIDED_TRANSPORT_DRILL_STEPS.map((step, index) => (
            <Text
              key={step}
              selectable
              style={{
                color:
                  guidedDrillActive && index === guidedStepIndex
                    ? colors.textPrimary
                    : colors.textSecondary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              {`${index + 1}. ${step}`}
            </Text>
          ))}
        </View>
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={Watch}
          label={guidedDrillActive ? "Restart Transport Drill" : "Run Transport Drill"}
          onPress={startGuidedTransportDrill}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null || !guidedDrillActive}
          icon={CheckCircle2}
          label="Mark current guided step complete"
          onPress={markGuidedStepComplete}
        />
      </Card>

      <Card>
        <InfoRow label="baseline" value="one-button happy path" />
        <InfoRow
          label="interruption coverage"
          value="not included; use guided drill"
        />
        <LabNote>
          Run One-Button Baseline automates the normal phone-side path through
          transport activation, plan staging, Watch proof check, package import,
          and ack send. It pauses if Watch proof is missing; on Watch, tap Run
          Watch baseline loop, then tap this phone button again.
        </LabNote>
        <LabNote>
          This baseline is useful for clean TestFlight sanity checks, but it
          does not replace force-quit, background, lock, delayed delivery, or
          unreachable interruption testing.
        </LabNote>
        <LabNote>
          Reset Clean Phone Baseline marks unresolved phone-side synthetic
          transport rows abandoned_local_only only while they are still early
          staging/running states. Package-bearing states are preserved so they
          can still be imported and acked. For a true cold start, also tap
          Discard Watch transport/session state on the Watch lab if the Watch
          still shows an active/unacked synthetic session.
        </LabNote>
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={ShieldAlert}
          label="Reset Clean Phone Baseline"
          onPress={() => {
            void resetCleanTransportBaselineState();
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={CheckCircle2}
          label="Run One-Button Baseline"
          onPress={() => {
            void runOneButtonTransportBaseline();
          }}
        />
      </Card>

      <Card>
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={FileJson}
          label="Build synthetic TLR plan"
          onPress={() => buildPlan("tlr")}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={FileJson}
          label="Build synthetic sleep log plan"
          onPress={() => buildPlan("sleep_log")}
        />
        {planSummary ? (
          <View style={{ gap: 8 }}>
            <InfoRow label="schema" value={planSummary.schemaVersion} />
            <InfoRow label="session" value={planSummary.sessionId} />
            <InfoRow label="plan hash" value={planSummary.planHash.slice(0, 24)} />
            <InfoRow label="cue" value={planSummary.selectedCueId} />
            <InfoRow label="output" value={planSummary.cueOutputMode} />
            <InfoRow
              label="epoch seconds"
              value={String(planSummary.epochSeconds)}
            />
            <InfoRow
              label="cueing"
              value={planSummary.cueingEnabled ? "enabled" : "disabled"}
            />
          </View>
        ) : null}
      </Card>

      <Card>
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={Watch}
          label={busyLabel ?? "Import synthetic TLR package"}
          onPress={() => {
            void importFixture("tlr");
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={Watch}
          label="Import synthetic sleep log package"
          onPress={() => {
            void importFixture("sleep_log");
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={RefreshCw}
          label="Re-import synthetic TLR package"
          onPress={() => {
            void importFixture("tlr", true);
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={ShieldAlert}
          label="Validate corrupt package"
          onPress={validateCorruptPackage}
        />
        {importSummary ? (
          <View style={{ gap: 8 }}>
            <InfoRow label="import status" value={importSummary.status} />
            <InfoRow
              label="ack eligible"
              value={importSummary.ackEligible ? "yes" : "no"}
            />
            <InfoRow label="package" value={importSummary.packageId} />
            <InfoRow
              label="package hash"
              value={importSummary.packageHash.slice(0, 24)}
            />
            <InfoRow label="session" value={importSummary.sessionId} />
            <InfoRow label="records" value={resultCounts(importSummary)} />
          </View>
        ) : null}
        {validationSummary ? (
          <View style={{ gap: 8 }}>
            <InfoRow label="corrupt package" value={validationSummary.packageId} />
            <InfoRow
              label="validation"
              value={
                validationSummary.validationErrors.length > 0
                  ? "rejected"
                  : "passed"
              }
            />
            <LabNote>
              {validationSummary.validationErrors[0] ?? "No validation error."}
            </LabNote>
          </View>
        ) : null}
      </Card>

      <Card>
        <InfoRow label="transport" value="synthetic only" />
        <InfoRow
          label="WC activation"
          value={transportSummary?.status.activationState ?? "not loaded"}
        />
        <InfoRow
          label="paired"
          value={transportSummary?.status.paired ? "yes" : "no"}
        />
        <InfoRow
          label="watch app"
          value={transportSummary?.status.watchAppInstalled ? "installed" : "unknown/not installed"}
        />
        <InfoRow
          label="reachable"
          value={
            transportSummary?.status.reachable
              ? "yes -- informational only"
              : "no -- informational only"
          }
        />
        <InfoRow
          label="last message"
          value={transportSummary?.status.lastMessageType ?? "none"}
        />
        <InfoRow
          label="last message at"
          value={transportSummary?.status.lastMessageAt ?? "none"}
        />
        <InfoRow
          label="staged plan"
          value={transportSummary?.status.latestStagedPlanId ?? "none"}
        />
        <InfoRow
          label="commit receipt"
          value={
            transportSummary?.status.latestCommitReceipt?.sessionId ?? "none"
          }
        />
        <InfoRow
          label="status snapshot"
          value={
            transportSummary?.status.latestStatusSnapshot?.watchState ?? "none"
          }
        />
        <InfoRow
          label="package manifest"
          value={
            transportSummary?.status.latestPackageManifest?.packageId ?? "none"
          }
        />
        <InfoRow
          label="latest package"
          value={
            transportSummary?.status.latestReceivedPackage?.packageId ?? "none"
          }
        />
        <InfoRow
          label="latest package file"
          value={packageFilePersistenceLabel(
            transportSummary?.status.latestPackageFile ??
              transportSummary?.status.latestReceivedPackage,
          )}
        />
        <InfoRow
          label="package hash check"
          value={
            transportSummary?.status.latestReceivedPackage?.hashVerification ??
            transportSummary?.status.latestPackageFile?.hashVerification ??
            "none"
          }
        />
        <InfoRow
          label="phone dupes ignored"
          value={`${transportSummary?.status.duplicateIgnoredCount ?? 0}`}
        />
        <InfoRow
          label="watch stale ignored"
          value={
            transportSummary?.status.latestStatusSnapshot
              ?.watchStaleIgnoredSummary ?? "none"
          }
        />
        <InfoRow
          label="package transfer stage"
          value={
            transportSummary?.status.latestPackageTransfer?.stage ??
            transportSummary?.status.latestStatusSnapshot?.packageTransfer
              ?.stage ??
            "none"
          }
        />
        <InfoRow
          label="package transfer bytes"
          value={packageTransferBytesLabel(
            transportSummary?.status.latestPackageTransfer ??
              transportSummary?.status.latestStatusSnapshot?.packageTransfer,
          )}
        />
        <InfoRow
          label="package transfer outstanding"
          value={packageTransferOutstandingLabel(
            transportSummary?.status.latestPackageTransfer ??
              transportSummary?.status.latestStatusSnapshot?.packageTransfer,
          )}
        />
        <InfoRow
          label="package transfer error"
          value={
            transportSummary?.status.latestPackageFile?.errorMessage ??
            transportSummary?.status.latestPackageTransfer?.errorMessage ??
            transportSummary?.status.latestStatusSnapshot?.packageTransfer
              ?.errorMessage ??
            transportSummary?.status.lastError ??
            "none"
          }
        />
        <InfoRow
          label="latest ack"
          value={transportSummary?.status.latestAck?.packageId ?? "none"}
        />
        <LabNote>
          Transport -- synthetic only. `isReachable` is display-only and is not
          treated as proof that Watch Mode is running. Phone reload recovery
          still comes from the durable local DB ledger.
        </LabNote>
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={Watch}
          label="Activate transport"
          onPress={() => {
            void runTransportAction("Activating transport...", async () => {
              const db = await getLocalDb();
              const summary = await activateWatchModeLabTransport({
                db,
                participantId,
              });

              setTransportSummary(summary);
              setRecoverySummary(summary.recovery);
              return "Activated synthetic WatchConnectivity transport.";
            });
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={FileJson}
          label="Stage synthetic TLR plan"
          onPress={() => {
            void runTransportAction("Staging TLR plan...", async () => {
              const db = await getLocalDb();
              const summary = await stageSyntheticWatchModeTransportPlan({
                db,
                kind: "tlr",
                participantId,
                selectedCueId: tlrOptions.selectedCueId,
                tlrOptions,
                engineSettings,
              });

              setPlanSummary(summary.plan);
              setTransportSummary({
                status: summary.status,
                recovery: summary.recovery,
              });
              setRecoverySummary(summary.recovery);
              return "Queued synthetic TLR plan over WatchConnectivity and marked plan_staged in the local ledger.";
            });
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={FileJson}
          label="Stage synthetic sleep-log plan"
          onPress={() => {
            void runTransportAction("Staging sleep-log plan...", async () => {
              const db = await getLocalDb();
              const summary = await stageSyntheticWatchModeTransportPlan({
                db,
                kind: "sleep_log",
                participantId,
                selectedCueId: tlrOptions.selectedCueId,
                tlrOptions,
                engineSettings,
              });

              setPlanSummary(summary.plan);
              setTransportSummary({
                status: summary.status,
                recovery: summary.recovery,
              });
              setRecoverySummary(summary.recovery);
              return "Queued synthetic sleep-log plan over WatchConnectivity and marked plan_staged in the local ledger.";
            });
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={RefreshCw}
          label="Request Watch status"
          onPress={() => {
            void runTransportAction("Requesting Watch status...", async () => {
              const db = await getLocalDb();
              const summary = await requestWatchModeLabTransportStatus({
                db,
                participantId,
              });

              setTransportSummary(summary);
              setRecoverySummary(summary.recovery);
              return "Queued a synthetic Watch status request. Watch status remains last-known until a snapshot is received.";
            });
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={Watch}
          label="Import latest received synthetic package"
          onPress={() => {
            void runTransportAction("Importing received package...", async () => {
              const db = await getLocalDb();
              const summary = await importLatestReceivedSyntheticWatchPackage({
                db,
                participantId,
              });

              setImportSummary(summary.importSummary);
              setTransportSummary({
                status: summary.status,
                recovery: summary.recovery,
              });
              setRecoverySummary(summary.recovery);
              return `Imported latest received synthetic package with status ${summary.importSummary.status}; ack eligible: ${summary.importSummary.ackEligible ? "yes" : "no"}.`;
            });
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={CheckCircle2}
          label="Send ack for latest imported package"
          onPress={() => {
            void runTransportAction("Sending ack...", async () => {
              const db = await getLocalDb();
              const summary = await sendAckForLatestImportedWatchPackage({
                db,
                participantId,
              });

              setTransportSummary({
                status: summary.status,
                recovery: summary.recovery,
              });
              setRecoverySummary(summary.recovery);
              return summary.message;
            });
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={RefreshCw}
          label="Simulate phone reload / reload recovery state"
          onPress={() => {
            void runTransportAction("Reloading recovery...", async () => {
              const db = await getLocalDb();
              const summary = await applyWatchTransportReceiptSnapshots({
                db,
                participantId,
              });

              setTransportSummary(summary);
              setRecoverySummary(summary.recovery);
              return "Reloaded phone recovery from DB and applied latest synthetic transport receipt snapshots.";
            });
          }}
        />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={ShieldAlert}
          label="Clear lab transport messages/status"
          onPress={() => {
            void runTransportAction("Clearing transport...", async () => {
              const db = await getLocalDb();
              const summary = await clearWatchModeLabTransportStatus({
                db,
                participantId,
              });

              setTransportSummary(summary);
              setRecoverySummary(summary.recovery);
              return "Cleared synthetic transport messages/status only. Durable recovery ledger and imports were not deleted.";
            });
          }}
        />
      </Card>

      <Card>
        <InfoRow label="recovery state" value="synthetic only" />
        <InfoRow
          label="startup recovery"
          value={recoverySummary?.startupRecovery ?? "not loaded"}
        />
        <InfoRow
          label="unresolved states"
          value={String(recoverySummary?.unresolvedCount ?? 0)}
        />
        <InfoRow
          label="future Watch start"
          value={
            recoverySummary?.blocksFutureWatchStart
              ? "blocked by unresolved state"
              : "not blocked"
          }
        />
        <LabNote>
          Recovery state -- synthetic only. These actions model durable mailbox
          state after app reload; they do not start transport, sensors, haptics,
          audio, or public Watch Mode. They are not part of the guided
          transport proof path.
        </LabNote>
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={CheckCircle2}
          label="Mark phone reload recovery tested"
          onPress={() => {
            void markPhoneReloadRecoveryTested();
          }}
        />
        {(
          [
            "watch_committed",
            "watch_running_last_known",
            "watch_sealed_waiting_import",
            "phone_import_success_ack_eligible",
            "ack_recorded",
            "abandon_local_only",
            "reload",
          ] satisfies WatchModeLabRecoveryAction[]
        ).map((action) => (
          <PrimaryPillButton
            key={action}
            disabled={busyLabel !== null}
            icon={action === "reload" ? RefreshCw : ShieldAlert}
            label={recoveryActionLabel(action)}
            onPress={() => {
              void runRecoveryAction(action);
            }}
          />
        ))}
        {recoverySummary?.states.map((state) => (
          <View key={state.sessionId} style={{ gap: 8 }}>
            <InfoRow label="session" value={state.sessionId} />
            <InfoRow label="status" value={state.status} />
            <InfoRow
              label="watch state"
              value={state.lastKnownWatchState ?? "unknown"}
            />
            <InfoRow
              label="package"
              value={state.packageId ?? "not sealed"}
            />
            <InfoRow
              label="package hash"
              value={state.packageHash?.slice(0, 24) ?? "not sealed"}
            />
          </View>
        ))}
      </Card>

      <Card>
        <InfoRow label="debug export" value="Local export only" />
        <InfoRow label="upload" value="No upload" />
        <InfoRow label="content" value="Excludes dream journal content" />
        <InfoRow label="scope" value="Synthetic/internal lab only" />
        <LabNote>
          Includes lab action timeline, transport messages, sync-state
          transitions, package/import/ack summaries, and pass/fail hints. No
          uploads.
        </LabNote>
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={Share2}
          label={
            busyLabel === "Exporting debug bundle..."
              ? busyLabel
              : "Export Watch Lab Debug Bundle"
          }
          onPress={() => {
            void exportDebugBundle();
          }}
        />
        {exportInfo ? <LabNote>{exportInfo}</LabNote> : null}
        {exportError ? <LabNote>{exportError}</LabNote> : null}
      </Card>

      <Card>
        <InfoRow label="latest lab status" value={message} />
        <PrimaryPillButton
          disabled={busyLabel !== null}
          icon={CheckCircle2}
          label="Clear lab status"
          onPress={clearStatus}
        />
        <LabNote>
          Fixture imports may create local synthetic Watch session rows with
          deterministic fixture IDs. This lab does not clear user app data.
        </LabNote>
      </Card>
    </Screen>
  );
}
