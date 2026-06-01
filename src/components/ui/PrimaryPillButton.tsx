import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { borders, colors, radii, typography } from "@/src/theme/tokens";

export function PrimaryPillButton({
  flex,
  icon: Icon,
  label,
  onPress,
  disabled = false,
}: {
  flex?: number;
  icon?: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        ...(flex === undefined
          ? { width: "100%" }
          : {
              flexGrow: flex,
              flexShrink: 1,
              flexBasis: 0,
            }),
        minWidth: 0,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 52,
        borderRadius: radii.button,
        borderWidth: borders.hairline,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        paddingHorizontal: 16,
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
      })}
    >
      <View
        style={{
          width: "100%",
          minWidth: 0,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: Icon ? 8 : 0,
        }}
      >
        {Icon ? (
          <Icon color={colors.textMuted} size={20} strokeWidth={1.8} />
        ) : null}
        <Text
          selectable
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={1}
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
            letterSpacing: typography.body.letterSpacing,
            fontWeight: "400",
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
