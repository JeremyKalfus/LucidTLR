#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`[ok] ${label}`);
    return;
  }

  failures.push(detail ? `${label}: ${detail}` : label);
  console.error(`[fail] ${label}${detail ? ` - ${detail}` : ""}`);
}

function listFiles(relativeDir, predicate = () => true) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(child, predicate);
    }

    return predicate(child) ? [child] : [];
  });
}

const eas = readJson("eas.json");
const testflightProfile = eas.build?.["testflight-internal-lab"];
const watchAvailability = read("src/features/watchMode/watchModeAvailability.ts");
const internalFlags = read("src/features/internalBuild/internalBuildFlags.ts");
const watchLabScreen = read("src/screens/WatchModeLabScreen.tsx");
const phoneLabRoute = read("app/debug/watch-mode-lab.tsx");
const contentView = read("ios/LucidTLR Watch App/ContentView.swift");
const project = read("ios/LucidTLR.xcodeproj/project.pbxproj");
const home = read("src/screens/HomeScreen.tsx");
const appState = read("src/state/AppState.tsx");
const importer = read("src/features/watchHistory/importWatchPackage.ts");
const transportLab = read("src/features/watchModeLab/watchModeTransportLab.ts");

check(
  "WATCH_MODE_ENABLED remains false",
  /WATCH_MODE_ENABLED\s*=\s*false/.test(watchAvailability),
);
check(
  "testflight-internal-lab profile exists",
  Boolean(testflightProfile),
);
check(
  "testflight-internal-lab uses store distribution",
  testflightProfile?.distribution === "store",
  "profile must be TestFlight/App Store distribution",
);
check(
  "testflight-internal-lab is not a development client profile",
  testflightProfile?.developmentClient !== true,
);
check(
  "JS lab flag is enabled for internal TestFlight profile",
  testflightProfile?.env?.EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED === "true",
);
check(
  "Watch Swift internal lab flag is enabled for internal TestFlight profile",
  String(testflightProfile?.env?.LUCIDTLR_INTERNAL_TESTFLIGHT_SWIFT_FLAGS ?? "").includes(
    "-D LUCIDTLR_INTERNAL_TESTFLIGHT_LAB",
  ),
);
check(
  "normal non-lab profiles do not enable phone lab flag",
  Object.entries(eas.build ?? {}).every(([profileName, profile]) => {
    if (profileName === "testflight-internal-lab") {
      return true;
    }

    return profile?.env?.EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED !== "true";
  }),
);
check(
  "central JS lab availability reads EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED",
  internalFlags.includes("EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED") &&
    internalFlags.includes("WATCH_MODE_PUBLIC_ENABLED = WATCH_MODE_ENABLED"),
);
check(
  "phone lab route exists and delegates to WatchModeLabScreen",
  phoneLabRoute.includes("WatchModeLabScreen"),
);
check(
  "phone lab redirects when lab availability is false",
  watchLabScreen.includes("isWatchModeLabAvailable") &&
    watchLabScreen.includes('router.replace("/settings/watch-mode")'),
);
check(
  "phone lab labels internal/synthetic/public-disabled status",
  watchLabScreen.includes("Internal TestFlight Lab") &&
    watchLabScreen.includes("synthetic / QA only") &&
    watchLabScreen.includes("Public Watch Mode remains disabled"),
);
check(
  "Watch ContentView gates lab behind DEBUG or internal TestFlight flag",
  contentView.includes(
    "#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB",
  ) && contentView.includes("#else") && contentView.includes("placeholder"),
);
check(
  "Xcode project consumes LUCIDTLR_INTERNAL_TESTFLIGHT_SWIFT_FLAGS",
  project.includes("$(LUCIDTLR_INTERNAL_TESTFLIGHT_SWIFT_FLAGS)") &&
    project.includes("OTHER_SWIFT_FLAGS"),
);
check(
  "Home blocks public Watch TLR start",
  /if \(selectedMode === "watch"\) \{\s*showWatchDisabledMessage\(\);\s*return;\s*\}\s*startSession\("tlr"\);/s.test(
    home,
  ),
);
check(
  "Home blocks public Watch sleep-log start",
  /if \(selectedMode === "watch"\) \{\s*showWatchDisabledMessage\(\);\s*return;\s*\}\s*startSession\("sleep_log"\);/s.test(
    home,
  ),
);
check(
  "AppState blocks public Watch session creation",
  /if \(selectedMode === "watch"\) \{\s*throw new Error\(WATCH_MODE_DISABLED_MESSAGE\);/s.test(
    appState,
  ),
);

const watchConnectivityImportFiles = listFiles("ios", (file) => file.endsWith(".swift"))
  .filter((file) => read(file).includes("import WatchConnectivity"))
  .sort();
check(
  "WatchConnectivity imports are lab transport scoped",
  JSON.stringify(watchConnectivityImportFiles) ===
    JSON.stringify([
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
      "ios/LucidTLR/LucidTLRWatchTransport.swift",
    ]),
  watchConnectivityImportFiles.join(", "),
);

const labScopedFiles = [
  "ios/LucidTLR/LucidTLRWatchTransport.swift",
  ...listFiles("ios/LucidTLR Watch App/Connectivity", (file) => file.endsWith(".swift")),
  "src/native/watchTransport/WatchTransportMessages.ts",
  "src/native/watchTransport/NativeWatchTransportTypes.ts",
  "src/native/watchTransport/watchTransportClient.ts",
  "src/native/watchTransport/LucidTLRWatchTransport.ts",
  "src/features/watchModeLab/watchModeTransportLab.ts",
  "src/screens/WatchModeLabScreen.tsx",
  "app/debug/watch-mode-lab.tsx",
];
const labScopedSource = labScopedFiles.map(read).join("\n");
const forbiddenTransportTokens = [
  "import HealthKit",
  "import CoreMotion",
  "import AVFoundation",
  "HKWorkoutSession",
  "startDeviceMotionUpdates",
  "startAccelerometerUpdates",
  "WKInterfaceDevice.play",
  "AVAudioPlayer",
  "sendMessage",
  "prepareAnonymousResearchUpload",
  "dream_upload",
  "upload_queue",
];
for (const token of forbiddenTransportTokens) {
  check(`transport/lab paths do not contain ${token}`, !labScopedSource.includes(token));
}

check(
  "transport uses queued/file transfer, not live messaging",
  labScopedSource.includes("transferUserInfo") &&
    labScopedSource.includes("transferFile") &&
    labScopedSource.includes("updateApplicationContext"),
);
check(
  "importWatchPackage requires a DB transaction before ack eligibility",
  importer.includes("if (!input.db.withTransaction)") &&
    importer.includes("return await input.db.withTransaction") &&
    importer.includes("ackEligible: true"),
);
check(
  "phone ack action is gated by imported ack eligibility",
  transportLab.includes("result.ackEligible") &&
    transportLab.includes("No ack-eligible imported Watch package exists") &&
    transportLab.includes("buildPackageAckTransportMessage"),
);

if (failures.length > 0) {
  console.error(`\nWatch TestFlight lab verification failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\nWatch TestFlight lab verification passed.");
