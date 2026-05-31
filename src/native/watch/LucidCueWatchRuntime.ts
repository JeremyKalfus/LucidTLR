import { NativeModules, Platform } from "react-native";

import {
  createWatchRuntimeClient,
  type NativeWatchRuntimeModule,
} from "./watchRuntimeClient";

const nativeModule = NativeModules.LucidCueWatchRuntime as
  | NativeWatchRuntimeModule
  | undefined;

export const watchRuntime = createWatchRuntimeClient({
  platform: Platform.OS,
  nativeModule,
});

export function isWatchRuntimeAvailable(): boolean {
  return watchRuntime.isAvailable();
}
