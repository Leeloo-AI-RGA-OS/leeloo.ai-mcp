#!/bin/sh
# Start `claude mcp login` for the Leeloo MCP server and open the authorization
# page in the user's default browser automatically. The user only signs in and
# clicks Allow. Run this backgrounded, e.g.:
#     sh login-leeloo.sh > /tmp/leeloo-login.log 2>&1 &
# then poll the log for: Authenticated with "plugin:leeloo:leeloo".

SERVER="plugin:leeloo:leeloo"
# claude mcp login output goes to its OWN file. It must NOT be the file the
# caller redirects this helper's stdout to (a shared file makes the batch's
# `>` truncate clobber the URL). The caller polls this helper's stdout instead.
LOG="${TMPDIR:-/tmp}/leeloo-mcp-login.log"
: > "$LOG"

# Resolve the claude executable by absolute path. A spawned Windows console does
# NOT reliably inherit npm's global bin on PATH, so `claude` alone fails there.
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude 2>/dev/null)}"
[ -z "$CLAUDE_BIN" ] && CLAUDE_BIN="claude"

open_url() {
  _u="$1"
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process '$_u'" >/dev/null 2>&1
  elif [ "$(uname -s)" = "Darwin" ]; then open "$_u" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$_u" >/dev/null 2>&1
  fi
}

# --- start `claude mcp login` on a console/PTY, backgrounded ------------------
if python3 -c 'import pty' 2>/dev/null; then                      # macOS/Linux
  python3 -c 'import pty,sys; pty.spawn(sys.argv[1:])' "$CLAUDE_BIN" mcp login "$SERVER" > "$LOG" 2>&1 &
  echo "started: python3 pty"
elif [ "$(uname -s)" = "Darwin" ]; then
  script -q "$LOG" "$CLAUDE_BIN" mcp login "$SERVER" &
  echo "started: BSD script"
elif command -v script >/dev/null 2>&1 && script --version 2>/dev/null | grep -q util-linux; then
  script -qc "\"$CLAUDE_BIN\" mcp login $SERVER" "$LOG" &
  echo "started: util-linux script"
elif command -v powershell.exe >/dev/null 2>&1; then              # Windows
  # Write a .cmd that runs login with the full path and redirects to the log,
  # then launch it hidden. A batch file handles its own quoting/redirection,
  # which Start-Process -ArgumentList mangles.
  RUN_WIN=$(cygpath -w "$CLAUDE_BIN.cmd" 2>/dev/null); [ -f "$CLAUDE_BIN.cmd" ] || RUN_WIN=$(cygpath -w "$CLAUDE_BIN" 2>/dev/null)
  LOG_WIN=$(cygpath -w "$LOG" 2>/dev/null || echo "$LOG")
  BAT="${TMPDIR:-/tmp}/leeloo-login-run.cmd"
  printf '@echo off\r\n"%s" mcp login %s > "%s" 2>&1\r\n' "$RUN_WIN" "$SERVER" "$LOG_WIN" > "$BAT"
  BAT_WIN=$(cygpath -w "$BAT" 2>/dev/null || echo "$BAT")
  powershell.exe -NoProfile -Command "Start-Process -FilePath '$BAT_WIN' -WindowStyle Hidden" >/dev/null 2>&1
  echo "started: windows batch ($RUN_WIN)"
else
  echo "No console strategy available. Run in a terminal: claude mcp login $SERVER"
  exit 1
fi

echo "A browser window will open for Leeloo sign-in. Sign in and click Allow access."

# --- foreground loop: open the browser when the URL appears, then wait --------
opened=0
i=0
while [ $i -lt 180 ]; do
  if [ $opened -eq 0 ]; then
    URL=$(grep -oE 'https://[^ ]*/authorize\?[^ ]*' "$LOG" 2>/dev/null | head -1)
    if [ -n "$URL" ]; then open_url "$URL"; echo "opened browser: $URL"; opened=1; fi
  fi
  DONE=$(grep -iE 'Authenticated with|Authentication timeout' "$LOG" 2>/dev/null | head -1)
  if [ -n "$DONE" ]; then echo "$DONE"; break; fi
  i=$((i+1)); sleep 1
done
# Mirror the login log to stdout so a caller that only reads this helper's
# output still gets the full picture.
echo "--- login log ---"; cat "$LOG" 2>/dev/null
