#!/bin/zsh
export PATH="/Users/marco/.bun/bin:/Users/marco/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/marco"

DIR="$(cd "$(dirname "$0")" && pwd)"

# Install backend deps if needed
if [ ! -d "$DIR/node_modules" ]; then
  cd "$DIR" && npm install --silent
fi

# Install and build frontend if needed
if [ ! -d "$DIR/frontend/dist" ]; then
  cd "$DIR/frontend"
  [ ! -d node_modules ] && npm install --silent
  npm run build --silent
fi

cd "$DIR"
PORT=3334 node server.js
