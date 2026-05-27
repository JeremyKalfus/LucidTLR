import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";

import { colors } from "@/src/theme/tokens";

export function IconButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.68 : 1,
      })}
    >
      <Icon color={colors.textMuted} size={24} strokeWidth={1.8} />
    </Pressable>
  );
}
