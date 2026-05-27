import { Text, View } from "react-native";

import { colors, typography } from "@/src/theme/tokens";

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text
        selectable
        style={{
          color: colors.textMuted,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {label}
      </Text>
      <Text
        selectable
        style={{
          color: colors.textPrimary,
          flexShrink: 1,
          textAlign: "right",
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
