import type { WatchSealedPackageV3 } from "@/src/features/watchHistory/watchPackageImportTypes";
import type { WatchRuntimePlanV3 } from "@/src/native/watchRuntime";

import type {
  WatchTransportPackageAckMessage,
  WatchTransportPlanAvailableMessage,
  WatchTransportPlanRequestMessage,
} from "./WatchTransportMessages";

export interface NativeWatchPackageTransferStatus {
  attemptId: string;
  sessionId: string;
  planHash: string;
  packageId: string;
  packageHash: string;
  stage: string;
  startedAt: string;
  queuedAt?: string;
  finishedAt?: string;
  manifestJsonByteCount: number;
  packageFileByteCount: number;
  fileExists: boolean;
  outstandingUserInfoTransferCount: number;
  outstandingFileTransferCount: number;
  errorMessage?: string;
}

export interface NativeWatchTransportStatus {
  available: boolean;
  unavailableReason?: string;
  activationState: string;
  paired: boolean;
  watchAppInstalled: boolean;
  reachable: boolean;
  isReachableInformationalOnly: true;
  lastMessageType?: string;
  lastMessageAt?: string;
  lastError?: string;
  latestStagedPlanId?: string;
  latestStagedPlanHash?: string;
  latestCommitReceipt?: {
    sessionId: string;
    planHash: string;
    commitId?: string;
    committedAt?: string;
    watchState?: string;
    matchesStagedPlan?: boolean;
  };
  recentIncomingMessageIds?: string[];
  duplicateIgnoredCount?: number;
  latestIgnoredDuplicate?: {
    messageType?: string;
    messageId?: string;
    ignoredAt?: string;
  };
  latestStatusSnapshot?: {
    sessionId?: string;
    planHash?: string;
    watchState?: string;
    packageId?: string;
    packageHash?: string;
    createdAt?: string;
    packageTransfer?: NativeWatchPackageTransferStatus;
    matchesStagedPlan?: boolean;
    watchStaleIgnoredSummary?: string;
    watchStaleIgnoredCount?: number;
    watchDuplicateIgnoredCount?: number;
  };
  latestPackageTransfer?: NativeWatchPackageTransferStatus;
  latestPackageManifest?: {
    sessionId: string;
    planHash: string;
    packageId: string;
    packageHash: string;
    receivedAt?: string;
    matchesStagedPlan?: boolean;
  };
  latestReceivedPackage?: {
    sessionId: string;
    planHash: string;
    packageId: string;
    packageHash: string;
    receivedAt?: string;
    fileByteCount?: number;
    sourceExistsBeforeCopy?: boolean;
    persisted?: boolean;
    hashVerification?: string;
    matchesStagedPlan?: boolean;
  };
  latestPackageFile?: {
    sessionId: string;
    planHash: string;
    packageId: string;
    packageHash: string;
    receivedAt?: string;
    fileByteCount?: number;
    sourceExistsBeforeCopy?: boolean;
    persisted?: boolean;
    errorMessage?: string;
    hashVerification?: string;
    matchesStagedPlan?: boolean;
  };
  latestAck?: {
    sessionId: string;
    planHash: string;
    packageId: string;
    packageHash: string;
    ackedAt?: string;
    matchesStagedPlan?: boolean;
  };
}

export interface NativeWatchTransportModule {
  activateTransport: () => Promise<NativeWatchTransportStatus>;
  getTransportStatus: () => Promise<NativeWatchTransportStatus>;
  stageSyntheticPlan: (
    message: WatchTransportPlanAvailableMessage,
  ) => Promise<NativeWatchTransportStatus>;
  requestWatchStatus: (
    message: WatchTransportPlanRequestMessage,
  ) => Promise<NativeWatchTransportStatus>;
  getLatestReceivedSyntheticPackage: () => Promise<WatchSealedPackageV3 | null>;
  sendAckForImportedPackage: (
    message: WatchTransportPackageAckMessage,
  ) => Promise<NativeWatchTransportStatus>;
  clearLabTransportStatus: () => Promise<NativeWatchTransportStatus>;
}

export interface WatchTransportClient {
  isAvailable: () => boolean;
  activateTransport: () => Promise<NativeWatchTransportStatus>;
  getTransportStatus: () => Promise<NativeWatchTransportStatus>;
  stageSyntheticPlan: (
    message: WatchTransportPlanAvailableMessage,
  ) => Promise<NativeWatchTransportStatus>;
  requestWatchStatus: (
    message: WatchTransportPlanRequestMessage,
  ) => Promise<NativeWatchTransportStatus>;
  getLatestReceivedSyntheticPackage: () => Promise<WatchSealedPackageV3 | null>;
  sendAckForImportedPackage: (
    message: WatchTransportPackageAckMessage,
  ) => Promise<NativeWatchTransportStatus>;
  clearLabTransportStatus: () => Promise<NativeWatchTransportStatus>;
}

export interface WatchTransportUnavailableOptions {
  platform: string;
  nativeModule?: Partial<NativeWatchTransportModule>;
}

export type WatchTransportStagePlanInput = {
  plan: WatchRuntimePlanV3;
  createdAt: string;
};
