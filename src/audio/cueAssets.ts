import { normalizeCueId } from "./cueCatalog";

export function getCueAppAsset(cueId: unknown): number {
  switch (normalizeCueId(cueId)) {
    case "clear-bell-chime":
      return require("../../assets/audio/cues/clear-bell-chime.mp3");
    case "ui-success-chime":
      return require("../../assets/audio/cues/ui-success-chime.mp3");
    case "sci-fi-confirmation":
      return require("../../assets/audio/cues/sci-fi-confirmation.wav");
    case "harp-flourish":
      return require("../../assets/audio/cues/harp-flourish.mp3");
    case "dx-harp-c5":
      return require("../../assets/audio/cues/dx-harp-c5.mp3");
  }
}
