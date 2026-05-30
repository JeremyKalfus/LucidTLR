import type { NightSession, TlrOptions } from "@/src/domain/types";
import type { CueDecisionSettings } from "@/src/engine";

import {
  NATIVE_PHONE_POLICY_VERSION,
  type NativePhoneSessionPlan,
  validateNativePhoneSessionPlan,
} from "./NativePhoneSessionPlan";
import { buildNativePhoneSessionPlanFromCompletedSession } from "./buildNativePhoneSessionPlan";

export const DEV_KITCHEN_SINK_DURATION_SECONDS = 10 * 60;
const DEV_KITCHEN_SINK_CUE_START_OFFSET_SECONDS = 20;
const DEV_KITCHEN_SINK_CUE_END_BUFFER_SECONDS = 20;

export type BuildDevKitchenSinkPhoneSessionPlanInput = {
  session: NightSession;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
  now?: string;
};

function addSeconds(isoDate: string, seconds: number): string {
  return new Date(Date.parse(isoDate) + seconds * 1000).toISOString();
}

export function buildDevKitchenSinkPhoneSessionPlan(
  input: BuildDevKitchenSinkPhoneSessionPlanInput,
): NativePhoneSessionPlan {
  const now = input.now ?? new Date().toISOString();
  const cueWindowStart = addSeconds(
    now,
    DEV_KITCHEN_SINK_CUE_START_OFFSET_SECONDS,
  );
  const cueWindowEnd = addSeconds(
    now,
    DEV_KITCHEN_SINK_DURATION_SECONDS -
      DEV_KITCHEN_SINK_CUE_END_BUFFER_SECONDS,
  );
  const stopAt = addSeconds(now, DEV_KITCHEN_SINK_DURATION_SECONDS);
  const plan = buildNativePhoneSessionPlanFromCompletedSession({
    session: input.session,
    settings: {
      ...input.settings,
      phoneAudioBedVolume: Math.max(input.settings.phoneAudioBedVolume, 0.03),
    },
    tlrOptions: input.tlrOptions,
  });
  const kitchenSinkPlan: NativePhoneSessionPlan = {
    ...plan,
    nativePolicyVersion: `${NATIVE_PHONE_POLICY_VERSION}-dev-kitchen-sink-10m`,
    audioBed: {
      ...plan.audioBed,
      volume: Math.max(plan.audioBed.volume, 0.03),
    },
    timing: {
      earliestCueAt: cueWindowStart,
      latestCueAt: cueWindowEnd,
      predictedRemWindows: [
        {
          startAt: cueWindowStart,
          endAt: cueWindowEnd,
          confidence: 1,
          source: "historical_sleep",
        },
      ],
      cueIntervalRangeSeconds: [20, 30],
    },
    budget: {
      ...plan.budget,
      maxCuesTonight: Math.max(6, Math.min(plan.budget.maxCuesTonight, 8)),
      maxCuesPerBlock: Math.max(3, Math.min(plan.budget.maxCuesPerBlock, 4)),
      maxBlockDurationMinutes: 10,
      minRestBetweenBlocksMinutes: 1,
    },
    pauses: {
      ...plan.pauses,
      minimumSecondsSinceLastCue: Math.min(
        plan.pauses.minimumSecondsSinceLastCue,
        30,
      ),
    },
    safety: {
      ...plan.safety,
      stopAt,
    },
    alarm: {
      ...plan.alarm,
      enabled: false,
      fireAt: undefined,
      autoShutoff: false,
      ringDurationSeconds: undefined,
    },
  };
  const errors = validateNativePhoneSessionPlan(kitchenSinkPlan);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  return kitchenSinkPlan;
}
