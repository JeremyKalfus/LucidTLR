import {
  WATCH_RUNTIME_PLAN_SCHEMA_VERSION,
  type WatchRuntimePlanV3,
} from "./WatchRuntimePlan";
import { hashWatchRuntimePayload } from "./watchRuntimeHashes";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function hashWatchRuntimePlan(plan: WatchRuntimePlanV3): string {
  return hashWatchRuntimePayload(plan, ["planHash"]);
}

export function withWatchRuntimePlanHash(
  plan: Omit<WatchRuntimePlanV3, "planHash"> & { planHash?: string },
): WatchRuntimePlanV3 {
  const nextPlan = {
    ...plan,
    planHash: "",
  } satisfies WatchRuntimePlanV3;

  return {
    ...nextPlan,
    planHash: hashWatchRuntimePlan(nextPlan),
  };
}

export function validateWatchRuntimePlan(plan: WatchRuntimePlanV3): string[] {
  const errors: string[] = [];

  if (plan.schemaVersion !== WATCH_RUNTIME_PLAN_SCHEMA_VERSION) {
    errors.push("Watch plan schemaVersion must be watch-runtime-plan-v3.");
  }

  if (plan.mode !== "watch") {
    errors.push("Watch runtime plan mode must be watch.");
  }

  if (plan.sessionType !== "tlr" && plan.sessionType !== "sleep_log") {
    errors.push("Watch runtime plan sessionType must be tlr or sleep_log.");
  }

  if (plan.planHash !== hashWatchRuntimePlan(plan)) {
    errors.push("Watch runtime planHash does not match plan contents.");
  }

  if (plan.sessionType === "tlr" && !plan.cueOutput.hapticEnabled && !plan.cueOutput.audioEnabled) {
    errors.push("TLR Watch plans require haptic or audio cue output.");
  }

  if (plan.cueOutput.audioEnabled && !plan.cueOutput.audioRequiresPreflight) {
    errors.push("Audio-enabled Watch plans require same-night audio preflight.");
  }

  if (plan.cueOutput.audioEnabled && !plan.cueOutput.preflightRequired) {
    errors.push("Audio-enabled Watch plans require cue output preflight.");
  }

  if (!plan.safety.requireLowPowerModeOff) {
    errors.push("Watch plans must block start when Low Power Mode is on.");
  }

  if (
    !plan.safety.requireWorkoutSession ||
    !plan.safety.requireHealthKitAuthorization ||
    !plan.safety.requireMotion
  ) {
    errors.push("Watch plans must require workout, HealthKit, and motion availability.");
  }

  if (!SHA256_PATTERN.test(plan.cue.sha256)) {
    errors.push("Watch plans must include the cue asset sha256.");
  }

  if (
    !plan.assets.some(
      (asset) =>
        asset.id === plan.cue.assetId &&
        asset.sha256 === plan.cue.sha256 &&
        asset.owner === "watch",
    )
  ) {
    errors.push("Watch plan cue asset must be present in the required asset list.");
  }

  if (
    plan.training.enabled &&
    (!SHA256_PATTERN.test(plan.training.sha256) ||
      !plan.assets.some(
        (asset) =>
          asset.kind === "training" &&
          asset.owner === "phone" &&
          asset.sha256 === plan.training.sha256,
      ))
  ) {
    errors.push("Enabled Watch training requires phone-owned training asset metadata.");
  }

  if (
    plan.safety.lowBatteryWarningLevel <= plan.safety.minimumStartBatteryLevel
  ) {
    errors.push("Watch low battery warning level must be above the start minimum.");
  }

  if (!plan.model.modelVersion || !plan.remModelVersion) {
    errors.push("Watch plans must include explicit REM model versions.");
  }

  if (plan.epoching.epochSeconds !== 30) {
    errors.push("Watch plans must use 30-second epochs.");
  }

  if (plan.epoching.rawMotionPersistence !== false) {
    errors.push("Watch plans must not persist raw high-rate motion by default.");
  }

  if (plan.sessionType === "sleep_log") {
    if (plan.cueOutput.hapticEnabled || plan.cueOutput.audioEnabled || plan.tlrInterval.enabled) {
      errors.push("Sleep log Watch plans must keep cue delivery disabled.");
    }
  }

  if (
    !plan.privacy.noGps ||
    !plan.privacy.noSensorKit ||
    !plan.privacy.noLiveAppleSleepStages ||
    !plan.privacy.noSpO2 ||
    !plan.privacy.noRespiratoryRate ||
    !plan.privacy.noWristTemperature
  ) {
    errors.push("Watch plans must preserve the v3 privacy exclusions.");
  }

  if (
    plan.assets.some(
      (asset) =>
        !asset.id ||
        !asset.fileName ||
        (asset.owner !== "watch" && asset.owner !== "phone") ||
        asset.byteLength <= 0 ||
        !SHA256_PATTERN.test(asset.sha256),
    )
  ) {
    errors.push("Watch plan required assets must include id, owner, filename, byteLength, and sha256.");
  }

  return errors;
}

export function assertValidWatchRuntimePlan(plan: WatchRuntimePlanV3): void {
  const errors = validateWatchRuntimePlan(plan);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}
