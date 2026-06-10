import type {
  WatchPackageManifestV3,
  WatchRuntimePlanV3,
} from "@/src/native/watchRuntime";

export const WATCH_TRANSPORT_SCHEMA_VERSION =
  "lucidtlr-watch-transport-lab-v1";

export const WATCH_TRANSPORT_MESSAGE_TYPES = {
  planAvailable: "lucidtlr.watch.plan.available",
  planRequest: "lucidtlr.watch.plan.request",
  planFile: "lucidtlr.watch.plan.file",
  planCommitReceipt: "lucidtlr.watch.plan.commit.receipt",
  statusSnapshot: "lucidtlr.watch.status.snapshot",
  packageManifest: "lucidtlr.watch.package.manifest",
  packageFile: "lucidtlr.watch.package.file",
  packageAck: "lucidtlr.watch.package.ack",
  transportError: "lucidtlr.watch.transport.error",
} as const;

export type WatchTransportMessageType =
  (typeof WATCH_TRANSPORT_MESSAGE_TYPES)[keyof typeof WATCH_TRANSPORT_MESSAGE_TYPES];

export type WatchTransportSender = "phone" | "watch";

export interface WatchTransportMessageBase {
  schemaVersion: typeof WATCH_TRANSPORT_SCHEMA_VERSION;
  messageType: WatchTransportMessageType;
  messageId: string;
  idempotencyKey: string;
  createdAt: string;
  sender: WatchTransportSender;
  sessionId?: string;
  planHash?: string;
  packageId?: string;
  packageHash?: string;
}

export interface WatchTransportPlanAvailableMessage
  extends WatchTransportMessageBase {
  messageType: typeof WATCH_TRANSPORT_MESSAGE_TYPES.planAvailable;
  sender: "phone";
  sessionId: string;
  planHash: string;
  planJson: string;
  plan: WatchRuntimePlanV3;
}

export interface WatchTransportPlanRequestMessage
  extends WatchTransportMessageBase {
  messageType: typeof WATCH_TRANSPORT_MESSAGE_TYPES.planRequest;
  sender: "phone" | "watch";
}

export interface WatchTransportPlanCommitReceiptMessage
  extends WatchTransportMessageBase {
  messageType: typeof WATCH_TRANSPORT_MESSAGE_TYPES.planCommitReceipt;
  sender: "watch";
  sessionId: string;
  planHash: string;
  commitId: string;
  committedAt: string;
  watchState: string;
}

export interface WatchTransportStatusSnapshotMessage
  extends WatchTransportMessageBase {
  messageType: typeof WATCH_TRANSPORT_MESSAGE_TYPES.statusSnapshot;
  sender: "watch";
  sessionId?: string;
  planHash?: string;
  watchState: string;
  packageId?: string;
  packageHash?: string;
  autoReply?: boolean;
}

export interface WatchTransportPackageManifestMessage
  extends WatchTransportMessageBase {
  messageType: typeof WATCH_TRANSPORT_MESSAGE_TYPES.packageManifest;
  sender: "watch";
  sessionId: string;
  planHash: string;
  packageId: string;
  packageHash: string;
  manifest: WatchPackageManifestV3;
  manifestJson: string;
}

export interface WatchTransportPackageAckMessage
  extends WatchTransportMessageBase {
  messageType: typeof WATCH_TRANSPORT_MESSAGE_TYPES.packageAck;
  sender: "phone";
  sessionId: string;
  planHash: string;
  packageId: string;
  packageHash: string;
  ackedAt: string;
}

export interface WatchTransportErrorMessage extends WatchTransportMessageBase {
  messageType: typeof WATCH_TRANSPORT_MESSAGE_TYPES.transportError;
  errorCode: string;
  errorMessage: string;
}

export type WatchTransportMessage =
  | WatchTransportPlanAvailableMessage
  | WatchTransportPlanRequestMessage
  | WatchTransportPlanCommitReceiptMessage
  | WatchTransportStatusSnapshotMessage
  | WatchTransportPackageManifestMessage
  | WatchTransportPackageAckMessage
  | WatchTransportErrorMessage;

function deterministicMessageId(input: {
  messageType: WatchTransportMessageType;
  sender: WatchTransportSender;
  createdAt: string;
  sessionId?: string;
  planHash?: string;
  packageId?: string;
  packageHash?: string;
}): string {
  return [
    WATCH_TRANSPORT_SCHEMA_VERSION,
    input.messageType,
    input.sender,
    input.sessionId ?? "no-session",
    input.planHash ?? "no-plan",
    input.packageId ?? "no-package",
    input.packageHash ?? "no-package-hash",
    input.createdAt,
  ].join("|");
}

function baseMessage(input: {
  messageType: WatchTransportMessageType;
  sender: WatchTransportSender;
  createdAt: string;
  sessionId?: string;
  planHash?: string;
  packageId?: string;
  packageHash?: string;
}): WatchTransportMessageBase {
  const messageId = deterministicMessageId(input);

  return {
    schemaVersion: WATCH_TRANSPORT_SCHEMA_VERSION,
    messageType: input.messageType,
    messageId,
    idempotencyKey: messageId,
    createdAt: input.createdAt,
    sender: input.sender,
    sessionId: input.sessionId,
    planHash: input.planHash,
    packageId: input.packageId,
    packageHash: input.packageHash,
  };
}

export function buildPlanAvailableTransportMessage(input: {
  plan: WatchRuntimePlanV3;
  createdAt: string;
}): WatchTransportPlanAvailableMessage {
  const base = baseMessage({
    messageType: WATCH_TRANSPORT_MESSAGE_TYPES.planAvailable,
    sender: "phone",
    createdAt: input.createdAt,
    sessionId: input.plan.sessionId,
    planHash: input.plan.planHash,
  });

  return {
    ...base,
    messageType: WATCH_TRANSPORT_MESSAGE_TYPES.planAvailable,
    sender: "phone",
    sessionId: input.plan.sessionId,
    planHash: input.plan.planHash,
    planJson: JSON.stringify(input.plan),
    plan: input.plan,
  };
}

export function buildPlanRequestTransportMessage(input: {
  createdAt: string;
  sessionId?: string;
  planHash?: string;
  sender?: WatchTransportSender;
}): WatchTransportPlanRequestMessage {
  return {
    ...baseMessage({
      messageType: WATCH_TRANSPORT_MESSAGE_TYPES.planRequest,
      sender: input.sender ?? "phone",
      createdAt: input.createdAt,
      sessionId: input.sessionId,
      planHash: input.planHash,
    }),
    messageType: WATCH_TRANSPORT_MESSAGE_TYPES.planRequest,
    sender: input.sender ?? "phone",
  };
}

export function buildPackageAckTransportMessage(input: {
  sessionId: string;
  planHash: string;
  packageId: string;
  packageHash: string;
  ackedAt: string;
}): WatchTransportPackageAckMessage {
  return {
    ...baseMessage({
      messageType: WATCH_TRANSPORT_MESSAGE_TYPES.packageAck,
      sender: "phone",
      createdAt: input.ackedAt,
      sessionId: input.sessionId,
      planHash: input.planHash,
      packageId: input.packageId,
      packageHash: input.packageHash,
    }),
    messageType: WATCH_TRANSPORT_MESSAGE_TYPES.packageAck,
    sender: "phone",
    sessionId: input.sessionId,
    planHash: input.planHash,
    packageId: input.packageId,
    packageHash: input.packageHash,
    ackedAt: input.ackedAt,
  };
}
