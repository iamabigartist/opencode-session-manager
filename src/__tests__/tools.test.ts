import { describe, expect, mock, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { createTools } from "../tools.ts"
import type {
  MessageInfo,
  PartInfo,
  SessionClient,
  SessionInfo,
  SessionOpener,
} from "../types.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a ToolResult to a plain string. */
function asString(
  result: string | { output: string; metadata?: Record<string, unknown> },
): string {
  return typeof result === "string" ? result : result.output
}

/** Build a minimal ToolContext suitable for tests. */
function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    sessionID: "test",
    messageID: "msg-1",
    agent: "test-agent",
    directory: "/tmp",
    worktree: "/tmp",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: () => Effect.succeed(undefined),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Fake adapters
// ---------------------------------------------------------------------------
function fakeClient(
  sessions: SessionInfo[],
  messages: Record<string, MessageInfo[]>,
  parts: Record<string, Record<string, PartInfo[]>>,
): SessionClient {
  return {
    listSessions: mock(async (args) => {
      let result = [...sessions]
      if (args.search) {
        const q = args.search.toLowerCase()
        result = result.filter(
          (s) =>
            s.title?.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q),
        )
      }
      if (args.limit !== undefined) result = result.slice(0, args.limit)
      return result
    }),
    getSession: mock(async (id) => sessions.find((s) => s.id === id) ?? null),
    getMessages: mock(
      async (id, opts) =>
        (opts?.limit !== undefined
          ? messages[id]?.slice(0, opts.limit)
          : messages[id]) ?? [],
    ),
    getParts: mock(async (_sid, msgIDs) => {
      const out: Record<string, PartInfo[]> = {}
      for (const mid of msgIDs) {
        for (const sid of Object.keys(parts)) {
          if (parts[sid]?.[mid]) out[mid] = parts[sid][mid]
        }
      }
      return out
    }),
  }
}

function fakeOpener(): SessionOpener {
  return {
    open: mock(async (id) => {
      if (id === "ses_not_found") {
        return { success: false, message: "Session not found" }
      }
      return { success: true, message: `Opened session ${id}` }
    }),
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const sessions: SessionInfo[] = [
  {
    id: "ses_1",
    title: "First session",
    directory: "/home/user",
    timeCreated: 100,
    timeUpdated: 300,
    messageCount: 2,
  },
  {
    id: "ses_2",
    title: "Second session",
    directory: "/tmp",
    timeCreated: 200,
    timeUpdated: 400,
    messageCount: 5,
  },
]

const messages: Record<string, MessageInfo[]> = {
  ses_1: [
    { id: "m1", sessionID: "ses_1", role: "user", time: 100 },
    { id: "m2", sessionID: "ses_1", role: "assistant", time: 200 },
  ],
}

const parts: Record<string, Record<string, PartInfo[]>> = {
  ses_1: {
    m1: [{ id: "p1", messageID: "m1", type: "text", text: "Help me" }],
    m2: [{ id: "p2", messageID: "m2", type: "text", text: "Sure" }],
  },
}

const ctx = makeCtx()

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("session_list tool", () => {
  test("formats sessions into a markdown table by default", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_list.execute({}, ctx)

    expect(asString(result)).toContain("ses_1")
    expect(asString(result)).toContain("ses_2")
    expect(asString(result)).toContain("First session")
    expect(asString(result)).toContain("Second session")
  })

  test("returns JSON when format is json", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_list.execute({ format: "json" }, ctx)

    const parsed = JSON.parse(asString(result))
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(2)
  })

  test("passes limit to client", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    await tools.session_list.execute({ limit: 1 }, ctx)

    const listMock = client.listSessions as ReturnType<typeof mock>
    expect(listMock).toHaveBeenCalledWith({ limit: 1, search: undefined })
  })

  test("passes search to client", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    await tools.session_list.execute({ search: "First" }, ctx)

    const listMock = client.listSessions as ReturnType<typeof mock>
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: "First" }),
    )
  })
})

describe("session_summary tool", () => {
  test("rejects invalid session ID", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_summary.execute(
      { sessionID: "abc123" },
      ctx,
    )

    expect(asString(result)).toContain("must start with")
  })

  test("returns not-found message for missing session", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_summary.execute(
      { sessionID: "ses_nonexistent" },
      ctx,
    )

    expect(asString(result)).toContain("not found")
  })

  test("produces summary for existing session", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_summary.execute(
      { sessionID: "ses_1" },
      ctx,
    )

    const s = asString(result)
    expect(s).toContain("ses_1")
    expect(s).toContain("First session")
    expect(s).toContain("Help me") // latest user prompt
  })

  test("passes maxMessages to summary", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    await tools.session_summary.execute(
      { sessionID: "ses_1", maxMessages: 1 },
      ctx,
    )

    const msgsMock = client.getMessages as ReturnType<typeof mock>
    expect(msgsMock).toHaveBeenCalledWith("ses_1", { limit: 1 })
  })
})

describe("session_read tool", () => {
  test("rejects invalid session ID", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_read.execute(
      { sessionID: "bad" },
      ctx,
    )

    expect(asString(result)).toContain("must start with")
  })

  test("returns not-found for missing session", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_read.execute(
      { sessionID: "ses_notfound" },
      ctx,
    )

    expect(asString(result)).toContain("not found")
  })

  test("renders full session content", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_read.execute(
      { sessionID: "ses_1" },
      ctx,
    )

    const s = asString(result)
    expect(s).toContain("ses_1")
    expect(s).toContain("Help me")
    expect(s).toContain("Sure")
  })
})

describe("session_open tool", () => {
  test("rejects invalid session ID", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_open.execute({ sessionID: "" }, ctx)

    expect(asString(result)).toContain("must start with")
  })

  test("calls opener with valid session ID", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_open.execute(
      { sessionID: "ses_1" },
      ctx,
    )

    const openMock = opener.open as ReturnType<typeof mock>
    expect(openMock).toHaveBeenCalledWith("ses_1")
    expect(asString(result)).toContain("Opened session ses_1")
  })

  test("reports failure from opener", async () => {
    const client = fakeClient(sessions, messages, parts)
    const opener = fakeOpener()
    const tools = createTools(client, opener)

    const result = await tools.session_open.execute(
      { sessionID: "ses_not_found" },
      ctx,
    )

    expect(asString(result)).toContain("Session not found")
  })
})
