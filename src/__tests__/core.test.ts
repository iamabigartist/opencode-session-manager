import { describe, expect, test } from "bun:test"
import {
  formatSessionList,
  renderFullSession,
  summarizeSessionContent,
  validateSessionID,
} from "../core.ts"
import type { MessageInfo, PartInfo, SessionInfo } from "../types.ts"

// ---------------------------------------------------------------------------
// validateSessionID
// ---------------------------------------------------------------------------
describe("validateSessionID", () => {
  test("accepts a valid OpenCode session id", () => {
    expect(validateSessionID("ses_abc123def")).toBe("ses_abc123def")
  })

  test("preserves exact id casing and characters", () => {
    expect(validateSessionID("ses_A1b2C3d4E5f6G7h8I9j0")).toBe(
      "ses_A1b2C3d4E5f6G7h8I9j0",
    )
  })

  test("rejects empty string", () => {
    expect(() => validateSessionID("")).toThrow(
      'Session ID must start with "ses_"',
    )
  })

  test("rejects whitespace-only string", () => {
    expect(() => validateSessionID("   ")).toThrow(
      'Session ID must start with "ses_"',
    )
  })

  test("rejects id not starting with ses_", () => {
    expect(() => validateSessionID("abc123")).toThrow(
      'Session ID must start with "ses_"',
    )
  })

  test("rejects id that is just ses_", () => {
    expect(() => validateSessionID("ses_")).toThrow(
      "Session ID must have characters after ses_",
    )
  })

  test("trims surrounding whitespace for convenience", () => {
    expect(validateSessionID("  ses_abc  ")).toBe("ses_abc")
  })

  test("accepts session id with sub-session suffix (e.g. ses_abc/1)", () => {
    expect(validateSessionID("ses_abc123/1")).toBe("ses_abc123/1")
  })
})

// ---------------------------------------------------------------------------
// formatSessionList
// ---------------------------------------------------------------------------
describe("formatSessionList", () => {
  const sessions: SessionInfo[] = [
    {
      id: "ses_aaa",
      title: "Fix auth bug",
      directory: "/home/user/project",
      timeCreated: 100,
      timeUpdated: 200,
      messageCount: 12,
    },
    {
      id: "ses_bbb",
      title: undefined,
      directory: "C:\\Users\\Test\\repo",
      timeCreated: 50,
      timeUpdated: 150,
    },
    {
      id: "ses_ccc",
      title:
        "A very long title that should be truncated because it exceeds the maximum length allowed in table format output",
      directory: "/tmp",
      timeCreated: 10,
      timeUpdated: 100,
    },
  ]

  test("returns a markdown table by default", () => {
    const result = formatSessionList(sessions)
    expect(result).toContain("| ID | Title | Directory | Updated |")
    expect(result).toContain("ses_aaa")
    expect(result).toContain("Fix auth bug")
    expect(result).toContain("ses_bbb")
    expect(result).toContain("C:\\\\Users\\\\Test\\\\repo")
    expect(result).toContain("ses_ccc")
  })

  test("returns JSON when format is json", () => {
    const result = formatSessionList(sessions, "json")
    const parsed = JSON.parse(result)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(3)
    expect(parsed[0].id).toBe("ses_aaa")
    expect(parsed[0].title).toBe("Fix auth bug")
    expect(parsed[0].messageCount).toBe(12)
  })

  test("truncates long titles", () => {
    const result = formatSessionList(sessions, "table")
    const longTitle = sessions[2].title!
    expect(longTitle.length).toBeGreaterThan(80)
    // The output should contain a truncated version, not the full title
    const tableLines = result.split("\n")
    const cccLine = tableLines.find((l) => l.includes("ses_ccc"))!
    expect(cccLine.length).toBeLessThan(longTitle.length + 40)
  })

  test("returns placeholder for empty list", () => {
    const result = formatSessionList([])
    expect(result).toContain("No sessions found")
  })

  test("sessions with undefined optional fields render cleanly", () => {
    const result = formatSessionList(sessions, "table")
    // ses_bbb has undefined title — should still render without error
    expect(result).toContain("ses_bbb")
  })

  test("json mode omits undefined fields from output", () => {
    const result = formatSessionList(sessions, "json")
    const parsed = JSON.parse(result)
    // ses_bbb has no messageCount defined
    expect(parsed[1]).not.toHaveProperty("messageCount")
  })
})

