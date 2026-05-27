export interface MotionAdapter {
  startMonitoring(sessionId: string): Promise<void>;
  stopMonitoring(): Promise<void>;
  getCurrentMotionState(): Promise<{
    isMoving: boolean;
    intensity: number;
    source: "phone" | "watch";
  }>;
}
