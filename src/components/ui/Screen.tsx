import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { BottomNavigator } from "./BottomNavigator";
import { colors, spacing } from "@/src/theme/tokens";

export function Screen({
  children,
  bottomNav = true,
}: {
  children: ReactNode;
  bottomNav?: boolean;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingTop: 54,
          paddingHorizontal: spacing.screenMargin,
          paddingBottom: bottomNav ? 130 : 42,
          gap: spacing.cardGap,
        }}
      >
        {children}
      </ScrollView>
      {bottomNav ? <BottomNavigator /> : null}
    </View>
  );
}
