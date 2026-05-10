import { describe, expect, mock, test } from "bun:test"
import { createClient } from "../client.ts"
import type { SessionInfo } from "../types.ts"

const sessionsJson: SessionInfo[] = [
  {
    id: "ses_a",
    title: "Session A",
    directory: "/home",
    timeCreated: 1,
    timeUpdated: 2,
  },
  {
    id: "ses_b",
    title: "Session B",
    directory: "/tmp",
    timeCreated: 3,
    timeUpdated: 4,
  },
]

/** Create an SDK-like session with nested `time` shape. */
function toSdkSession(s: SessionInfo) {
  return {
    id: s.id,
    title: s.title,
    directory: s.directory,
    time: {
      created: s.timeCreated,
      updated: s.timeUpdated,
    },
  }
}

function fakeSdk() {
  return {
    session: {
      list: mock(
        async (input?: { query?: Record<string, string> }) => {
          let result = sessionsJson.map(toSdkSession)
          if (input?.query?.search) {
            const q = input.query.search.toLowerCase()
            result = result.filter(
              (s) => s.title?.toLowerCase().includes(q),
            )
          }
          if (input?.query?.limit)
            result = result.slice(0, Number(input.query.limit))
          return { data: result }
        },
      ),
      get: mock(async (input: { path: { id: string } }) => {
        const s = sessionsJson.find((x) => x.id === input.path.id)
        if (!s) throw new Error("not found")
        return { data: toSdkSession(s) }
      }),
      messages: mock(
        async (_input: {
          path: { id: string }
          query?: Record<string, string>
        }) => ({
          data: [
            {
              info: {
                id: "m1",
                role: "user",
                time: { created: 1 },
              },
              parts: [
                {
                  id: "p1",
                  messageID: "m1",
                  type: "text",
                  text: "hello",
                },
              ],
            },
          ],
        }),
      ),
    },
  }
}

describe("client.listSessions", () => {
  test("calls sdk.session.list", async () => {
    const sdk = fakeSdk()
    const client = createClient(sdk)

    const result = await client.listSessions({})
    expect(result).toEqual(sessionsJson)
    expect(sdk.session.list).toHaveBeenCalled()
  })

  test("passes limit as query param", async () => {
    const sdk = fakeSdk()
    const client = createClient(sdk)

    await client.listSessions({ limit: 5 })
    const listMock = sdk.session.list as ReturnType<typeof mock>
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: "5" } }),
    )
  })

  test("passes search as query param", async () => {
    const sdk = fakeSdk()
    const client = createClient(sdk)

    await client.listSessions({ search: "auth" })
    const listMock = sdk.session.list as ReturnType<typeof mock>
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: { search: "auth" } }),
    )
  })
})

describe("client.getSession", () => {
  test("fetches a single session via SDK path.id", async () => {
    const sdk = fakeSdk()
    const client = createClient(sdk)

    const result = await client.getSession("ses_a")
    expect(result).toEqual(sessionsJson[0])

    const getMock = sdk.session.get as ReturnType<typeof mock>
    expect(getMock).toHaveBeenCalledWith({ path: { id: "ses_a" } })
  })

  test("returns null on missing session", async () => {
    const sdk = fakeSdk()
    ;(sdk.session.get as ReturnType<typeof mock>).mockImplementation(
      async () => {
        throw new Error("not found")
      },
    )
    const client = createClient(sdk)

    const result = await client.getSession("ses_missing")
    expect(result).toBeNull()
  })
})

describe("client.getMessages", () => {
  test("fetches messages via SDK path.id", async () => {
    const sdk = fakeSdk()
    const client = createClient(sdk)

    const result = await client.getMessages("ses_a")
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].id).toBe("m1")
    expect(result[0].role).toBe("user")

    const msgMock = sdk.session.messages as ReturnType<typeof mock>
    expect(msgMock).toHaveBeenCalledWith({
      path: { id: "ses_a" },
      query: undefined,
    })
  })
})

describe("client.getParts", () => {
  test("extracts parts from messages response via SDK path.id", async () => {
    const sdk = fakeSdk()
    const client = createClient(sdk)

    const result = await client.getParts("ses_a", ["m1"])
    expect(result.m1).toBeDefined()
    expect(result.m1[0].text).toBe("hello")
  })
})
