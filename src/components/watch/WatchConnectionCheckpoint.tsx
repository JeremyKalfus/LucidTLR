import { Watch } from "lucide-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Screen } from "@/src/components/ui";
import { colors, typography } from "@/src/theme/tokens";

export function WatchConnectionCheckpoint({
  children,
  detail,
  title = "Connecting to Watch",
}: {
  children?: ReactNode;
  detail?: string | null;
  title?: string;
}) {
  return (
    <Screen bottomNav={false} centered>
      <View style={{ alignItems: "center", gap: 16 }}>
        <Watch color={colors.textMuted} size={28} strokeWidth={1.8} />
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.title.fontSize,
            lineHeight: typography.title.lineHeight,
            letterSpacing: typography.title.letterSpacing,
            textAlign: "center",
            fontWeight: "400",
          }}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              letterSpacing: typography.body.letterSpacing,
              textAlign: "center",
            }}
          >
            {detail}
          </Text>
        ) : null}
        {children}
      </View>
    </Screen>
  );
}
