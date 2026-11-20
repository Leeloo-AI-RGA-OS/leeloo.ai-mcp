# Leeloo.AI for Claude

Build and manage your Leeloo.AI account from a conversation with Claude: messenger
sales funnels (tunnels), lead-gen tools, offers, tags, custom fields and CRM sales
plans.

## What is included

- **Leeloo MCP server** at `https://app.leeloo.ai/mcp`. You sign in with your own
  Leeloo.AI account through OAuth, and Claude can reach only what that account can.
- **Skills**
  - `connect`: connects or reconnects the Leeloo MCP server
  - `leeloo-plugin-basics`: the tunnel, block and relation model, and which tools to use
  - `tunnel-creator`: builds and repairs tunnels step by step
  - `marketing-foundation-builder`: prepares a marketing strategy, offers and tunnel copy

## Getting started

1. Install the plugin, then start a new session so the Leeloo MCP server is registered:

   ```
   /plugin install leeloo --marketplace Leeloo-AI-RGA-OS/leeloo.ai-mcp
   ```

2. Run `/leeloo:connect`, sign in to Leeloo.AI and select **Allow access**.
3. Ask Claude for what you need, for example: "Build a tunnel that welcomes new
   subscribers and follows up after one day."

## What the plugin runs

The `connect` skill can run `skills/leeloo-plugin-basics/login-leeloo.sh`. The script
starts `claude mcp login` for the Leeloo server, opens the Leeloo sign-in page in your
default browser, and writes the login output to a log file in your temporary folder.
It sends no data anywhere except the Leeloo sign-in flow.

The plugin connects to one remote service, `https://app.leeloo.ai/mcp`. It installs no
packages and runs no hooks.

## Requirements

A Leeloo.AI account on a paid plan.

## Privacy and support

- Privacy policy: https://leeloo.ai/en/privacy-policy/
- Support: love@leeloo.ai

## License

MIT. See [LICENSE](./LICENSE).