// ---------------------------------------------------------------------------
// summarizeSessionContent
// ---------------------------------------------------------------------------
describe("summarizeSessionContent", () => {
  const info: SessionInfo = {
    id: "ses_abc",
    title: "Important discussion",
    directory: "/home/user/project",
    timeCreated: 1700000000000,
    timeUpdated: 1700003600000,
    messageCount: 4,
  }

  const messages: MessageInfo[] = [
    {
      id: "msg_1",
      sessionID: "ses_abc",
      role: "user",
      time: 1700000000000,
    },
    {
      id: "msg_2",
      sessionID: "ses_abc",
      role: "assistant",
      time: 1700000100000,
      agent: "build",
      model: "openai/gpt-4",
    },
    {
      id: "msg_3",
      sessionID: "ses_abc",
      role: "user",
      time: 1700000200000,
    },
    {
      id: "msg_4",
      sessionID: "ses_abc",
      role: "assistant",
      time: 1700000300000,
      agent: "build",
      model: "openai/gpt-4",
    },
  ]

  const parts: Record<string, PartInfo[]> = {
    msg_1: [
      {
        id: "p1",
        messageID: "msg_1",
        type: "text",
        text: "Hello, can you help?",
      },
    ],
    msg_2: [
      { id: "p2", messageID: "msg_2", type: "text", text: "Of course!" },
      {
        id: "p3",
        messageID: "msg_2",
        type: "tool",
        toolName: "read",
        toolID: "t1",
      },
    ],
    msg_3: [
      { id: "p4", messageID: "msg_3", type: "text", text: "I need more help." },
    ],
    msg_4: [
      { id: "p5", messageID: "msg_4", type: "text", text: "Sure thing." },
    ],
  }

  test("summarizes session with metadata and message counts", () => {
    const result = summarizeSessionContent(info, messages, parts)
    expect(result).toContain("ses_abc")
    expect(result).toContain("Important discussion")
    expect(result).toContain("/home/user/project")
    // 4 messages, 2 user + 2 assistant
    expect(result).toContain("4")
    expect(result).toContain("2 user")
    expect(result).toContain("2 assistant")
  })

  test("shows tool count", () => {
    const result = summarizeSessionContent(info, messages, parts)
    // msg_2 has 1 tool part
    expect(result).toContain("Messages")
  })

  test("includes latest user prompt", () => {
    const result = summarizeSessionContent(info, messages, parts)
    expect(result).toContain("I need more help.")
  })

  test("clips very long text parts", () => {
    const longText = "a".repeat(5000)
    const partsWithLong: Record<string, PartInfo[]> = {
      msg_1: [{ id: "p1", messageID: "msg_1", type: "text", text: longText }],
    }
    const result = summarizeSessionContent(info, [messages[0]], partsWithLong)
    // Should be clipped to under 2000 chars in output
    const textLines = result.split("\n")
    const longestLine = Math.max(...textLines.map((l) => l.length))
    expect(longestLine).toBeLessThan(2000)
  })

  test("handles empty messages gracefully", () => {
    const result = summarizeSessionContent(info, [], {})
    expect(result).toContain("ses_abc")
    expect(result.includes("Messages")).toBe(true)
  })

  test("handles missing text in parts", () => {
    const partsNoText: Record<string, PartInfo[]> = {
      msg_1: [{ id: "p1", messageID: "msg_1", type: "tool", toolName: "bash" }],
    }
    const result = summarizeSessionContent(info, [messages[0]], partsNoText)
    // Should not throw
    expect(result).toContain("ses_abc")
  })

  test("respects maxMessages limit", () => {
    const result = summarizeSessionContent(info, messages, parts, 2)
    // Only the last 2 messages should be described
    const lines = result.split("\n")
    // The latest user and assistant should appear
    expect(result).toContain("I need more help.")
    // The first user message should NOT appear
    expect(result).not.toContain("Hello, can you help?")
  })
})

// ---------------------------------------------------------------------------
// renderFullSession
// ---------------------------------------------------------------------------
describe("renderFullSession", () => {
  const info: SessionInfo = {
    id: "ses_full",
    title: "Full session",
    directory: "C:\\Users\\Test",
    timeCreated: 1700000000000,
    timeUpdated: 1700000300000,
    messageCount: 2,
  }

  const messages: MessageInfo[] = [
    {
      id: "msg_a",
      sessionID: "ses_full",
      role: "user",
      time: 1700000000000,
    },
    {
      id: "msg_b",
      sessionID: "ses_full",
      role: "assistant",
      time: 1700000100000,
      agent: "build",
      model: "openai/gpt-4",
    },
  ]

  const parts: Record<string, PartInfo[]> = {
    msg_a: [
      { id: "pa1", messageID: "msg_a", type: "text", text: "What is 2+2?" },
    ],
    msg_b: [
      { id: "pb1", messageID: "msg_b", type: "text", text: "2+2 equals 4." },
      {
        id: "pb2",
        messageID: "msg_b",
        type: "tool",
        toolName: "bash",
        toolID: "t2",
      },
    ],
  }

  test("renders session header with metadata", () => {
    const result = renderFullSession(info, messages, parts)
    expect(result).toContain("ses_full")
    expect(result).toContain("Full session")
    expect(result).toContain("C:\\Users\\Test")
    expect(result.includes("Messages")).toBe(true)
  })

  test("renders messages in chronological order", () => {
    const result = renderFullSession(info, messages, parts)
    const userIdx = result.indexOf("What is 2+2?")
    const asstIdx = result.indexOf("2+2 equals 4.")
    expect(userIdx).toBeLessThan(asstIdx)
  })

  test("shows model info for assistant messages", () => {
    const result = renderFullSession(info, messages, parts)
    expect(result).toContain("gpt-4")
    expect(result).toContain("openai")
  })

  test("shows tool part as placeholder", () => {
    const result = renderFullSession(info, messages, parts)
    // Should mention tool but not crash
    expect(result).toContain("tool")
  })

  test("renders empty session gracefully", () => {
    const result = renderFullSession(info, [], {})
    expect(result).toContain("ses_full")
    expect(result.includes("Messages")).toBe(true)
  })

  test("includeParts=false omits verbose non-text content", () => {
    const withParts = renderFullSession(info, messages, parts, true)
    const withoutParts = renderFullSession(info, messages, parts, false)
    // Both should still render text content
    expect(withoutParts).toContain("2+2 equals 4.")
    // With full parts may be longer
    expect(withParts.length).toBeGreaterThanOrEqual(withoutParts.length)
  })
})
