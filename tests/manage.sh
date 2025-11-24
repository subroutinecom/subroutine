#!/bin/bash

set -e

do_run() {
  deno install

  echo "Starting PM2 processes (MCP test server)..."
  pm2 start ecosystem.config.js

  echo "PM2 processes started. Tailing logs..."
  pm2 logs
}

do_test() {
  deno install

  echo "Starting PM2 processes (MCP test server)..."
  pm2 start ecosystem.config.js

  echo "Waiting for MCP test server to be ready..."
  for i in {1..30}; do
    if curl -s http://localhost:3456/health > /dev/null 2>&1; then
      echo "MCP test server is ready"
      break
    fi
    sleep 1
  done

  echo "Running tests..."
  deno test tests --allow-net --allow-env --allow-read --sloppy-imports --unstable-worker-options "$@"
}

if [ "$1" = "--run" ]; then
  do_run
elif [ "$1" = "--test" ]; then
  shift
  do_test "$@"
else
  echo "Usage: manage.sh [--run|--test]"
  echo "  --run   Start PM2 processes and tail logs"
  echo "  --test  Start PM2 processes and run tests"
fi
