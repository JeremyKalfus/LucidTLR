import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Moon, NotebookPen, Settings, Sparkles } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import {
  Card,
  IconButton,
  InfoRow,
  Screen,
} from "@/src/components/ui";
import { formatSessionLength } from "@/src/features/sessions/sessionLength";
import { cueAudio } from "@/src/protocol/tlrProtocol";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

const labelToCardGap = 6;
const primaryActionFlex = 1.8;
const primaryActionFontSize = 20;
const primaryActionLineHeight = 22;
const sideActionFlex = 1.1;
const sideActionHorizontalPadding = 6;
const sideActionTextScale = 0.75;

function HomeSectionLabel({ children }: { children: string }) {
  return (
    <Text
      selectable
      style={{
        color: colors.textPrimary,
        fontSize: typography.body.fontSize,
        lineHeight: typography.body.lineHeight,
        letterSpacing: typography.body.letterSpacing,
        fontWeight: "400",
      }}
    >
      {children}
    </Text>
  );
}

function HomeActionButton({
  flex,
  icon: Icon,
  label,
  onPress,
  primary = false,
}: {
  flex: number;
  icon?: LucideIcon;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: flex,
        flexShrink: 1,
        flexBasis: 0,
        minWidth: 0,
        minHeight: 78,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.primaryPill,
        borderWidth: borders.hairline,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        paddingHorizontal: primary ? 12 : sideActionHorizontalPadding,
        opacity: pressed ? 0.72 : 1,
        boxShadow: primary ? shadows.primaryGlow : undefined,
      })}
    >
      <View
        style={{
          width: "100%",
          minWidth: 0,
          alignItems: "center",
          justifyContent: "center",
          gap: Icon ? (primary ? 4 : 5) : 0,
        }}
      >
        {Icon ? (
          <Icon
            color={colors.textMuted}
            size={primary ? 22 : 24}
            strokeWidth={1.8}
          />
        ) : null}
        <Text
          selectable
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={primary ? 1 : 2}
          style={{
            color: primary ? colors.textPrimary : colors.textMuted,
            fontSize: primary
              ? primaryActionFontSize
              : typography.label.fontSize * sideActionTextScale,
            lineHeight: primary
              ? primaryActionLineHeight
              : typography.label.lineHeight * sideActionTextScale,
            letterSpacing: primary
              ? typography.title.letterSpacing
              : typography.label.letterSpacing,
            textAlign: "center",
            fontWeight: "400",
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function HomeScreen() {
  const { selectedMode, sessionHistory, startSession } = useAppState();
  const tlrNights = sessionHistory.filter(
    (session) => session.sessionType === "tlr",
  ).length;
  const lastSession = sessionHistory[0] ?? null;

  return (
    <Screen>
      <View style={{ gap: labelToCardGap }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <HomeSectionLabel>TLR options</HomeSectionLabel>
          <IconButton
            icon={Settings}
            label="Open settings"
            onPress={() => router.push("/settings")}
          />
        </View>

        <Card compact>
          <InfoRow label="mode" value={selectedMode === "phone" ? "phone only" : "watch"} />
          <InfoRow label="sound" value={cueAudio.defaultCueId.replaceAll("-", " ")} />
          <InfoRow label="nights with TLR" value={String(tlrNights)} />
        </Card>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <HomeActionButton
          flex={sideActionFlex}
          icon={Moon}
          label="Log Sleep Only"
          onPress={() => {
            startSession("sleep_log");
            router.push("/active-night-session");
          }}
        />
        <HomeActionButton
          flex={primaryActionFlex}
          icon={Sparkles}
          label="Begin TLR"
          primary
          onPress={() => {
            startSession("tlr");
            router.push("/presleep-training");
          }}
        />
        <HomeActionButton
          flex={sideActionFlex}
          icon={NotebookPen}
          label="Record Dream"
          onPress={() => router.push("/journal")}
        />
      </View>

      <View style={{ gap: labelToCardGap, marginTop: spacing.cardGap - labelToCardGap }}>
        <HomeSectionLabel>Your last sleep</HomeSectionLabel>
        <Card>
          <View style={{ minHeight: 280, justifyContent: "center" }}>
            {lastSession ? (
              <View style={{ gap: 10 }}>
                <InfoRow label="type" value={lastSession.sessionType} />
                <InfoRow label="mode" value={lastSession.mode ?? "none"} />
                <InfoRow label="status" value={lastSession.status.replaceAll("_", " ")} />
                <InfoRow label="length" value={formatSessionLength(lastSession)} />
                <InfoRow
                  label="started"
                  value={new Date(lastSession.startedAt).toLocaleString()}
                />
              </View>
            ) : (
              <Text
                selectable
                style={{
                  color: colors.textDim,
                  fontSize: typography.body.fontSize,
                  lineHeight: typography.body.lineHeight,
                  textAlign: "center",
                }}
              >
                No sleep sessions logged yet.
              </Text>
            )}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
