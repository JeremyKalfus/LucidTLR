import { Redirect } from "expo-router";

import { isWatchModeProductFlowAvailable } from "@/src/features/watchMode/watchModeProductFlow";
import { WatchModeRunningScreen } from "@/src/screens/WatchModeRunningScreen";

export default function WatchModeRunningRoute() {
  if (!isWatchModeProductFlowAvailable()) {
    return <Redirect href="/" />;
  }

  return <WatchModeRunningScreen />;
}
