import type { AppMode } from "@/src/domain/types";

export function runtimeStartLoadingLabel(mode: AppMode): string {
  return mode === "watch"
    ? "Preparing Watch Night..."
    : "Starting Phone Runtime...";
}

export function nativeRuntimeStartButtonLabel(input: {
  mode: AppMode;
  isStarting: boolean;
}): string {
  if (input.isStarting) {
    return runtimeStartLoadingLabel(input.mode);
  }

  return input.mode === "watch"
    ? "Prepare Watch Night"
    : "Start Native Phone Runtime";
}
