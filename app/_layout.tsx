import { Stack } from "expo-router";
import { StatusBar } from "react-native";

import { DiagnosticsRouteTracker } from "@/src/features/diagnostics/DiagnosticsRouteTracker";
import { AppStateProvider } from "@/src/state/AppState";
import { colors } from "@/src/theme/tokens";

export default function RootLayout() {
  return (
    <AppStateProvider>
      <DiagnosticsRouteTracker />
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          gestureEnabled: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </AppStateProvider>
  );
}
