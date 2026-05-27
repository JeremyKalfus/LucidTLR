import type { ReactNode } from "react";
import { View } from "react-native";

import { borders, colors, radii } from "@/src/theme/tokens";

export function Card({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.cardBorder,
        borderWidth: borders.hairline,
        borderRadius: radii.card,
        padding: compact ? 10 : 14,
        gap: compact ? 8 : 12,
      }}
    >
      {children}
    </View>
  );
}
