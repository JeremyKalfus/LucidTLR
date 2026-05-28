import * as React from "react";
import { Text, View } from "react-native";

import { colors } from "@/src/theme/tokens";

function elapsedSecondsSince(startedAt: string | undefined, nowMs: number): number {
  if (!startedAt) {
    return 0;
  }

  const startedAtMs = Date.parse(startedAt);

  if (Number.isNaN(startedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${paddedMinutes}:${paddedSeconds}`;
}

export function RunningSessionClock({
  startedAt,
}: {
  startedAt: string | undefined;
}) {
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    setNowMs(Date.now());

    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [startedAt]);

  const elapsedSeconds = elapsedSecondsSince(startedAt, nowMs);

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        minHeight: 180,
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
    </View>
  );
}
