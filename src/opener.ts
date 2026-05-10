import type { SessionOpener } from "./types.ts"

/**
 * Creates an HTTP-based SessionOpener that calls
 * POST /tui/select-session to open a session in the TUI.
 */
export function createOpener(serverUrl: URL): SessionOpener {
  return {
    async open(sessionID: string) {
      try {
        const url = new URL("/tui/select-session", serverUrl)
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID }),
        })

        if (res.ok) {
          return { success: true, message: `Opened session \`${sessionID}\`` }
        }

        let msg = `Failed to open session \`${sessionID}\``
        try {
          const body = await res.json()
          if (body.error) msg = body.error
        } catch {
          // ignore parse errors
        }

        if (res.status === 404) {
          msg = `Session \`${sessionID}\` not found`
        } else if (res.status === 400) {
          msg = `Invalid session ID: \`${sessionID}\``
        }

        return { success: false, message: msg }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          success: false,
          message: `Failed to open session: ${msg}`,
        }
      }
    },
  }
}
