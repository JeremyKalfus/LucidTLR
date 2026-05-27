import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

export function DreamJournalScreen() {
  const { addJournalEntry, consentChoices, journalEntries } = useAppState();
  const [text, setText] = useState("");

  return (
    <Screen>
      <SectionTitle>Dream journal</SectionTitle>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Dream journal entries stay local in this shell. Text/audio upload is
          not enabled unless separate dream journal research consent is accepted
          in a future sync flow.
        </Text>
        <InfoRow
          label="dream upload consent"
          value={consentChoices.dreamJournalUploadConsent ? "enabled" : "off"}
        />
      </Card>

      <TextInput
        multiline
        placeholder="Write a dream note..."
        placeholderTextColor={colors.textDim}
        value={text}
        onChangeText={setText}
        style={{
          minHeight: 180,
          borderWidth: borders.hairline,
          borderColor: colors.cardBorder,
          borderRadius: radii.card,
          backgroundColor: colors.card,
          color: colors.textPrimary,
          padding: 14,
          textAlignVertical: "top",
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      />

      <PrimaryPillButton
        label="Save Local Entry"
        disabled={!text.trim()}
        onPress={() => {
          addJournalEntry(text.trim());
          setText("");
        }}
      />

      <SectionTitle>Local entries</SectionTitle>
      {journalEntries.length === 0 ? (
        <Card>
          <Text
            selectable
            style={{
              color: colors.textDim,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              textAlign: "center",
            }}
          >
            No local dream notes yet.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {journalEntries.map((entry) => (
            <Card key={entry.id}>
              <Text
                selectable
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.body.fontSize,
                  lineHeight: typography.body.lineHeight,
                }}
              >
                {entry.text}
              </Text>
              <InfoRow
                label="created"
                value={new Date(entry.createdAt).toLocaleString()}
              />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
