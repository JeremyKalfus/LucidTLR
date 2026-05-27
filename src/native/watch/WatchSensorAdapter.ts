export interface WatchSensorAdapter {
  isWatchAvailable(): Promise<boolean>;
  startEpochStream(sessionId: string): Promise<void>;
  stopEpochStream(): Promise<void>;
}
