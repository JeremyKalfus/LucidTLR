import { Redirect, Stack, router, usePathname } from "expo-router";
import React from "react";
import { AppState as NativeAppState, Text, View } from "react-native";

import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  isWatchModeProductFlowAvailable,
  loadWatchModeProductLockState,
} from "@/src/features/watchMode/watchModeProductFlow";
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
        Loading LucidTLR...
      </Text>
    </View>
  );
}

function WatchModeProductLockGate() {
  const { participantId } = useAppState();
  const pathname = usePathname();

  const routeToLockedScreenIfNeeded = React.useCallback(async () => {
    if (!isWatchModeProductFlowAvailable()) {
      return;
    }

    const db = await getLocalDb();
    const lock = await loadWatchModeProductLockState({
      db,
      participantId,
    });

    if (lock.state && pathname !== "/watch-mode-running") {
      router.replace("/watch-mode-running");
    }
  }, [participantId, pathname]);

  React.useEffect(() => {
    void routeToLockedScreenIfNeeded();
  }, [routeToLockedScreenIfNeeded]);

  React.useEffect(() => {
    const subscription = NativeAppState.addEventListener("change", (state) => {
      if (state === "active") {
        void routeToLockedScreenIfNeeded();
      }
    });

    return () => subscription.remove();
  }, [routeToLockedScreenIfNeeded]);

  return null;
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
    <>
      <WatchModeProductLockGate />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          gestureEnabled: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}
