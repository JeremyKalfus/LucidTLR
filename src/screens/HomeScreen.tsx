import { router } from "expo-router";
import { Moon, NotebookPen, Settings } from "lucide-react-native";
import { Text, View } from "react-native";

import {
  Card,
  IconButton,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SecondaryPillAction,
  SectionTitle,
} from "@/src/components/ui";
import { cueAudio } from "@/src/protocol/tlrProtocol";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

export function HomeScreen() {
  const { selectedMode, sessionHistory, startSession } = useAppState();
  const tlrNights = sessionHistory.filter(
    (session) => session.sessionType === "tlr",
  ).length;
  const lastSession = sessionHistory[0] ?? null;

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SectionTitle>TLR options</SectionTitle>
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

      <PrimaryPillButton
        label="Begin TLR"
        variant="large"
        onPress={() => {
          startSession("tlr");
          router.push("/presleep-training");
        }}
      />

      <View style={{ flexDirection: "row", gap: 14 }}>
        <SecondaryPillAction
          icon={Moon}
          label="Log Sleep Only"
          onPress={() => {
            startSession("sleep_log");
            router.push("/active-night-session");
          }}
        />
        <SecondaryPillAction
          icon={NotebookPen}
          label="Record Dream"
          onPress={() => router.push("/journal")}
        />
      </View>

      <SectionTitle>Your last sleep</SectionTitle>
      <Card>
        <View style={{ minHeight: 280, justifyContent: "center" }}>
          {lastSession ? (
            <View style={{ gap: 10 }}>
              <InfoRow label="type" value={lastSession.sessionType} />
              <InfoRow label="mode" value={lastSession.mode ?? "none"} />
              <InfoRow label="status" value={lastSession.status.replaceAll("_", " ")} />
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
    </Screen>
  );
}
