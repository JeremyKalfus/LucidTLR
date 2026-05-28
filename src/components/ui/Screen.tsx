import * as React from "react";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { BottomNavigator } from "./BottomNavigator";
import { colors, spacing } from "@/src/theme/tokens";

export function Screen({
  children,
  bottomNav = true,
  centered = false,
}: {
  children: ReactNode;
  bottomNav?: boolean;
  centered?: boolean;
}) {
  const [viewportHeight, setViewportHeight] = React.useState(0);
  const [contentHeight, setContentHeight] = React.useState(0);
  const scrollEnabled = contentHeight > viewportHeight + 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        alwaysBounceVertical={scrollEnabled}
        contentInsetAdjustmentBehavior="never"
        onContentSizeChange={(_, height) => setContentHeight(height)}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={scrollEnabled}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: spacing.screenTopPadding,
          paddingHorizontal: spacing.screenMargin,
          paddingBottom: bottomNav ? 130 : 42,
          gap: spacing.cardGap,
          justifyContent: centered ? "center" : "flex-start",
        }}
      >
        {children}
      </ScrollView>
      {bottomNav ? <BottomNavigator /> : null}
    </View>
  );
}
