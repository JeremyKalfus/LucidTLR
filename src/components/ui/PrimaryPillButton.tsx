import { Pressable, Text } from "react-native";

import { borders, colors, radii, shadows, typography } from "@/src/theme/tokens";

export function PrimaryPillButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        justifyContent: "center",
        minHeight: 78,
        borderRadius: radii.primaryPill,
        borderWidth: borders.hairline,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        boxShadow: disabled ? undefined : shadows.primaryGlow,
      })}
    >
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
        {label}
      </Text>
    </Pressable>
  );
}
