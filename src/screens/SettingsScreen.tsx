import { Pressable, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import type { AppMode } from "@/src/domain/types";
import { cueAudio, TLR_PROTOCOL_VERSION } from "@/src/protocol/tlrProtocol";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

function ModeButton({
  mode,
  active,
  onPress,
}: {
  mode: AppMode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: borders.hairline,
        borderRadius: radii.card,
        borderColor: active ? colors.textMuted : colors.cardBorder,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text
        selectable
        style={{
          color: active ? colors.textPrimary : colors.textMuted,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {mode}
      </Text>
    </Pressable>
  );
}

export function SettingsScreen() {
  const {
    consentChoices,
    participantId,
    selectedMode,
    setSelectedMode,
  } = useAppState();

  return (
    <Screen>
      <SectionTitle>Settings</SectionTitle>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Mode
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <ModeButton
            mode="phone"
            active={selectedMode === "phone"}
            onPress={() => setSelectedMode("phone")}
          />
          <ModeButton
            mode="watch"
            active={selectedMode === "watch"}
            onPress={() => setSelectedMode("watch")}
          />
        </View>
      </Card>

      <Card>
        <InfoRow label="cue sound" value={cueAudio.description} />
        <InfoRow label="sensitivity preset" value="placeholder" />
        <InfoRow label="structured upload" value={consentChoices.structuredResearchUploadConsent ? "enabled" : "off"} />
        <InfoRow label="dream upload" value={consentChoices.dreamJournalUploadConsent ? "enabled" : "off"} />
        <InfoRow label="Supabase auth" value="not created in this shell" />
      </Card>

      <Card>
        <InfoRow label="participant ID" value={participantId} />
        <InfoRow label="protocol" value={TLR_PROTOCOL_VERSION} />
        <InfoRow label="app shell" value="0.1.0" />
      </Card>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Settings are local React state placeholders for the first runnable
          shell. No upload, account creation, native sensing, or audio behavior
          is connected here.
        </Text>
      </Card>
    </Screen>
  );
}
