import { useLocalSearchParams } from "expo-router";

import { WatchModeLabScreen } from "@/src/screens/WatchModeLabScreen";

type WatchModeLabAutorun = "baseline" | "import-ack" | "reset";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function autorunParam(value: string | undefined): WatchModeLabAutorun | undefined {
  return value === "baseline" || value === "import-ack" || value === "reset"
    ? value
    : undefined;
}

export default function WatchModeLabRoute() {
  const params = useLocalSearchParams<{
    autorun?: string | string[];
    exportTo?: string | string[];
    runId?: string | string[];
  }>();

  return (
    <WatchModeLabScreen
      automationParams={{
        autorun: autorunParam(firstParam(params.autorun)),
        exportTo: firstParam(params.exportTo) === "file" ? "file" : undefined,
        runId: firstParam(params.runId),
      }}
    />
  );
}
