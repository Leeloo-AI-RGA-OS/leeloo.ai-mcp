# Install & connect Leeloo

A Claude Code agent executes this page top to bottom. Do exactly these steps, nothing else.
Stop as soon as Leeloo tools are available — do not continue to later steps "to be safe".

## 0. Check first — do not reinstall what already works

Look at the session's MCP servers for `leeloo` or `plugin:leeloo:leeloo`.

- Tools present and working → **stop**. Tell the user Leeloo is ready.
- Server listed as `needs_auth` → skip to step 3.
- Server not listed at all → continue to step 1.

A 401 or an empty tool list is almost always an unauthenticated server, not a broken
install. Reinstalling does not fix it. `Connected · tools fetch failed` and
`Request timed out` right after login are a warming backend: retry the call, do not
re-run login.

## 1. Is the `claude` CLI on PATH?

Run `claude --version`. It launches the binary, so allow it a few seconds on a cold
start rather than reading a slow first run as a failure.

- Prints a version → step 2 (CLI path).
- Says the command was not found → step 4 (desktop path). That is `command not
  found` with exit 127 in Bash, or a `CommandNotFoundException` in PowerShell.
  Either one simply means the desktop app without a separately installed CLI,
  which is the normal case, not a broken machine.

Any other error is not a missing CLI. Report what it said instead of guessing.

## 2. CLI path

The repository is tiny (under 100 KB), so both commands finish in seconds. Run
them one after the other and wait for each to exit:

    claude plugin marketplace add https://github.com/Leeloo-AI-RGA-OS/leeloo.ai-mcp.git#main
    claude plugin install leeloo@leeloo-ai

Then go to step 3.

### 2b. Tools without the plugin

If the user only wants the Leeloo tools and not the skills, or the plugin install
fails, register the MCP server directly instead:

    claude mcp add-json --scope user leeloo '{"type":"http","url":"https://app.leeloo.ai/mcp","oauth_resource":"https://app.leeloo.ai/mcp","headers":{"x-leeloo-mcp-client":"claude_code"}}'

Never retarget an existing registration, never create a duplicate, and never write
auth tokens into configuration. Verify with `claude mcp get leeloo`, then step 3.

## 3. Authenticate

The plugin registers its MCP server at session start, so tools from a fresh install
appear only in a new session.

Tell the user, in their language:

1. Open a **new session (new tab)**.
2. Type `/leeloo:connect`. The plugin's login helper starts sign-in and **opens the authorization page in the default browser automatically** — do not print a URL or ask the user to copy anything.
3. The user signs in to Leeloo in that browser window → **Allow access**.

`/leeloo:connect` is the one command the user needs to remember; it also works later
in the current session whenever Leeloo stops answering. Only the user can finish
sign-in; you cannot click Allow for them. The authoritative success signal is
`Authenticated with "plugin:leeloo:leeloo"` — not `Connected` alone. Never run two
logins at once.

## 4. No CLI: install it, then install the plugin

The desktop Code tab has no `claude` binary. Install Anthropic's official CLI — it
is a small native binary, needs no Node.js, and makes this and every future plugin
install fully automatic.

Installing software is the user's decision. Ask once, in plain words, before
running anything: "Claude Code needs its command-line tool to install plugins.
Install it now? (about a minute, no other software)". Accept a "no" without
arguing and go to step 4b instead.

On "yes", run the installer for the platform you are on:

Windows PowerShell:

    irm https://claude.ai/install.ps1 | iex

macOS, Linux, WSL:

    curl -fsSL https://claude.ai/install.sh | bash

The new binary is not on this session's PATH yet — `claude` still reports "not
found". That is expected. Call it by absolute path from here on:

- Windows: `%USERPROFILE%\.local\bin\claude.exe`
- macOS, Linux, WSL: `~/.local/bin/claude`

Verify with `--version` (2.1.210 or newer), then run the step 2 commands through
that absolute path and continue at step 3. From the next session on, plain `claude`
works everywhere.

If the installer itself fails (network, policy, permissions), report the exact
error and go to step 4b. Never retry an installer in a loop.

### 4b. Fallback: upload the plugin as a file

Download https://github.com/Leeloo-AI-RGA-OS/leeloo.ai-mcp/releases/latest/download/leeloo.zip
and tell the user where you saved it, then:

1. **Add → Upload plugin** → pick that file.
2. Continue at step 3.

If the download fails, tell the user to get the file from the repository's Releases
page themselves. Do not ask them to clone the repository or build an archive.

If `claude --version` already worked at step 1, never run these installers.
