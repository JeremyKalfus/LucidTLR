import { usePathname } from "expo-router";
import React from "react";
import { AppState as NativeAppState } from "react-native";

import { getLocalDb } from "@/src/data/local/expoSqliteDb";

import { recordDiagnosticsRouteEvent } from "./diagnosticsRouteStore";

export function DiagnosticsRouteTracker() {
  const pathname = usePathname();
  const currentAppStateRef = React.useRef(NativeAppState.currentState);
  const lastRouteLogRef = React.useRef<string | null>(null);

  const record = React.useCallback(
    (reason: "route_change" | "app_state_change", appState: string) => {
      void getLocalDb()
        .then((db) =>
          recordDiagnosticsRouteEvent({
            db,
            pathname,
            appState,
            reason,
          }),
        )
        .catch(() => {
          // Diagnostics must never affect normal app navigation.
        });
    },
    [pathname],
  );

  React.useEffect(() => {
    const key = `${pathname}:${currentAppStateRef.current}`;

    if (lastRouteLogRef.current === key) {
      return;
    }

    lastRouteLogRef.current = key;
    record("route_change", currentAppStateRef.current);
  }, [pathname, record]);

  React.useEffect(() => {
    const subscription = NativeAppState.addEventListener("change", (state) => {
      currentAppStateRef.current = state;
      record("app_state_change", state);
    });

    return () => subscription.remove();
  }, [record]);

  return null;
}
