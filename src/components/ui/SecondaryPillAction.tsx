import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { borders, colors, radii, typography } from "@/src/theme/tokens";

export function SecondaryPillAction({
  label,
  icon: Icon,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 52,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.button,
        borderWidth: borders.hairline,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Icon color={colors.textMuted} size={20} strokeWidth={1.8} />
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
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
