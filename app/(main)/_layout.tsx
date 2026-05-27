import { Redirect, Stack } from "expo-router";
import { Text, View } from "react-native";

import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

function LoadingGate() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.background,
        padding: 20,
      }}
    >
      <Text
        selectable
        style={{
          color: colors.textMuted,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
          textAlign: "center",
        }}
      >
        Loading LucidCue...
      </Text>
    </View>
  );
}

export default function MainLayout() {
  const { isHydrated, onboardingComplete } = useAppState();

  if (!isHydrated) {
    return <LoadingGate />;
  }

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
        gestureEnabled: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
