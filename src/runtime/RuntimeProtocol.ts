// AetherOS - Runtime Message Protocol for Sandbox Inter-Context Communication

export interface RuntimeInitMessage {
  type: 'init';
  sessionId: string;
  permissions: string[];
}

export interface RuntimeExecuteMessage {
  type: 'execute';
  code: string;
  scriptName?: string;
  args?: string[];
}

export interface RuntimeStdinMessage {
  type: 'stdin';
  chunk: string;
}

export interface RuntimeCancelMessage {
  type: 'cancel';
}

export interface RuntimeStdoutMessage {
  type: 'stdout';
  text: string;
}

export interface RuntimeStderrMessage {
  type: 'stderr';
  text: string;
}

export interface RuntimeExitMessage {
  type: 'exit';
  exitCode: number;
  result?: unknown;
}

export interface RuntimeFsRequest {
  type: 'fs_request';
  id: string;
  method: 'readText' | 'writeText' | 'readBytes' | 'writeBytes' | 'exists' | 'stat';
  path: string;
  content?: string;
  bytesBase64?: string;
}

export interface RuntimeFsResponse {
  type: 'fs_response';
  id: string;
  result?: unknown;
  error?: string;
}

export type HostToGuestMessage =
  | RuntimeInitMessage
  | RuntimeExecuteMessage
  | RuntimeStdinMessage
  | RuntimeCancelMessage
  | RuntimeFsResponse;

export type GuestToHostMessage =
  | RuntimeStdoutMessage
  | RuntimeStderrMessage
  | RuntimeExitMessage
  | RuntimeFsRequest;
