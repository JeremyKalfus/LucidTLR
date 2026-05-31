import type { NativeWatchSessionPlan, WatchRuntimeStatus } from "./WatchModeTypes";

export interface WatchSensorAdapter {
  isWatchAvailable(): Promise<boolean>;
  startEpochStream(sessionId: string): Promise<void>;
  stopEpochStream(): Promise<void>;
  startWatchSession?(plan: NativeWatchSessionPlan): Promise<void>;
  stopWatchSession?(reason?: string): Promise<void>;
  getWatchRuntimeStatus?(): Promise<WatchRuntimeStatus>;
}
