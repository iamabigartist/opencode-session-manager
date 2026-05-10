import { afterEach, describe, expect, mock, test } from "bun:test"
import { createOpener } from "../opener.ts"

const serverUrl = new URL("http://localhost:4096")

afterEach(() => {
  mock.restore()
})

describe("createOpener.open", () => {
  test("sends POST to /tui/select-session with JSON", async () => {
    const fetchMock = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response
      },
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const opener = createOpener(serverUrl)

    const result = await opener.open("ses_abc")
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalled()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("select-session")
    expect(init.method).toBe("POST")
    expect(init.headers).toBeDefined()
    const body = JSON.parse(init.body as string)
    expect(body.sessionID).toBe("ses_abc")
  })

  test("returns failure message on 404", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      } as Response
    }) as unknown as typeof fetch
    const opener = createOpener(serverUrl)

    const result = await opener.open("ses_missing")
    expect(result.success).toBe(false)
    expect(result.message).toContain("not found")
  })

  test("returns failure message on 400", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid id" }),
      } as Response
    }) as unknown as typeof fetch
    const opener = createOpener(serverUrl)

    const result = await opener.open("bad_id")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Invalid")
  })

  test("handles network error gracefully", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    const opener = createOpener(serverUrl)

    const result = await opener.open("ses_abc")
    expect(result.success).toBe(false)
    expect(result.message).toContain("ECONNREFUSED")
  })
})
