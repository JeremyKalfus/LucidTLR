import { Pressable, Text } from "react-native";

import { borders, colors, radii, shadows, typography } from "@/src/theme/tokens";

export function PrimaryPillButton({
  label,
  onPress,
  disabled = false,
  variant = "normal",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "normal" | "large";
}) {
  const isLarge = variant === "large";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        justifyContent: "center",
        minHeight: isLarge ? 78 : 44,
        borderRadius: isLarge ? radii.primaryPill : radii.button,
        borderWidth: borders.hairline,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        paddingHorizontal: isLarge ? 18 : 16,
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        boxShadow: isLarge && !disabled ? shadows.primaryGlow : undefined,
      })}
    >
      <Text
        selectable
        style={{
          color: colors.textPrimary,
          fontSize: isLarge
            ? typography.title.fontSize
            : typography.body.fontSize,
          lineHeight: isLarge
            ? typography.title.lineHeight
            : typography.body.lineHeight,
          letterSpacing: isLarge
            ? typography.title.letterSpacing
            : typography.body.letterSpacing,
          fontWeight: "400",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
