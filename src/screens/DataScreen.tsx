import { Text, View } from "react-native";

import {
  Card,
  InfoRow,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

export function DataScreen() {
  const { sessionHistory } = useAppState();

  return (
    <Screen>
      <SectionTitle>Data</SectionTitle>

      {sessionHistory.length === 0 ? (
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
            No local sessions yet.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {sessionHistory.map((session) => (
            <Card key={session.id}>
              <InfoRow label="session" value={session.sessionType} />
              <InfoRow label="mode" value={session.mode ?? "none"} />
              <InfoRow label="status" value={session.status.replaceAll("_", " ")} />
              <InfoRow
                label="started"
                value={new Date(session.startedAt).toLocaleString()}
              />
            </Card>
          ))}
        </View>
      )}

      <SectionTitle>Timeline placeholders</SectionTitle>
      <Card>
        <InfoRow label="cue events" value="local placeholder" />
        <InfoRow label="movement/arousal events" value="local placeholder" />
        <InfoRow label="watch epochs" value="not implemented" />
        <InfoRow label="estimated REM" value="classifier TBD" />
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
          This screen shows local session placeholders only. No Supabase sync,
          REM classifier, or native watch/overnight data path is active yet.
        </Text>
      </Card>
    </Screen>
  );
}
