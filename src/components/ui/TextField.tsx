import type { TextInputProps } from "react-native";
import { TextInput } from "react-native";

import { borders, colors, radii, typography } from "@/src/theme/tokens";

export function TextField({
  height = 44,
  style,
  ...props
}: TextInputProps & { height?: number }) {
  return (
    <TextInput
      placeholderTextColor={colors.textDim}
      {...props}
      style={[
        {
          height,
          borderWidth: borders.hairline,
          borderColor: colors.cardBorder,
          borderRadius: radii.card,
          color: colors.textPrimary,
          paddingHorizontal: 12,
          paddingVertical: 0,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
          textAlignVertical: "center",
          includeFontPadding: false,
        },
        style,
      ]}
    />
  );
}
