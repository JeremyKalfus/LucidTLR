import { Redirect } from "expo-router";
import { Text, View } from "react-native";

import { OnboardingWizardScreen } from "@/src/screens/OnboardingWizardScreen";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

function LoadingOnboardingGate() {
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
        Loading LucidTLR...
      </Text>
    </View>
  );
}

export default function OnboardingRoute() {
  const { isHydrated, onboardingComplete } = useAppState();

  if (!isHydrated) {
    return <LoadingOnboardingGate />;
  }

  if (onboardingComplete) {
    return <Redirect href="/" />;
  }

  return <OnboardingWizardScreen />;
}
