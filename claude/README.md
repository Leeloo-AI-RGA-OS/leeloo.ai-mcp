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
  - `marketing-foundation-builder`: prepares a marketing foundation in nine approved
    stages: launch product, segments, offers, economics, tunnel blueprint with copy and
    CRM logic, Meta Ads creative briefs, lead-gen tools and lead magnets
  - `leeloo-dashboard`: builds an "Analytics, marketing and sales" dashboard from your
    Leeloo.AI data and, if connected, Meta Ads
  - `leelooai-foundation-miro-board`: lays the marketing foundation and the whole
    tunnel out on a Miro board, one card per message

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

The `leeloo-dashboard` skill runs the Node.js scripts in `skills/leeloo-dashboard/scripts/`.
`token.mjs` creates `~/.leeloo/token.txt`, limits access to it to your user, opens it
in a text editor so you can paste your Leeloo API key, and checks the key. The other
scripts read that key (or the `LEELOO_API_TOKEN` environment variable), send read-only
requests to `https://api.leeloo.ai/api/v2`, and write the exported data and the dashboard
page to a `leeloo-dashboard-data` folder in your working folder. The key is never
written anywhere else.

The `leelooai-foundation-miro-board` skill runs two Python scripts in
`skills/leelooai-foundation-miro-board/scripts/`. They read the foundation document and
board exports you give them and write local JSON, SVG and report files. They make no
network requests. The board itself is built through the Miro connector you connect.

The plugin connects to two remote services, both Leeloo.AI: the MCP server at
`https://app.leeloo.ai/mcp` and, for the dashboard only, the REST API at
`https://api.leeloo.ai/api/v2`. It installs no packages and runs no hooks.

## Requirements

- A Leeloo.AI account on a paid plan.
- For `leeloo-dashboard`: Node.js 18 or newer and a Leeloo API key. The Meta Ads
  connector is optional and adds advertising data.
- For `leelooai-foundation-miro-board`: Python 3 and the Miro connector.

## Privacy and support

- Privacy policy: https://leeloo.ai/en/privacy-policy/
- Support: love@leeloo.ai

## License

MIT. See [LICENSE](./LICENSE).
