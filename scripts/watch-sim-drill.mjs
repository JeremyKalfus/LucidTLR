#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drill = process.argv[2] ?? "baseline";
const appBundleId = "com.jeremykalfus.lucidtlr";
const watchBundleId = "com.jeremykalfus.lucidtlr.watchkitapp";
const deepLinkSchemes = ["lucidtlr", "exp+lucidtlr"];
const labDeepLinkBase = "lucidtlr://debug/watch-mode-lab";
const latestExportFileName = "watch-lab-debug-latest.json";
const derivedDataPath = path.join(os.tmpdir(), "lucidtlr-watch-sim-drill");
const metroHost =
  process.env.LUCIDTLR_DRILL_METRO_HOST ?? detectMetroHostAddress();
const env = {
  ...process.env,
  EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED: "true",
};

let metroProcess = null;

function log(message) {
  console.log(`[watch-sim-drill] ${message}`);
}

function detectMetroHostAddress() {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (
        entry.family === "IPv4" &&
        !entry.internal &&
        typeof entry.address === "string"
      ) {
        return entry.address;
      }
    }
  }

  throw new Error(
    "Could not detect a non-loopback IPv4 address for the simulator Metro URL. Set LUCIDTLR_DRILL_METRO_HOST.",
  );
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    ...options,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed\n${output}`);
  }

  return result.stdout.trim();
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    ...options,
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function simctl(args, options = {}) {
  return run("xcrun", ["simctl", ...args], options);
}

function simctlJson(args) {
  return JSON.parse(simctl([...args, "-j"]));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRuntime(platform) {
  const runtimes = simctlJson(["list", "runtimes"]).runtimes ?? [];
  const candidates = runtimes
    .filter(
      (runtime) =>
        runtime.isAvailable !== false &&
        runtime.platform === platform,
    )
    .sort((a, b) => String(b.version).localeCompare(String(a.version)));

  if (!candidates[0]) {
    throw new Error(`No available ${platform} simulator runtime found.`);
  }

  return candidates[0].identifier;
}

function pickDeviceType(platform, preferredNames) {
  const devicetypes = simctlJson(["list", "devicetypes"]).devicetypes ?? [];
  const productFamily = platform === "iOS" ? "iPhone" : "Apple Watch";
  const available = devicetypes.filter(
    (type) =>
      (type.platform === platform || type.productFamily === productFamily) &&
      type.isAvailable !== false,
  );

  for (const preferred of preferredNames) {
    const match = available.find((type) => type.name.includes(preferred));
    if (match) {
      return match.identifier;
    }
  }

  if (!available[0]) {
    throw new Error(`No available ${platform} simulator device type found.`);
  }

  return available[available.length - 1].identifier;
}

function normalizePair(pair, pairId) {
  const phone = pair.phone ?? pair.iPhone ?? pair.companion;
  const watch = pair.watch ?? pair.watchDevice ?? pair.gizmo;

  if (!phone?.udid || !watch?.udid) {
    return null;
  }

  return {
    pairId,
    phoneUdid: phone.udid,
    watchUdid: watch.udid,
    phoneName: phone.name ?? phone.udid,
    watchName: watch.name ?? watch.udid,
  };
}

function findPairedSimulators() {
  const pairsJson = simctlJson(["list", "pairs"]);
  const pairEntries = Array.isArray(pairsJson.pairs)
    ? pairsJson.pairs.map((pair, index) => [String(index), pair])
    : Object.entries(pairsJson.pairs ?? {});

  for (const [pairId, pair] of pairEntries) {
    const normalized = normalizePair(pair, pairId);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function findPairByDevices(phoneUdid, watchUdid) {
  const pairsJson = simctlJson(["list", "pairs"]);
  const pairEntries = Array.isArray(pairsJson.pairs)
    ? pairsJson.pairs.map((pair, index) => [String(index), pair])
    : Object.entries(pairsJson.pairs ?? {});

  for (const [pairId, pair] of pairEntries) {
    const normalized = normalizePair(pair, pairId);
    if (
      normalized?.phoneUdid === phoneUdid &&
      normalized.watchUdid === watchUdid
    ) {
      return normalized;
    }
  }

  return null;
}

function createPairedSimulators() {
  const iosRuntime = pickRuntime("iOS");
  const watchRuntime = pickRuntime("watchOS");
  const iphoneType = pickDeviceType("iOS", [
    "iPhone 17 Pro",
    "iPhone 16 Pro",
    "iPhone 15 Pro",
    "iPhone 14 Pro",
  ]);
  const watchType = pickDeviceType("watchOS", [
    "Apple Watch Series 11",
    "Apple Watch Series 10",
    "Apple Watch Ultra",
    "Apple Watch Series 9",
  ]);
  const phoneUdid = simctl([
    "create",
    "LucidTLR Drill iPhone",
    iphoneType,
    iosRuntime,
  ]);
  const watchUdid = simctl([
    "create",
    "LucidTLR Drill Watch",
    watchType,
    watchRuntime,
  ]);

  simctl(["pair", watchUdid, phoneUdid]);
  return findPairByDevices(phoneUdid, watchUdid) ?? {
    pairId: undefined,
    phoneUdid,
    watchUdid,
    phoneName: "LucidTLR Drill iPhone",
    watchName: "LucidTLR Drill Watch",
  };
}

function ensurePair() {
  if (
    process.env.LUCIDTLR_DRILL_PHONE_UDID &&
    process.env.LUCIDTLR_DRILL_WATCH_UDID
  ) {
    return findPairByDevices(
      process.env.LUCIDTLR_DRILL_PHONE_UDID,
      process.env.LUCIDTLR_DRILL_WATCH_UDID,
    ) ?? {
      pairId: undefined,
      phoneUdid: process.env.LUCIDTLR_DRILL_PHONE_UDID,
      watchUdid: process.env.LUCIDTLR_DRILL_WATCH_UDID,
      phoneName: process.env.LUCIDTLR_DRILL_PHONE_UDID,
      watchName: process.env.LUCIDTLR_DRILL_WATCH_UDID,
    };
  }

  if (process.env.LUCIDTLR_DRILL_CREATE_PAIR === "1") {
    const created = createPairedSimulators();
    log(`created paired simulators: ${created.phoneUdid} / ${created.watchUdid}`);
    return created;
  }

  const existing = findPairedSimulators();

  if (existing) {
    log(`using paired simulators: ${existing.phoneName} / ${existing.watchName}`);
    return existing;
  }

  const created = createPairedSimulators();
  log(`created paired simulators: ${created.phoneUdid} / ${created.watchUdid}`);
  return created;
}

function bootSimulator(udid) {
  const boot = tryRun("xcrun", ["simctl", "boot", udid]);
  if (!boot.ok && !boot.stderr.includes("current state: Booted")) {
    throw new Error(`Could not boot simulator ${udid}: ${boot.stderr}`);
  }
}

function shutdownSimulator(udid) {
  const shutdown = tryRun("xcrun", ["simctl", "shutdown", udid]);
  if (
    !shutdown.ok &&
    !shutdown.stderr.includes("current state: Shutdown")
  ) {
    throw new Error(`Could not shutdown simulator ${udid}: ${shutdown.stderr}`);
  }
}

function simulatorDataPath(udid) {
  return path.join(
    os.homedir(),
    "Library/Developer/CoreSimulator/Devices",
    udid,
    "data",
  );
}

function writeEmptyPlist(filePath) {
  fs.writeFileSync(
    filePath,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict/>",
      "</plist>",
      "",
    ].join("\n"),
  );
}

function preapproveDeepLinkSchemes(udid) {
  const plistPath = path.join(
    simulatorDataPath(udid),
    "Library/Preferences/com.apple.launchservices.schemeapproval.plist",
  );
  let changed = false;

  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  if (!fs.existsSync(plistPath)) {
    writeEmptyPlist(plistPath);
  }

  for (const scheme of deepLinkSchemes) {
    const approvalKey = `com.apple.CoreSimulator.CoreSimulatorBridge-->${scheme}`;
    const current = tryRun("/usr/libexec/PlistBuddy", [
      "-c",
      `Print :${approvalKey}`,
      plistPath,
    ]);
    if (current.ok && current.stdout === appBundleId) {
      continue;
    }

    const command = current.ok
      ? `Set :${approvalKey} ${appBundleId}`
      : `Add :${approvalKey} string ${appBundleId}`;
    run("/usr/libexec/PlistBuddy", ["-c", command, plistPath]);
    log(`preapproved ${scheme} deep links for ${udid}`);
    changed = true;
  }

  return changed;
}

function buildAndInstall(pair) {
  fs.rmSync(derivedDataPath, { recursive: true, force: true });
  run("xcodebuild", [
    "-workspace",
    "ios/LucidTLR.xcworkspace",
    "-scheme",
    "LucidTLR",
    "-configuration",
    "Debug",
    "-destination",
    `platform=iOS Simulator,id=${pair.phoneUdid}`,
    "-derivedDataPath",
    path.join(derivedDataPath, "iphone"),
    "build",
  ]);
  run("xcodebuild", [
    "-workspace",
    "ios/LucidTLR.xcworkspace",
    "-scheme",
    "LucidTLR Watch App",
    "-configuration",
    "Debug",
    "-destination",
    `platform=watchOS Simulator,id=${pair.watchUdid}`,
    "-derivedDataPath",
    path.join(derivedDataPath, "watch"),
    "build",
  ]);

  simctl([
    "install",
    pair.phoneUdid,
    path.join(
      derivedDataPath,
      "iphone/Build/Products/Debug-iphonesimulator/LucidTLR.app",
    ),
  ]);
  simctl([
    "install",
    pair.watchUdid,
    path.join(
      derivedDataPath,
      "watch/Build/Products/Debug-watchsimulator/LucidTLR Watch App.app",
    ),
  ]);

  if (process.env.LUCIDTLR_DRILL_SKIP_POST_INSTALL_REBOOT !== "1") {
    shutdownSimulator(pair.watchUdid);
    shutdownSimulator(pair.phoneUdid);
    bootSimulator(pair.phoneUdid);
    bootSimulator(pair.watchUdid);
    if (pair.pairId) {
      const activated = tryRun("xcrun", ["simctl", "pair_activate", pair.pairId]);
      if (!activated.ok && !activated.stderr.includes("already active")) {
        throw new Error(
          `Could not activate simulator pair ${pair.pairId}: ${activated.stderr}`,
        );
      }
    }
  }
}

async function waitForMetro() {
  const deadline = Date.now() + 60000;
  const statusUrl = `http://${metroHost}:8081/status`;

  while (Date.now() < deadline) {
    const status = tryRun("curl", ["-sf", statusUrl]);
    if (status.ok && status.stdout.includes("packager-status:running")) {
      return;
    }
    await sleep(1000);
  }

  throw new Error("Metro did not report packager-status:running within 60s.");
}

