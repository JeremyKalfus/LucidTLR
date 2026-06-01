export function elapsedSecondsSince(
  startedAt: string | undefined,
  nowMs: number,
  pausedDurationMs = 0,
): number {
  if (!startedAt) {
    return 0;
  }

  const startedAtMs = Date.parse(startedAt);

  if (Number.isNaN(startedAtMs)) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((nowMs - pausedDurationMs - startedAtMs) / 1000),
  );
}

export function formatElapsedTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${paddedMinutes}:${paddedSeconds}`;
}
