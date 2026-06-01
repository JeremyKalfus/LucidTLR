import * as React from "react";
import { Text, View } from "react-native";

import { colors, typography } from "@/src/theme/tokens";
import {
  elapsedSecondsSince,
  formatElapsedTime,
} from "./runningSessionClockTime";

export function RunningSessionClock({
  label,
  paused = false,
  startedAt,
}: {
  label?: string;
  paused?: boolean;
  startedAt: string | undefined;
}) {
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [pausedDurationMs, setPausedDurationMs] = React.useState(0);
  const pausedStartedAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    pausedStartedAtRef.current = null;
    setNowMs(Date.now());
    setPausedDurationMs(0);
  }, [startedAt]);

  React.useEffect(() => {
    const currentMs = Date.now();

    if (paused) {
      if (pausedStartedAtRef.current === null) {
        pausedStartedAtRef.current = currentMs;
        setNowMs(currentMs);
      }

      return;
    }

    if (pausedStartedAtRef.current !== null) {
      const pausedStartedAt = pausedStartedAtRef.current;

      pausedStartedAtRef.current = null;
      setPausedDurationMs(
        (durationMs) => durationMs + currentMs - pausedStartedAt,
      );
      setNowMs(currentMs);
    }
  }, [paused, startedAt]);

  React.useEffect(() => {
    if (paused) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [paused, startedAt]);

  const effectiveNowMs =
    paused && pausedStartedAtRef.current !== null
      ? pausedStartedAtRef.current
      : nowMs;
  const elapsedSeconds = elapsedSecondsSince(
    startedAt,
    effectiveNowMs,
    pausedDurationMs,
  );

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        minHeight: 180,
        gap: 8,
      }}
    >
      <Text
        selectable
        accessibilityLabel={`Elapsed time ${formatElapsedTime(elapsedSeconds)}`}
        style={{
          color: colors.textPrimary,
          fontSize: 64,
          lineHeight: 72,
          letterSpacing: 0,
          fontVariant: ["tabular-nums"],
          fontWeight: "400",
        }}
      >
        {formatElapsedTime(elapsedSeconds)}
      </Text>
      {label ? (
        <Text
          selectable
          style={{
            color: colors.textMuted,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
            letterSpacing: typography.label.letterSpacing,
            fontWeight: "400",
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