async function ensureMetro() {
  const statusUrl = `http://${metroHost}:8081/status`;
  const existing = tryRun("curl", ["-sf", statusUrl]);
  if (existing.ok && existing.stdout.includes("packager-status:running")) {
    log(`using existing Metro at ${statusUrl}`);
    return;
  }

  metroProcess = spawn(
    "npx",
    ["expo", "start", "--host", "lan", "--port", "8081"],
    {
      cwd: root,
      env: {
        ...env,
        REACT_NATIVE_PACKAGER_HOSTNAME: metroHost,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  metroProcess.stdout.on("data", (data) =>
    process.stdout.write(`[metro] ${data}`),
  );
  metroProcess.stderr.on("data", (data) =>
    process.stderr.write(`[metro] ${data}`),
  );
  await waitForMetro();
}

function launchApps(pair) {
  tryRun("xcrun", ["simctl", "launch", pair.watchUdid, watchBundleId]);
}

function openDevClient(pair) {
  const url = `exp+lucidtlr://expo-development-client/?url=${encodeURIComponent(
    `http://${metroHost}:8081`,
  )}`;
  simctl(["openurl", pair.phoneUdid, url]);
}

function terminatePhone(pair) {
  tryRun("xcrun", ["simctl", "terminate", pair.phoneUdid, appBundleId]);
}

function terminateWatch(pair) {
  tryRun("xcrun", ["simctl", "terminate", pair.watchUdid, watchBundleId]);
}

function openAutomation(pair, autorun, runId) {
  const url = `${labDeepLinkBase}?autorun=${autorun}&exportTo=file&runId=${encodeURIComponent(runId)}`;
  simctl(["openurl", pair.phoneUdid, url]);
}

function exportFilePath(pair) {
  const container = simctl([
    "get_app_container",
    pair.phoneUdid,
    appBundleId,
    "data",
  ]);

  return path.join(container, "Documents", latestExportFileName);
}

async function waitForExport(pair, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  const deadline = Date.now() + timeoutMs;
  const filePath = exportFilePath(pair);
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(filePath)) {
        const bundle = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (
          !options.afterExportedAt ||
          String(bundle.exportedAt) > options.afterExportedAt
        ) {
          return bundle;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1500);
  }

  throw new Error(
    `Timed out waiting for ${filePath}${lastError ? ` (${lastError})` : ""}`,
  );
}

function latestExportedAt(pair) {
  const filePath = exportFilePath(pair);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")).exportedAt;
  } catch {
    return undefined;
  }
}

async function runAutomation(pair, autorun, label, options = {}) {
  const afterExportedAt = latestExportedAt(pair);
  openAutomation(pair, autorun, `${label}-${Date.now()}`);
  return await waitForExport(pair, {
    afterExportedAt,
    timeoutMs: options.timeoutMs,
  });
}

function assertBundle(bundle, label, options = {}) {
  const assessment = bundle.drillAssessment ?? {};
  const summaries = bundle.summaries ?? {};
  const failures = [];

  if (summaries.finalDrillStatus !== "pass") {
    failures.push(`finalDrillStatus=${summaries.finalDrillStatus}`);
  }
  if (summaries.unresolvedCount !== 0 || assessment.unresolvedCount !== 0) {
    failures.push(
      `unresolvedCount=${summaries.unresolvedCount}/${assessment.unresolvedCount}`,
    );
  }
  if (!assessment.transportCommitReceiptSeen) {
    failures.push("missing commit receipt evidence");
  }
  if (!assessment.transportPackageReceivedSeen) {
    failures.push("missing package manifest/file evidence");
  }
  if (!assessment.transportPackageFileReceivedSeen) {
    failures.push("missing package file receipt evidence");
  }
  if (!assessment.packageFilePersistedSeen) {
    failures.push("missing persisted package file evidence");
  }
  if (!assessment.currentSessionImportedPackageSeen) {
    failures.push("missing current-session import evidence");
  }
  if (!assessment.currentSessionAckEligibleSeen) {
    failures.push("missing current-session ack eligibility");
  }
  if (!assessment.currentSessionAckRecordedSeen) {
    failures.push("missing current-session ack recorded evidence");
  }
  if (assessment.stateRegressionDetected) {
    failures.push("state regression detected");
  }
  if (assessment.mismatchedHashDetected) {
    failures.push("hash mismatch detected");
  }
  if (options.requireDuplicate && !assessment.duplicateRetrySeen) {
    failures.push("duplicate/idempotency evidence missing");
  }
  if (
    options.rejectNothingRunning &&
    JSON.stringify(bundle).toLowerCase().includes("nothing running")
  ) {
    failures.push("unexpected nothing running diagnostic");
  }

  if (failures.length > 0) {
    const reasons = [
      ...(assessment.failureReasons ?? []),
      ...(summaries.failureReasons ?? []),
    ];
    throw new Error(
      `${label} failed assertions:\n- ${failures.join("\n- ")}${
        reasons.length > 0 ? `\nFailure reasons:\n- ${reasons.join("\n- ")}` : ""
      }`,
    );
  }

  log(`${label} passed: session ${assessment.currentTransportSessionId ?? "unknown"}`);
}

async function drillBaseline(pair) {
  await runAutomation(pair, "reset", "baseline-reset", { timeoutMs: 60000 });
  const bundle = await runAutomation(pair, "baseline", "baseline", {
    timeoutMs: 150000,
  });
  assertBundle(bundle, "drill:sim-baseline");
  return bundle;
}

async function drillPhoneReload(pair) {
  await runAutomation(pair, "reset", "phone-reload-reset", { timeoutMs: 60000 });
  const afterExportedAt = latestExportedAt(pair);
  openAutomation(pair, "baseline", `phone-reload-start-${Date.now()}`);
  await sleep(3000);
  terminatePhone(pair);
  await sleep(1500);
  tryRun("xcrun", ["simctl", "launch", pair.phoneUdid, appBundleId]);
  openAutomation(pair, "baseline", `phone-reload-resume-${Date.now()}`);
  const bundle = await waitForExport(pair, {
    afterExportedAt,
    timeoutMs: 180000,
  });
  assertBundle(bundle, "drill:sim-phone-reload");
  return bundle;
}

async function drillWatchReload(pair) {
  await runAutomation(pair, "reset", "watch-reload-reset", { timeoutMs: 60000 });
  const afterExportedAt = latestExportedAt(pair);
  openAutomation(pair, "baseline", `watch-reload-start-${Date.now()}`);
  await sleep(2500);
  terminateWatch(pair);
  await sleep(1500);
  tryRun("xcrun", ["simctl", "launch", pair.watchUdid, watchBundleId]);
  openAutomation(pair, "baseline", `watch-reload-resume-${Date.now()}`);
  const bundle = await waitForExport(pair, {
    afterExportedAt,
    timeoutMs: 180000,
  });
  assertBundle(bundle, "drill:sim-watch-reload");
  return bundle;
}

async function drillDuplicate(pair) {
  await drillBaseline(pair);
  const bundle = await runAutomation(pair, "baseline", "duplicate-rerun", {
    timeoutMs: 150000,
  });
  assertBundle(bundle, "drill:sim-duplicate", {
    requireDuplicate: true,
  });
  return bundle;
}

async function drillUnreachable(pair) {
  await runAutomation(pair, "reset", "unreachable-reset", { timeoutMs: 60000 });
  terminateWatch(pair);
  const afterExportedAt = latestExportedAt(pair);
  openAutomation(pair, "baseline", `unreachable-start-${Date.now()}`);
  await sleep(5000);
  tryRun("xcrun", ["simctl", "launch", pair.watchUdid, watchBundleId]);
  openAutomation(pair, "baseline", `unreachable-resume-${Date.now()}`);
  const bundle = await waitForExport(pair, {
    afterExportedAt,
    timeoutMs: 180000,
  });
  assertBundle(bundle, "drill:sim-unreachable", {
    rejectNothingRunning: true,
  });
  return bundle;
}

async function runDrillSet(pair) {
  await drillBaseline(pair);
  await drillPhoneReload(pair);
  await drillWatchReload(pair);
  await drillDuplicate(pair);
  await drillUnreachable(pair);
}

async function main() {
  const pair = ensurePair();
  const approvalChanged = preapproveDeepLinkSchemes(pair.phoneUdid);
  if (approvalChanged) {
    shutdownSimulator(pair.phoneUdid);
  }
  bootSimulator(pair.phoneUdid);
  bootSimulator(pair.watchUdid);
  await ensureMetro();
  buildAndInstall(pair);
  launchApps(pair);
  openDevClient(pair);
  await sleep(8000);

  switch (drill) {
    case "baseline":
      await drillBaseline(pair);
      break;
    case "phone-reload":
      await drillPhoneReload(pair);
      break;
    case "watch-reload":
      await drillWatchReload(pair);
      break;
    case "duplicate":
      await drillDuplicate(pair);
      break;
    case "unreachable":
      await drillUnreachable(pair);
      break;
    case "all":
      await runDrillSet(pair);
      break;
    case "soak":
      for (let index = 1; index <= 10; index += 1) {
        log(`soak run ${index}/10`);
        await runDrillSet(pair);
      }
      break;
    default:
      throw new Error(`Unknown drill: ${drill}`);
  }
}

process.on("exit", () => {
  if (metroProcess) {
    metroProcess.kill("SIGTERM");
  }
});

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (metroProcess) {
    metroProcess.kill("SIGTERM");
  }
  process.exit(1);
}
