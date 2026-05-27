import { Stack } from "expo-router";
import { StatusBar } from "react-native";

import { AppStateProvider } from "@/src/state/AppState";
import { colors } from "@/src/theme/tokens";

export default function RootLayout() {
  return (
    <AppStateProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </AppStateProvider>
  );
}
