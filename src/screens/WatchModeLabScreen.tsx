import { Redirect, router } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  FileJson,
  RefreshCw,
  ShieldAlert,
  Watch,
} from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

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
  importSyntheticWatchModeLabPackage,
  summarizeWatchModeLabPlan,
  validateCorruptSyntheticWatchModeLabPackage,
  type WatchModeLabKind,
  type WatchModeLabPackageImportSummary,
  type WatchModeLabPackageValidationSummary,
  type WatchModeLabPlanSummary,
} from "@/src/features/watchModeLab/watchModeLab";
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

export function WatchModeLabScreen() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  const { engineSettings, participantId, tlrOptions } = useAppState();
  const [planSummary, setPlanSummary] =
    React.useState<WatchModeLabPlanSummary | null>(null);
  const [importSummary, setImportSummary] =
    React.useState<WatchModeLabPackageImportSummary | null>(null);
  const [validationSummary, setValidationSummary] =
    React.useState<WatchModeLabPackageValidationSummary | null>(null);
  const [busyLabel, setBusyLabel] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string>(
    "Watch Mode Lab -- synthetic only. Public Watch Mode remains disabled.",
  );

  function buildPlan(kind: WatchModeLabKind) {
    const plan = buildSyntheticWatchModeLabPlan({
      kind,
      participantId,
      selectedCueId: tlrOptions.selectedCueId,
      tlrOptions,
      engineSettings,
    });

    setPlanSummary(summarizeWatchModeLabPlan(plan));
    setMessage(`Built ${planTitle(kind)}. No native bridge was used.`);
  }

  async function importFixture(kind: WatchModeLabKind, reimport = false) {
    setBusyLabel(reimport ? "Re-importing..." : "Importing...");

    try {
      const db = await getLocalDb();
      const result = await importSyntheticWatchModeLabPackage({ db, kind });

      setImportSummary(result);
      setValidationSummary(null);
      setMessage(
        `${reimport ? "Re-imported" : "Imported"} synthetic ${kind} package with status ${result.status}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Synthetic package import failed.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  function validateCorruptPackage() {
    const result = validateCorruptSyntheticWatchModeLabPackage("tlr");

    setValidationSummary(result);
    setMessage(
      result.validationErrors.length > 0
        ? "Corrupt synthetic package was rejected before import."
        : "Unexpected: corrupt synthetic package passed validation.",
    );
  }

  function clearStatus() {
    setPlanSummary(null);
    setImportSummary(null);
    setValidationSummary(null);
    setMessage("Cleared lab status. Local imported fixture rows were not deleted.");
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
        <InfoRow label="scope" value="synthetic only" />
        <InfoRow label="public Watch Mode" value="disabled" />
        <InfoRow label="real Watch sensors" value="not used" />
        <InfoRow label="WatchConnectivity" value="not used" />
        <InfoRow label="uploads" value="none" />
        <LabNote>
          Watch Mode Lab -- synthetic only. This does not start an overnight
          Watch session, does not use real Watch sensors or WatchConnectivity,
          keeps data local, and does not upload anything.
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
