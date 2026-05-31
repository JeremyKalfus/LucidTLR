export const MAX_BUILT_IN_CUE_DURATION_SECONDS = 3;
export const DEFAULT_CUE_ID = "harp-flourish";

export type BuiltInCueId =
  | "clear-bell-chime"
  | "ui-success-chime"
  | "sci-fi-confirmation"
  | "harp-flourish"
  | "dx-harp-c5";

export type BuiltInCue = {
  id: BuiltInCueId;
  label: string;
  sourceFileName: string;
  nativeResourceName: string;
  nativeResourceExtension: "mp3" | "wav";
  durationSeconds: number;
};

export const builtInCues = [
  {
    id: "clear-bell-chime",
    label: "Clear bell chime",
    sourceFileName: "universfield-clear-bell-chime-487898.mp3",
    nativeResourceName: "clear_bell_chime",
    nativeResourceExtension: "mp3",
    durationSeconds: 1.959184,
  },
  {
    id: "ui-success-chime",
    label: "UI success chime",
    sourceFileName: "soundshelfstudio-ui-success-chime-513565.mp3",
    nativeResourceName: "ui_success_chime",
    nativeResourceExtension: "mp3",
    durationSeconds: 0.613016,
  },
  {
    id: "sci-fi-confirmation",
    label: "Sci-fi confirmation",
    sourceFileName: "mixkit-sci-fi-confirmation-914.wav",
    nativeResourceName: "sci_fi_confirmation",
    nativeResourceExtension: "wav",
    durationSeconds: 0.874807,
  },
  {
    id: "harp-flourish",
    label: "Harp flourish",
    sourceFileName: "freesound_community-harp-flourish-6251.mp3",
    nativeResourceName: "harp_flourish",
    nativeResourceExtension: "mp3",
    durationSeconds: 2.48975,
  },
  {
    id: "dx-harp-c5",
    label: "DX harp C5",
    sourceFileName: "freesound_community-dx-harp-c5-37447.mp3",
    nativeResourceName: "dx_harp_c5",
    nativeResourceExtension: "mp3",
    durationSeconds: 1.679025,
  },
] as const satisfies readonly BuiltInCue[];

export function isBuiltInCueId(value: unknown): value is BuiltInCueId {
  return (
    typeof value === "string" &&
    builtInCues.some((cue) => cue.id === value)
  );
}

export function normalizeCueId(value: unknown): BuiltInCueId {
  return isBuiltInCueId(value) ? value : DEFAULT_CUE_ID;
}

export function getBuiltInCue(cueId: unknown): BuiltInCue {
  const normalizedCueId = normalizeCueId(cueId);

  return (
    builtInCues.find((cue) => cue.id === normalizedCueId) ??
    builtInCues.find((cue) => cue.id === DEFAULT_CUE_ID) ??
    builtInCues[0]
  );
}
