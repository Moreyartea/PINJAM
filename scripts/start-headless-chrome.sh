#!/usr/bin/env bash
set -e

PORT=9222
USER_DATA_DIR="/tmp/pinjam-chrome-profile"
rm -rf "$USER_DATA_DIR"
mkdir -p "$USER_DATA_DIR"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --remote-debugging-port=$PORT \
  --user-data-dir="$USER_DATA_DIR" \
  --no-first-run \
  --no-default-browser-check &
CHROME_PID=$!

trap "kill $CHROME_PID 2>/dev/null || true; rm -f '/Users/user/Library/Application Support/Google/Chrome/DevToolsActivePort'" EXIT INT TERM

for i in {1..30}; do
  if /usr/bin/curl -s http://127.0.0.1:$PORT/json/version > /dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

VERSION_JSON=$(/usr/bin/curl -s http://127.0.0.1:$PORT/json/version)
WS_URL=$(node -e "const v = JSON.parse(process.argv[1]); console.log(v.webSocketDebuggerUrl);" "$VERSION_JSON")
WS_PATH=$(node -e "const u = new URL(process.argv[1]); console.log(u.pathname);" "$WS_URL")

DEVTOOLS_FILE="/Users/user/Library/Application Support/Google/Chrome/DevToolsActivePort"
printf "%s\n%s\n" "$PORT" "$WS_PATH" > "$DEVTOOLS_FILE"

echo "Headless Chrome ready on port $PORT with ws path $WS_PATH"
echo "DevToolsActivePort written to $DEVTOOLS_FILE"

wait $CHROME_PID
