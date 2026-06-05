import { NativeModules, Platform } from "react-native";

import {
  createPhoneRuntimeClient,
  type NativePhoneRuntimeModule,
} from "./phoneRuntimeClient";

const nativeModule = NativeModules.LucidTLRPhoneRuntime as
  | NativePhoneRuntimeModule
  | undefined;

export const phoneRuntime = createPhoneRuntimeClient({
  platform: Platform.OS,
  nativeModule,
});

export function isPhoneRuntimeAvailable(): boolean {
  return phoneRuntime.isAvailable();
}
