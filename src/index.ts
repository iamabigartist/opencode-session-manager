import type { PluginInput, PluginModule } from "@opencode-ai/plugin"
import { createClient } from "./client.ts"
import { createOpener } from "./opener.ts"
import { createTools } from "./tools.ts"

async function server(input: PluginInput) {
  const client = createClient(input.client)
  const opener = createOpener(input.serverUrl)
  const tools = createTools(client, opener)

  return {
    tool: {
      session_list: tools.session_list,
      session_summary: tools.session_summary,
      session_read: tools.session_read,
      session_open: tools.session_open,
    },
  }
}

export default {
  id: "opencode-session-manager",
  server,
} satisfies PluginModule
