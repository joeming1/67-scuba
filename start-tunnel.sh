#!/bin/bash
# Start FixitFelix with Cloudflare Tunnel — accessible from any internet connection
# Usage: ./start-tunnel.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=3000

# Kill any existing processes on the port
kill $(lsof -ti:$PORT) 2>/dev/null || true

echo "Starting Next.js dev server on port $PORT..."
cd "$PROJECT_DIR"
NODE_OPTIONS="" node ./node_modules/.bin/next dev -p $PORT &
DEV_PID=$!

# Wait for the dev server to be ready
echo "Waiting for dev server..."
for i in $(seq 1 20); do
  if curl -s -o /dev/null -w "" "http://localhost:$PORT" 2>/dev/null; then
    echo "Dev server is ready."
    break
  fi
  sleep 1
done

echo "Starting Cloudflare Quick Tunnel..."
# Start tunnel and capture the URL
cloudflared tunnel --url http://localhost:$PORT 2>&1 | while read -r line; do
  echo "$line"
  # Extract the tunnel URL
  if echo "$line" | grep -q "trycloudflare.com"; then
    TUNNEL_URL=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com')
    if [ -n "$TUNNEL_URL" ]; then
      echo ""
      echo "================================================"
      echo "  FixitFelix is live at: $TUNNEL_URL"
      echo "  Local: http://localhost:$PORT"
      echo "  Press Ctrl+C to stop both processes."
      echo "================================================"
      echo ""
      # Update .env.local with the tunnel URL
      if [ -f "$PROJECT_DIR/.env.local" ]; then
        sed -i.bak "s|^FIXITFELIX_PUBLIC_URL=.*|FIXITFELIX_PUBLIC_URL=$TUNNEL_URL|" "$PROJECT_DIR/.env.local"
        echo "Updated FIXITFELIX_PUBLIC_URL in .env.local"
        echo "Restart the dev server to pick up the new URL."
      fi
    fi
  fi
done

# Clean up on exit
trap "kill $DEV_PID 2>/dev/null; exit" INT TERM
