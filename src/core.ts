import type { MessageInfo, PartInfo, SessionInfo } from "./types.ts"
import { SessionError } from "./types.ts"

// ---------------------------------------------------------------------------
// Session ID validation
// ---------------------------------------------------------------------------
const SESSION_ID_RE = /^ses_\S+$/

export function validateSessionID(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("ses_")) {
    throw new SessionError('Session ID must start with "ses_"', "invalid_id")
  }
  if (trimmed.length === 4) {
    throw new SessionError(
      "Session ID must have characters after ses_",
      "invalid_id",
    )
  }
  // Allow sub-session suffix: ses_abc123/1
  if (!SESSION_ID_RE.test(trimmed.split("/")[0])) {
    throw new SessionError('Session ID must start with "ses_"', "invalid_id")
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// Session list formatting
// ---------------------------------------------------------------------------
const TITLE_MAX = 60

export function formatSessionList(
  sessions: SessionInfo[],
  format: "table" | "json" = "table",
): string {
  if (sessions.length === 0) {
    return "No sessions found."
  }

  if (format === "json") {
    const cleaned = sessions.map((s) => {
      const out: Record<string, unknown> = { id: s.id }
      if (s.title !== undefined) out.title = s.title
      if (s.directory !== undefined) out.directory = s.directory
      out.timeCreated = s.timeCreated
      out.timeUpdated = s.timeUpdated
      if (s.messageCount !== undefined) out.messageCount = s.messageCount
      return out
    })
    return JSON.stringify(cleaned, null, 2)
  }

  // Table format
  const lines: string[] = []
  lines.push("| ID | Title | Directory | Updated | Msgs |")
  lines.push("|----|-------|-----------|---------|------|")

  for (const s of sessions) {
    const title = s.title ?? "-"
    const displayTitle =
      title.length > TITLE_MAX ? title.slice(0, TITLE_MAX - 3) + "..." : title
    const dir = (s.directory ?? "-").replace(/\\/g, "\\\\")
    const updated = formatTimestamp(s.timeUpdated)
    const msgs = s.messageCount !== undefined ? String(s.messageCount) : "-"
    lines.push(`| ${s.id} | ${displayTitle} | ${dir} | ${updated} | ${msgs} |`)
  }

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Session content summarization
// ---------------------------------------------------------------------------
const TEXT_CLIP = 1500

export function summarizeSessionContent(
  info: SessionInfo,
  messages: MessageInfo[],
  parts: Record<string, PartInfo[]>,
  maxMessages?: number,
): string {
  const relevant =
    maxMessages !== undefined && messages.length > maxMessages
      ? messages.slice(-maxMessages)
      : messages

  const userMsgs = relevant.filter((m) => m.role === "user")
  const assistantMsgs = relevant.filter((m) => m.role === "assistant")
  let toolPartCount = 0

  for (const msg of relevant) {
    const msgParts = parts[msg.id] ?? []
    for (const p of msgParts) {
      if (p.type === "tool") toolPartCount++
    }
  }

  // Find latest user prompt and latest assistant response
  const latestUser = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1] : null
  const latestAssistant =
    assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null

  const lines: string[] = []
  lines.push(`## Session \`${info.id}\``)
  if (info.title) lines.push(`**Title**: ${info.title}`)
  if (info.directory) lines.push(`**Directory**: \`${info.directory}\``)

  lines.push(`**Created**: ${formatTimestamp(info.timeCreated)}`)
  lines.push(`**Updated**: ${formatTimestamp(info.timeUpdated)}`)

  const totalMsg = messages.length
  lines.push(
    `**Messages**: ${totalMsg} total (${relevant.length} shown, ${userMsgs.length} user, ${assistantMsgs.length} assistant)`,
  )

  if (toolPartCount > 0) {
    lines.push(`**Tool calls**: ${toolPartCount}`)
  }

  if (latestUser) {
    const userParts = parts[latestUser.id] ?? []
    const userTexts = userParts.filter((p) => p.type === "text")
    const combined = userTexts.map((p) => p.text ?? "").join("\n")
    lines.push("")
    lines.push("### Latest User Prompt")
    lines.push(clipText(combined))
  }

  if (latestAssistant) {
    const asstParts = parts[latestAssistant.id] ?? []
    const asstTexts = asstParts.filter((p) => p.type === "text")
    const combined = asstTexts.map((p) => p.text ?? "").join("\n")
    lines.push("")
    lines.push("### Latest Assistant Response")
    lines.push(clipText(combined))
  }

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Full session rendering
// ---------------------------------------------------------------------------

export function renderFullSession(
  info: SessionInfo,
  messages: MessageInfo[],
  parts: Record<string, PartInfo[]>,
  includeParts = true,
): string {
  const lines: string[] = []

  lines.push(`# Session \`${info.id}\``)
  if (info.title) lines.push(`**Title**: ${info.title}`)
  if (info.directory) lines.push(`**Directory**: \`${info.directory}\``)
  lines.push(
    `**Date**: ${formatTimestamp(info.timeCreated)} -- ${formatTimestamp(info.timeUpdated)}`,
  )
  lines.push(`**Messages**: ${messages.length}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  if (messages.length === 0) {
    lines.push("*No messages in this session.*")
    return lines.join("\n")
  }

  for (const msg of messages) {
    const roleLabel = msg.role === "user" ? "USER" : "ASSISTANT"
    const meta: string[] = []
    if (msg.agent) meta.push(`agent: ${msg.agent}`)
    if (msg.model) meta.push(`model: ${msg.model}`)
    const metaStr = meta.length > 0 ? ` (${meta.join(", ")})` : ""

    lines.push(`### ${roleLabel}${metaStr}`)
    lines.push(`*${new Date(msg.time).toISOString()}*`)
    lines.push("")

    const msgParts = parts[msg.id] ?? []
    for (const p of msgParts) {
      if (p.type === "text" && p.text) {
        lines.push(p.text)
        lines.push("")
      } else if (includeParts) {
        lines.push(
          `> *[${p.type}${p.toolName ? `: ${p.toolName}` : ""}${p.toolID ? ` #${p.toolID}` : ""}]*`,
        )
        lines.push("")
      }
    }

    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ms: number | undefined): string {
  if (ms === undefined) return "-"
  const d = new Date(ms)
  return isNaN(d.getTime())
    ? "-"
    : d.toISOString().replace("T", " ").slice(0, 19)
}

function clipText(text: string, maxLen = TEXT_CLIP): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + "... [clipped]"
}
