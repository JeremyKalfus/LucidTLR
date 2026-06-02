import React from "react";
import { Text, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import type { NativePhoneRuntimeEvent } from "@/src/native/phoneRuntime";
import type { WatchEpoch } from "@/src/domain/types";
import {
  graphPointsForWatchData,
  type WatchGraphPoint,
} from "@/src/components/sleep/watchSleepGraphData";
import type { WatchRuntimeEvent } from "@/src/native/watch";
import { colors, typography } from "@/src/theme/tokens";

type GraphPoint = {
  timestamp: string;
  value: number;
};

type GraphBand = {
  startAt: string;
  endAt: string;
  kind: "cue_window" | "movement_pause";
};

function numberPayload(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringPayload(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];

  return typeof value === "string" ? value : undefined;
}

function movementIntensityValue(event: NativePhoneRuntimeEvent): number {
  const numeric = numberPayload(event.payload, "movementIntensity");

  if (typeof numeric === "number") {
    return numeric;
  }

  const rough = stringPayload(event.payload, "roughMovementIntensity");

  if (rough === "large") {
    return 1;
  }

  if (rough === "moderate") {
    return 0.66;
  }

  if (rough === "light") {
    return 0.33;
  }

  return 0;
}

function firstLogTimestamp(logs: NativePhoneRuntimeEvent[]): string | undefined {
  return logs[0]?.timestamp;
}

function lastLogTimestamp(logs: NativePhoneRuntimeEvent[]): string | undefined {
  return logs[logs.length - 1]?.timestamp;
}

function firstWatchTimestamp(
  epochs: WatchEpoch[],
  events: WatchRuntimeEvent[],
): string | undefined {
  return epochs[0]?.epochStart ?? events[0]?.timestamp;
}

function lastWatchTimestamp(
  epochs: WatchEpoch[],
  events: WatchRuntimeEvent[],
): string | undefined {
  return epochs[epochs.length - 1]?.epochEnd ?? events[events.length - 1]?.timestamp;
}

function validDateString(value: unknown): string | undefined {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : undefined;
}

function dateAfter(timestamp: string, seconds: number): string {
  return new Date(Date.parse(timestamp) + seconds * 1000).toISOString();
}

export function graphPointsForLogs(logs: NativePhoneRuntimeEvent[]): {
  motion: GraphPoint[];
  cues: GraphPoint[];
  battery: GraphPoint[];
} {
  return {
    motion: logs
      .filter((event) => event.eventType === "motion_summary")
      .map((event) => ({
        timestamp: event.timestamp,
        value: movementIntensityValue(event),
      })),
    cues: logs
      .filter(
        (event) =>
          event.eventType === "cue_played" ||
          event.eventType === "training_cue_played",
      )
      .map((event) => ({
        timestamp: event.timestamp,
        value: numberPayload(event.payload, "volume") ?? 1,
      })),
    battery: logs
      .filter((event) => event.eventType === "battery_summary")
      .flatMap((event) => {
        const batteryLevel = numberPayload(event.payload, "batteryLevel");

        return typeof batteryLevel === "number"
          ? [
              {
                timestamp: event.timestamp,
                value: Math.max(0, Math.min(1, batteryLevel)),
              },
            ]
          : [];
      }),
  };
}

function cueWindowBandsForLogs(logs: NativePhoneRuntimeEvent[]): GraphBand[] {
  const runtimeStarted = logs.find((event) => event.eventType === "runtime_started");
  const predictedRemWindows = runtimeStarted?.payload.predictedRemWindows;

  if (Array.isArray(predictedRemWindows)) {
    const predictedBands = predictedRemWindows.flatMap((window) => {
      if (!window || typeof window !== "object") {
        return [];
      }

      const rawWindow = window as Record<string, unknown>;
      const startAt = validDateString(rawWindow.startAt);
      const endAt = validDateString(rawWindow.endAt);

      return startAt && endAt && Date.parse(endAt) > Date.parse(startAt)
        ? [{ startAt, endAt, kind: "cue_window" as const }]
        : [];
    });

    if (predictedBands.length > 0) {
      return predictedBands;
    }
  }

  const earliestCueAt = validDateString(runtimeStarted?.payload.earliestCueAt);
  const latestCueAt = validDateString(runtimeStarted?.payload.latestCueAt);

  return earliestCueAt && latestCueAt && Date.parse(latestCueAt) > Date.parse(earliestCueAt)
    ? [{ startAt: earliestCueAt, endAt: latestCueAt, kind: "cue_window" }]
    : [];
}

function movementPauseBandsForLogs(logs: NativePhoneRuntimeEvent[]): GraphBand[] {
  return logs.flatMap((event, index) => {
    if (event.eventType !== "movement_pause_started") {
      return [];
    }

    const startAt = event.timestamp;
    const pauseUntil = validDateString(event.payload.pauseUntil);
    const nextPauseEnd = logs.slice(index + 1).find(
      (candidate) =>
        candidate.eventType === "movement_pause_ended" &&
        Date.parse(candidate.timestamp) >= Date.parse(startAt),
    );
    const endAt =
      pauseUntil ??
      validDateString(nextPauseEnd?.payload.pauseEndedAt) ??
      nextPauseEnd?.timestamp ??
      dateAfter(startAt, 5 * 60);

    return Date.parse(endAt) > Date.parse(startAt)
      ? [{ startAt, endAt, kind: "movement_pause" as const }]
      : [];
  });
}

function movementPauseBandsForWatchEvents(
  events: WatchRuntimeEvent[],
): GraphBand[] {
  return events.flatMap((event) => {
    if (event.eventType !== "watch_movement_pause_started") {
      return [];
    }

    const startAt = event.timestamp;
    const pauseUntil = validDateString(event.payload.pauseUntil);
    const endAt = pauseUntil ?? dateAfter(startAt, 5 * 60);

    return Date.parse(endAt) > Date.parse(startAt)
      ? [{ startAt, endAt, kind: "movement_pause" as const }]
      : [];
  });
}

export function SleepNightGraph({
  endAt,
  logs,
  startAt,
  watchEpochs = [],
  watchRuntimeEvents = [],
}: {
  endAt?: string;
  logs: NativePhoneRuntimeEvent[];
  startAt?: string;
  watchEpochs?: WatchEpoch[];
  watchRuntimeEvents?: WatchRuntimeEvent[];
}) {
  const [width, setWidth] = React.useState(320);
  const height = 180;
  const chartTop = 18;
  const chartLeft = 34;
  const chartRight = 12;
  const chartBottom = 24;
  const chartWidth = Math.max(1, width - chartLeft - chartRight);
  const chartHeight = height - chartTop - chartBottom;
  const graph = graphPointsForLogs(logs);
  const watchGraph = graphPointsForWatchData({
    epochs: watchEpochs,
    runtimeEvents: watchRuntimeEvents,
  });
  const cueWindowBands = cueWindowBandsForLogs(logs);
  const movementPauseBands = [
    ...movementPauseBandsForLogs(logs),
    ...movementPauseBandsForWatchEvents(watchRuntimeEvents),
  ];
  const startMs = Date.parse(
    startAt ?? firstLogTimestamp(logs) ?? firstWatchTimestamp(watchEpochs, watchRuntimeEvents) ?? "",
  );
  const endMs = Date.parse(
    endAt ?? lastLogTimestamp(logs) ?? lastWatchTimestamp(watchEpochs, watchRuntimeEvents) ?? "",
  );
  const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now();
  const safeEndMs =
    Number.isFinite(endMs) && endMs > safeStartMs
      ? endMs
      : safeStartMs + 60 * 60 * 1000;

  function x(timestamp: string): number {
    const timestampMs = Date.parse(timestamp);
    const ratio = Number.isFinite(timestampMs)
      ? (timestampMs - safeStartMs) / (safeEndMs - safeStartMs)
      : 0;

    return chartLeft + Math.max(0, Math.min(1, ratio)) * chartWidth;
  }

  function y(value: number): number {
    return chartTop + (1 - Math.max(0, Math.min(1, value))) * chartHeight;
  }

  function polyline(points: GraphPoint[] | WatchGraphPoint[]): string {
    return points.map((point) => `${x(point.timestamp)},${y(point.value)}`).join(" ");
  }

  function bandX(startAt: string): number {
    return x(startAt);
  }

  function bandWidth(band: GraphBand): number {
    return Math.max(2, x(band.endAt) - x(band.startAt));
  }

  const hasGraphData =
    graph.motion.length > 0 ||
    graph.cues.length > 0 ||
    graph.battery.length > 0 ||
    watchGraph.sleep.length > 0 ||
    watchGraph.rem.length > 0 ||
    watchGraph.heartRate.length > 0 ||
    watchGraph.movement.length > 0 ||
    watchGraph.sensorQuality.length > 0 ||
    watchGraph.cues.length > 0 ||
    watchGraph.battery.length > 0 ||
    cueWindowBands.length > 0 ||
    movementPauseBands.length > 0;

  return (
    <View
      onLayout={(event) => {
        setWidth(Math.max(260, event.nativeEvent.layout.width));
      }}
      style={{ minHeight: height }}
    >
      <Svg height={height} width={width}>
        {cueWindowBands.map((band, index) => (
          <Rect
            key={`${band.startAt}-${band.endAt}-${index}`}
            fill="#f97316"
            fillOpacity={0.1}
            height={chartHeight}
            rx={3}
            width={bandWidth(band)}
            x={bandX(band.startAt)}
            y={chartTop}
          />
        ))}
        {movementPauseBands.map((band, index) => (
          <Rect
            key={`${band.startAt}-${band.endAt}-${index}`}
            fill="#f87171"
            fillOpacity={0.16}
            height={chartHeight}
            rx={3}
            width={bandWidth(band)}
            x={bandX(band.startAt)}
            y={chartTop}
          />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <Line
            key={tick}
            stroke={colors.cardBorder}
            strokeDasharray={tick === 0 ? undefined : "4 5"}
            strokeWidth={1}
            x1={chartLeft}
            x2={chartLeft + chartWidth}
            y1={y(tick)}
            y2={y(tick)}
          />
        ))}
        <Line
          stroke={colors.cardBorder}
          strokeWidth={1}
          x1={chartLeft}
          x2={chartLeft}
          y1={chartTop}
          y2={chartTop + chartHeight}
        />
        <Line
          stroke={colors.cardBorder}
          strokeWidth={1}
          x1={chartLeft}
          x2={chartLeft + chartWidth}
          y1={chartTop + chartHeight}
          y2={chartTop + chartHeight}
        />
        {graph.motion.length > 1 ? (
          <Polyline
            fill="none"
            points={polyline(graph.motion)}
            stroke="#7dd3fc"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
        {watchGraph.sleep.length > 1 ? (
          <Polyline
            fill="none"
            points={polyline(watchGraph.sleep)}
            stroke="#14b8a6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
        {watchGraph.rem.length > 1 ? (
          <Polyline
            fill="none"
            points={polyline(watchGraph.rem)}
            stroke="#facc15"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
        {watchGraph.heartRate.length > 1 ? (
          <Polyline
            fill="none"
            points={polyline(watchGraph.heartRate)}
            stroke="#fb7185"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
        {watchGraph.movement.length > 1 ? (
          <Polyline
            fill="none"
            points={polyline(watchGraph.movement)}
            stroke="#60a5fa"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
        {watchGraph.sensorQuality.length > 1 ? (
          <Polyline
            fill="none"
            points={polyline(watchGraph.sensorQuality)}
            stroke="#a78bfa"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
        {graph.battery.length > 1 ? (
          <Polyline
            fill="none"
            points={polyline(graph.battery)}
            stroke="#22c55e"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
        {watchGraph.battery.length > 1 ? (
          <Polyline
            fill="none"
            points={polyline(watchGraph.battery)}
            stroke="#84cc16"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
        {graph.cues.map((point, index) => (
          <Circle
            key={`${point.timestamp}-${index}`}
            cx={x(point.timestamp)}
            cy={y(point.value)}
            fill="#f97316"
            r={3}
          />
        ))}
        {watchGraph.cues.map((point, index) => (
          <Circle
            key={`watch-${point.timestamp}-${index}`}
            cx={x(point.timestamp)}
            cy={y(point.value)}
            fill="#f97316"
            r={4}
          />
        ))}
        <SvgText
          fill={colors.textDim}
          fontSize={11}
          x={0}
          y={chartTop + 4}
        >
          high
        </SvgText>
        <SvgText
          fill={colors.textDim}
          fontSize={11}
          x={8}
          y={chartTop + chartHeight}
        >
          low
        </SvgText>
        <SvgText
          fill={colors.textDim}
          fontSize={11}
          x={chartLeft}
          y={height - 4}
        >
          {new Date(safeStartMs).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </SvgText>
        <SvgText
          fill={colors.textDim}
          fontSize={11}
          textAnchor="end"
          x={chartLeft + chartWidth}
          y={height - 4}
        >
          {new Date(safeEndMs).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </SvgText>
        {!hasGraphData ? (
          <SvgText
            fill={colors.textMuted}
            fontSize={13}
            textAnchor="middle"
            x={width / 2}
            y={height / 2}
          >
            no graphable samples for this night
          </SvgText>
        ) : null}
      </Svg>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {watchGraph.sleep.length > 0 ? (
          <GraphLegend color="#14b8a6" label="sleep phase" />
        ) : null}
        {watchGraph.rem.length > 0 ? (
          <GraphLegend color="#facc15" label="predicted REM" />
        ) : null}
        {watchGraph.heartRate.length > 0 ? (
          <GraphLegend color="#fb7185" label="heart rate" />
        ) : null}
        {graph.motion.length > 0 ? (
          <GraphLegend color="#7dd3fc" label="phone motion" />
        ) : null}
        {watchGraph.movement.length > 0 ? (
          <GraphLegend color="#60a5fa" label="watch movement" />
        ) : null}
        {watchGraph.sensorQuality.length > 0 ? (
          <GraphLegend color="#a78bfa" label="sensor quality" />
        ) : null}
        {graph.battery.length > 0 ? (
          <GraphLegend color="#22c55e" label="phone battery" />
        ) : null}
        {watchGraph.battery.length > 0 ? (
          <GraphLegend color="#84cc16" label="watch battery" />
        ) : null}
        {graph.cues.length > 0 || watchGraph.cues.length > 0 ? (
          <GraphLegend color="#f97316" label="cues" />
        ) : null}
        {cueWindowBands.length > 0 ? (
          <GraphLegend color="#f97316" label="cue window" />
        ) : null}
        {movementPauseBands.length > 0 ? (
          <GraphLegend color="#f87171" label="pause" />
        ) : null}
      </View>
    </View>
  );
}

function GraphLegend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
        }}
      />
      <Text
        selectable
        style={{
          color: colors.textMuted,
          fontSize: typography.label.fontSize,
          lineHeight: typography.label.lineHeight,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
