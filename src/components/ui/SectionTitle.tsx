import { Text } from "react-native";

import { colors, typography } from "@/src/theme/tokens";

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      selectable
      style={{
        color: colors.textPrimary,
        fontSize: typography.title.fontSize,
        lineHeight: typography.title.lineHeight,
        letterSpacing: typography.title.letterSpacing,
        fontWeight: "400",
      }}
    >
      {children}
    </Text>
  );
}
