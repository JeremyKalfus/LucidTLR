import type { NightSession } from "@/src/domain/types";

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 1) {
    return "<1 min";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} hr ${minutes} min`;
  }

  if (hours > 0) {
    return `${hours} hr`;
  }

  return `${minutes} min`;
}

export function formatSessionLength(session: NightSession): string {
  if (!session.endedAt) {
    return "in progress";
  }

  const lengthStartedAt =
    session.sessionType === "tlr"
      ? session.trainingEndedAt ?? session.startedAt
      : session.startedAt;
  const startedAtMs = Date.parse(lengthStartedAt);
  const endedAtMs = Date.parse(session.endedAt);

  if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs)) {
    return "unknown";
  }

  const elapsedMs = endedAtMs - startedAtMs;

  if (elapsedMs < 0) {
    return "unknown";
  }

  return formatMinutes(Math.round(elapsedMs / 60000));
}
