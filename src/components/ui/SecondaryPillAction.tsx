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
        minHeight: 72,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.secondaryPill,
        borderWidth: borders.hairline,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View style={{ gap: 7, alignItems: "center" }}>
        <Icon color={colors.textMuted} size={24} strokeWidth={1.8} />
        <Text
          selectable
          style={{
            color: colors.textMuted,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
            letterSpacing: typography.label.letterSpacing,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
