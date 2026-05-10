/** Session metadata returned from the API / database. */
export interface SessionInfo {
  id: string
  title?: string
  directory?: string
  projectID?: string
  parentID?: string
  timeCreated?: number
  timeUpdated?: number
  messageCount?: number
}

/** A single message inside a session. */
export interface MessageInfo {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: number
  agent?: string
  model?: string
}

/** Content part within a message. */
export interface PartInfo {
  id: string
  messageID: string
  type: string
  text?: string
  toolName?: string
  toolID?: string
}

/** Full session content: metadata + ordered messages with parts. */
export interface SessionContent {
  info: SessionInfo
  messages: Array<{
    message: MessageInfo
    parts: PartInfo[]
  }>
}

/** Arguments for the session_list tool. */
export interface SessionListArgs {
  limit?: number
  search?: string
  format?: "table" | "json"
}

/** Arguments for the session_summary tool. */
export interface SessionSummaryArgs {
  sessionID: string
  maxMessages?: number
}

/** Arguments for the session_read tool. */
export interface SessionReadArgs {
  sessionID: string
  limit?: number
  includeParts?: boolean
}

/** Arguments for the session_open tool. */
export interface SessionOpenArgs {
  sessionID: string
}

/** Interface for fetching session data (HTTP / SDK client). */
export interface SessionClient {
  listSessions(args: {
    limit?: number
    search?: string
  }): Promise<SessionInfo[]>
  getSession(sessionID: string): Promise<SessionInfo | null>
  getMessages(
    sessionID: string,
    opts?: { limit?: number },
  ): Promise<MessageInfo[]>
  getParts(
    sessionID: string,
    messageIDs: string[],
  ): Promise<Record<string, PartInfo[]>>
}

/** Interface for opening a session. */
export interface SessionOpener {
  open(sessionID: string): Promise<{ success: boolean; message: string }>
}

/** Structured errors returned to the tool caller. */
export class SessionError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_id" | "not_found" | "internal",
  ) {
    super(message)
    this.name = "SessionError"
  }
}
