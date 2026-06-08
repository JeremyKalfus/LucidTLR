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
import {
  activateWatchModeLabTransport,
  applyWatchTransportReceiptSnapshots,
  clearWatchModeLabTransportStatus,
  importLatestReceivedSyntheticWatchPackage,
  loadWatchModeLabTransportSummary,
  requestWatchModeLabTransportStatus,
  sendAckForLatestImportedWatchPackage,
  stageSyntheticWatchModeTransportPlan,
  type WatchModeLabTransportSummary,
} from "@/src/features/watchModeLab/watchModeTransportLab";
import {
  internalLabBuildInfo,
  isWatchModeLabAvailable,
} from "@/src/features/internalBuild/internalBuildFlags";
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

export function WatchModeLabScreen() {
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

  async function exportDebugBundle() {
    setBusyLabel("Exporting debug bundle...");
    setExportInfo(null);
    setExportError(null);

    try {
      const db = await getLocalDb();
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
        transportStatus: transportSummary?.status,
        actionLog: [...actionLog, exportLogEntry],
      });
      const json = JSON.stringify(bundle, null, 2);
      const fileName = watchModeLabDebugBundleFileName(bundle.exportedAt);
      const shareMessage = `LucidTLR Watch Lab debug bundle\nexportedAt: ${bundle.exportedAt}`;
      let resultMessage = "";

      if (FileSystem.documentDirectory) {
        const exportDirectory = `${FileSystem.documentDirectory}lucidtlr-exports/`;
        const fileUri = `${exportDirectory}${fileName}`;

        await FileSystem.makeDirectoryAsync(exportDirectory, {
          intermediates: true,
        });
        await FileSystem.writeAsStringAsync(fileUri, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        try {
          await Share.share({
            title: fileName,
            message: shareMessage,
            url: fileUri,
          });
          resultMessage = `Saved ${fileName} locally and opened the share sheet.`;
        } catch {
          resultMessage = await copyDebugBundleFallback(json, fileUri);
        }
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
          audio, or public Watch Mode.
        </LabNote>
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
          Export a local JSON bundle after the TestFlight transport drill so
          Codex can inspect transport status, DB-backed recovery state, package
          import status, ack eligibility, and idempotency hints.
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
