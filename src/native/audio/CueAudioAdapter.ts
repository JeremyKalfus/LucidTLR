export interface CueAudioAdapter {
  preloadCue(cueId: string): Promise<void>;
  playCue(options: { cueId: string; volumeLevel: number }): Promise<void>;
  stopCue(): Promise<void>;
}
