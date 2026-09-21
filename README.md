# Leeloo plugin for Claude Code

One plugin: **`leeloo@leeloo-ai`** — connects the Leeloo.AI MCP server
(`https://app.leeloo.ai/mcp`) and bundles the Leeloo skills.

## Install & connect

Give this prompt to a Claude Code agent:

```
/goal Read https://raw.githubusercontent.com/Leeloo-AI-RGA-OS/leeloo.ai-mcp/main/install.md and install Leeloo
```

The agent picks the right path for the host it is running in. The full flow lives in
[install.md](./install.md).

**Terminal / IDE (the `claude` CLI is on PATH).** The agent adds the marketplace and
installs the plugin itself.

**Desktop app (no CLI).** The agent asks once whether it may install Anthropic's
official `claude` command-line tool (a small native binary, no Node.js). On "yes" it
installs it and then installs the plugin itself, fully automatically. If you decline,
it falls back to downloading
[leeloo.zip](https://github.com/Leeloo-AI-RGA-OS/leeloo.ai-mcp/releases/latest/download/leeloo.zip)
from the latest release and asking you to add it via **Add → Upload plugin**.

Either way, finish in a **new session**: the plugin registers its MCP server at session
start. Type `/leeloo:connect`, then **Leeloo** → **Authenticate** → **Allow access**.
Only you can complete the sign-in. The same command reconnects Leeloo later if it ever
stops answering — no reinstall needed.

### Tools without the plugin

If you want the Leeloo MCP tools but not the bundled skills, register the server
directly and skip the plugin entirely:

```sh
claude mcp add-json --scope user leeloo '{"type":"http","url":"https://app.leeloo.ai/mcp","oauth_resource":"https://app.leeloo.ai/mcp","headers":{"x-leeloo-mcp-client":"claude_code"}}'
```

## Releases

Each release attaches `leeloo.zip` — the plugin directory (`.claude-plugin/` plus
`skills/`) packaged for **Add → Upload plugin**. The
`releases/latest/download/leeloo.zip` link above always resolves to the newest one,
so the install page never needs updating when a new version ships.
