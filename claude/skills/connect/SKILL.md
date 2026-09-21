---
name: connect
description: Connect or reconnect the Leeloo MCP server. Invoke on /leeloo:connect, or when the user asks to connect, authorize or reconnect Leeloo, or when Leeloo tools return an authentication error. Checks the current state first, uses the CLI login when one is available, and otherwise gives the /mcp steps.
---

# Connect Leeloo

Work top to bottom. Stop at the first step that resolves the situation.

## 0. Is it already connected?

Look at the session's MCP servers for `plugin:leeloo:leeloo` (or `leeloo`).

- Status `connected` with tools listed → tell the user Leeloo is already connected
  and **stop**. Do not suggest a new session or re-authentication.
- `Connected · tools fetch failed` or `Request timed out` right after a login →
  the backend is warming up. Retry one Leeloo call; do not start a login.
- Server missing entirely → the plugin registers it only at session start. Tell the
  user to open a new session and run `/leeloo:connect` there. Stop.
- `needs_auth`, or a Leeloo call returned an explicit authentication error → step 1.

## 1. CLI available → log in without the /mcp dialog

Run `claude --version`. If it prints a version, start the login helper:

    sh "${CLAUDE_PLUGIN_ROOT}/skills/leeloo-plugin-basics/login-leeloo.sh"

It runs `claude mcp login plugin:leeloo:leeloo` in a pseudo-terminal and writes
everything to the log file it names (`$TMPDIR/leeloo-login.log`). Poll that log:

1. When an authorization URL appears, give it to the user: open it, sign in to
   Leeloo, click **Allow access**. Only the user can do this.
2. Keep polling until the line `Authenticated with "plugin:leeloo:leeloo"` appears.
   That line is the success signal — `Connected` alone is not.
3. Then retry a Leeloo call and confirm tools are back.

Never start a second login while one is running. If the log says
`Authentication timeout`, stop the process, start one fresh login, hand over the
new URL and resume polling. If the helper itself fails (no PTY strategy, `claude`
missing after all), fall through to step 2.

On Windows the helper opens a separate console window that may look blank —
output is redirected to the log; that is expected, not a hang.

## 2. No CLI → the /mcp dialog

Tell the user, in their language, exactly this:

1. Run `/mcp`.
2. Select **Leeloo** → **Authenticate** → sign in → **Allow access**.

This works in the current session; a new session is needed only when the server
is missing from the list entirely (step 0). Do not ask the user to install anything
here — installation is the install page's job, not this skill's.

## After either path

Confirm with a real Leeloo call, not just the status line. If tools are still
absent after a successful `Authenticated` line, say so and suggest a new session —
do not loop on logins.
