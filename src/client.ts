import type { MessageInfo, PartInfo, SessionClient, SessionInfo } from "./types.ts"

// ---------------------------------------------------------------------------
// SDK shape helpers – keep the runtime contract minimal and typed internally
// ---------------------------------------------------------------------------

interface SdkLike {
  session: {
    list(input?: Record<string, unknown>): Promise<unknown>
    get(input: Record<string, unknown>): Promise<unknown>
    messages(input: Record<string, unknown>): Promise<unknown>
  }
}

/** Unwrap `(result as Record).data` when it is an array, else return `[]`. */
function dataArray(result: unknown): Array<Record<string, unknown>> {
  const arr = (result as Record<string, unknown>).data
  return Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : []
}

/** Unwrap `(result as Record).data` when it is a record, else return `null`. */
function dataRecord(
  result: unknown,
): Record<string, unknown> | null {
  const val = (result as Record<string, unknown>).data
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : null
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function toSessionInfo(raw: Record<string, unknown>): SessionInfo {
  const time = isRecord(raw.time) ? raw.time : null
  return {
    id: String(raw.id ?? ""),
    title: stringOrUndefined(raw.title),
    directory: stringOrUndefined(raw.directory),
    timeCreated: numberOrUndefined(time?.created),
    timeUpdated: numberOrUndefined(time?.updated),
    ...(raw.parentID !== undefined ? { parentID: String(raw.parentID) } : {}),
  }
}

function toMessageInfo(
  raw: Record<string, unknown>,
  sessionID: string,
): MessageInfo {
  const time = isRecord(raw.time) ? raw.time : null
  const createdAt = numberOrUndefined(time?.created) ?? numberOrUndefined(raw.time)
  const role: MessageInfo["role"] =
    String(raw.role ?? "user") === "assistant" ? "assistant" : "user"
  const agent = stringOrUndefined(raw.agent)
  const model = stringOrUndefined(raw.model)

  return {
    id: String(raw.id ?? ""),
    sessionID,
    role,
    time: createdAt ?? 0,
    ...(agent ? { agent } : {}),
    ...(model ? { model } : {}),
  }
}

function toPartInfo(raw: Record<string, unknown>): PartInfo {
  return {
    id: String(raw.id ?? ""),
    messageID: String(raw.messageID ?? ""),
    type: String(raw.type ?? "text") as PartInfo["type"],
    ...(typeof raw.text === "string" ? { text: raw.text } : {}),
    ...((raw.toolName || raw.tool) !== undefined
      ? { toolName: String(raw.toolName ?? raw.tool) }
      : {}),
    ...((raw.toolID || raw.callID) !== undefined
      ? { toolID: String(raw.toolID ?? raw.callID) }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createClient(sdk: SdkLike): SessionClient {
  const sess = sdk.session

  return {
    async listSessions(args) {
      const params: Record<string, string> = {}
      if (args.limit !== undefined) params.limit = String(args.limit)
      if (args.search !== undefined) params.search = args.search

      const result = await sess.list(
        Object.keys(params).length > 0 ? { query: params } : undefined,
      )
      return dataArray(result).map(toSessionInfo)
    },

    async getSession(sessionID) {
      try {
        const result = await sess.get({ path: { id: sessionID } })
        const data = dataRecord(result)
        return data ? toSessionInfo(data) : null
      } catch {
        return null
      }
    },

    async getMessages(sessionID, opts) {
      const params: Record<string, string> = {}
      if (opts?.limit !== undefined) params.limit = String(opts.limit)

      const result = await sess.messages({
        path: { id: sessionID },
        query: Object.keys(params).length > 0 ? params : undefined,
      })

      return dataArray(result).map((entry) => {
        const info = isRecord(entry.info) ? entry.info : entry
        return toMessageInfo(info as Record<string, unknown>, sessionID)
      })
    },

    async getParts(sessionID, messageIDs) {
      const requested = new Set(messageIDs)
      const result = await sess.messages({ path: { id: sessionID } })

      const out: Record<string, PartInfo[]> = {}
      for (const entry of dataArray(result)) {
        const info = isRecord(entry.info) ? entry.info : entry
        const mid = String(
          (info as Record<string, unknown>).id ?? "",
        )
        if (!requested.has(mid)) continue

        const parts = entry.parts
        if (Array.isArray(parts)) {
          out[mid] = parts.map((p: unknown) =>
            toPartInfo(p as Record<string, unknown>),
          )
        }
      }
      return out
    },
  }
}
