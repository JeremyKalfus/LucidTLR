import { Text } from "react-native";

import { Card, Screen, SectionTitle } from "@/src/components/ui";
import { colors, typography } from "@/src/theme/tokens";

function GuideCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Card>
      <Text
        selectable
        style={{
          color: colors.textPrimary,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {title}
      </Text>
      <Text
        selectable
        style={{
          color: colors.textSecondary,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {body}
      </Text>
    </Card>
  );
}

export function GuideScreen() {
  return (
    <Screen>
      <SectionTitle>Guide</SectionTitle>

      <GuideCard
        title="What TLR is"
        body="Targeted lucidity reactivation pairs a distinctive cue with a lucid mindset before sleep, then may replay that cue during sleep."
      />
      <GuideCard
        title="Phone Mode"
        body="Phone Mode uses presleep training, late-night cueing, and phone movement as an arousal signal while the phone rests beside the pillow."
      />
      <GuideCard
        title="Watch Mode"
        body="Watch Mode uses Apple Watch sensing for heart rate, motion, and elapsed session time while the iPhone remains the cue playback device."
      />
      <GuideCard
        title="Expectations"
        body="Results are not guaranteed. LucidCue is not a medical treatment."
      />
    </Screen>
  );
}
