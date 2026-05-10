import { tool } from "@opencode-ai/plugin"
import {
  formatSessionList,
  renderFullSession,
  summarizeSessionContent,
  validateSessionID,
} from "./core.ts"
import type { SessionClient, SessionOpener } from "./types.ts"

const z = tool.schema

export function createTools(client: SessionClient, opener: SessionOpener) {
  // ── session_list ─────────────────────────────────────────────────────
  const session_list = tool({
    description:
      "List OpenCode sessions. Returns a markdown table by default, or JSON.",
    args: {
      limit: z.number().optional(),
      search: z.string().optional(),
      format: z.enum(["table", "json"]).optional(),
    },
    execute: async (args, _ctx) => {
      const sessions = await client.listSessions({
        limit: args.limit,
        search: args.search,
      })
      return formatSessionList(sessions, args.format ?? "table")
    },
  })

  // ── session_summary ──────────────────────────────────────────────────
  const session_summary = tool({
    description:
      "Get a concise summary of an OpenCode session: metadata, message counts, latest user prompt and assistant response.",
    args: {
      sessionID: z.string(),
      maxMessages: z.number().optional(),
    },
    execute: async (args, _ctx) => {
      try {
        const id = validateSessionID(args.sessionID)
        const info = await client.getSession(id)
        if (!info) return `Session \`${id}\` not found.`

        const msgs = await client.getMessages(id, { limit: args.maxMessages })
        const msgIDs = msgs.map((m) => m.id)
        const parts = await client.getParts(id, msgIDs)

        return summarizeSessionContent(info, msgs, parts, args.maxMessages)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return `Error: ${msg}`
      }
    },
  })

  // ── session_read ─────────────────────────────────────────────────────
  const session_read = tool({
    description:
      "Read the full content of an OpenCode session by ID, including all messages with text parts and metadata.",
    args: {
      sessionID: z.string(),
      limit: z.number().optional(),
      includeParts: z.boolean().optional(),
    },
    execute: async (args, _ctx) => {
      try {
        const id = validateSessionID(args.sessionID)
        const info = await client.getSession(id)
        if (!info) return `Session \`${id}\` not found.`

        const msgs = await client.getMessages(id, { limit: args.limit })
        const msgIDs = msgs.map((m) => m.id)
        const parts = await client.getParts(id, msgIDs)

        return renderFullSession(info, msgs, parts, args.includeParts !== false)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return `Error: ${msg}`
      }
    },
  })

  // ── session_open ─────────────────────────────────────────────────────
  const session_open = tool({
    description:
      "Open an OpenCode session by ID in the TUI. The session must exist and the TUI must be connected.",
    args: {
      sessionID: z.string(),
    },
    execute: async (args, _ctx) => {
      try {
        const id = validateSessionID(args.sessionID)
        const result = await opener.open(id)
        return result.message
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return `Error: ${msg}`
      }
    },
  })

  return {
    session_list,
    session_summary,
    session_read,
    session_open,
  }
}
