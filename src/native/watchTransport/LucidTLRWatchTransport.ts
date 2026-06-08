import { NativeModules, Platform } from "react-native";

import type { NativeWatchTransportModule } from "./NativeWatchTransportTypes";
import { createWatchTransportClient } from "./watchTransportClient";

const nativeModule = NativeModules.LucidTLRWatchTransport as
  | NativeWatchTransportModule
  | undefined;

export const watchTransport = createWatchTransportClient({
  platform: Platform.OS,
  nativeModule,
});

export function isWatchTransportAvailable(): boolean {
  return watchTransport.isAvailable();
}
