import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import React from "react";
import { Pressable, Switch, Text, View } from "react-native";

import {
  Card,
  DraftTextField,
  InfoRow,
  Screen,
  SectionTitle,
  TimeInput,
} from "@/src/components/ui";
import {
  isFiniteNumberDraft,
  parseFiniteNumberDraft,
} from "@/src/components/ui/draftInput";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  configureRealityCheckNotificationHandler,
  loadRealityCheckSettings,
  rescheduleRealityCheckReminders,
  saveRealityCheckSettings,
} from "@/src/features/realityCheck/realityCheckNotifications";
import {
  clampRealityCheckSettings,
  DEFAULT_REALITY_CHECK_SETTINGS,
  REALITY_CHECK_MAX_REMINDERS,
  REALITY_CHECK_MIN_REMINDERS,
  type RealityCheckSettings,
} from "@/src/features/realityCheck/realityCheckSchedule";
import { colors, typography } from "@/src/theme/tokens";

function RowLabel({ children }: { children: string }) {
  return (
    <Text
      selectable
      style={{
        color: colors.textMuted,
        fontSize: typography.body.fontSize,
        lineHeight: typography.body.lineHeight,
      }}
    >
      {children}
    </Text>
  );
}

export function RealityCheckScreen() {
  const [settings, setSettings] = React.useState<RealityCheckSettings>(
    DEFAULT_REALITY_CHECK_SETTINGS,
  );
  const [scheduledCount, setScheduledCount] = React.useState(0);
  const [permissionDenied, setPermissionDenied] = React.useState(false);
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;

  React.useEffect(() => {
    let cancelled = false;
    configureRealityCheckNotificationHandler();

    async function load() {
      try {
        const db = await getLocalDb();
        const stored = await loadRealityCheckSettings(db);

        if (!cancelled) {
          setSettings(stored);
        }
      } catch {
        // Defaults already cover a failed load.
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const applyChange = React.useCallback(
    (patch: Partial<RealityCheckSettings>) => {
      const next = clampRealityCheckSettings({
        ...settingsRef.current,
        ...patch,
      });
      setSettings(next);

      void (async () => {
        try {
          const db = await getLocalDb();
          await saveRealityCheckSettings(db, next, new Date().toISOString());
          const result = await rescheduleRealityCheckReminders({
            settings: next,
          });
          setScheduledCount(result.scheduled);
          setPermissionDenied(next.enabled && !result.permissionGranted);
        } catch {
          // Keep the optimistic UI state; the next change retries.
        }
      })();
    },
    [],
  );

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          accessibilityLabel="Back to home"
          accessibilityRole="button"
          onPress={() => router.replace("/")}
          style={({ pressed }) => ({
            width: 32,
            height: 32,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.68 : 1,
          })}
        >
          <ChevronLeft color={colors.textMuted} size={24} strokeWidth={1.8} />
        </Pressable>
        <SectionTitle>Reality checks</SectionTitle>
      </View>

      <Card>
        <View
          style={{
            minHeight: 34,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <RowLabel>daytime reminders</RowLabel>
          <Switch
            accessibilityLabel="Reality check reminders"
            value={settings.enabled}
            onValueChange={(enabled) => applyChange({ enabled })}
            trackColor={{ false: colors.cardBorder, true: colors.textDim }}
            ios_backgroundColor={colors.cardBorder}
          />
        </View>

        {settings.enabled ? (
          <View style={{ gap: 12, paddingTop: 4 }}>
            <View style={{ gap: 6 }}>
              <RowLabel>active from</RowLabel>
              <TimeInput
                accessibilityLabel="Reminder window start"
                height={36}
                value={settings.startTime}
                onChangeText={(startTime) => applyChange({ startTime })}
              />
            </View>

            <View style={{ gap: 6 }}>
              <RowLabel>active until</RowLabel>
              <TimeInput
                accessibilityLabel="Reminder window end"
                height={36}
                value={settings.endTime}
                onChangeText={(endTime) => applyChange({ endTime })}
              />
            </View>

            <View style={{ gap: 6 }}>
              <RowLabel>
                {`reminders per day (${REALITY_CHECK_MIN_REMINDERS}-${REALITY_CHECK_MAX_REMINDERS})`}
              </RowLabel>
              <DraftTextField
                height={36}
                isValidDraft={isFiniteNumberDraft}
                keyboardType="numeric"
                value={String(settings.remindersPerDay)}
                onValidDraftChange={(text) => {
                  const value = parseFiniteNumberDraft(text);

                  if (value !== null) {
                    applyChange({ remindersPerDay: value });
                  }
                }}
                style={{ paddingHorizontal: 10 }}
              />
            </View>

            <InfoRow label="scheduled" value={`${scheduledCount} reminders`} />

            {permissionDenied ? (
              <Text
                selectable
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.label.fontSize,
                  lineHeight: typography.label.lineHeight,
                }}
              >
                Notifications are turned off for LucidTLR. Enable them in iOS
                Settings to receive reality-check reminders.
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text
          selectable
          style={{
            color: colors.textDim,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
            paddingTop: 4,
          }}
        >
          Random reminders through the day prompt you to ask &quot;am I
          dreaming?&quot; and do a reality check &mdash; building the habit that
          carries into your dreams.
        </Text>
      </Card>
    </Screen>
  );
}
