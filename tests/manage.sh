#!/bin/bash

set -e

ENV_FILE=".env"

load_env_file() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
  fi
}

TEST_FILE_ARGS=()

build_test_args() {
  local raw_names="${TEST_NAMES:-}"

  TEST_FILE_ARGS=()

  if [ -z "$raw_names" ]; then
    return
  fi

  # Support comma or space separated lists
  raw_names=${raw_names//,/ }

  read -ra names <<<"$raw_names"

  for name in "${names[@]}"; do
    local trimmed
    trimmed=$(echo "$name" | xargs)
    if [ -z "$trimmed" ]; then
      continue
    fi

    case "$trimmed" in
      tests/*)
        TEST_FILE_ARGS+=("$trimmed")
        ;;
      ./tests/*)
        TEST_FILE_ARGS+=("${trimmed#./}")
        ;;
      */*)
        TEST_FILE_ARGS+=("$trimmed")
        ;;
      *)
        TEST_FILE_ARGS+=("tests/$trimmed")
        ;;
    esac
  done
}

run_deno_tests() {
  local watch_mode="$1"
  shift || true

  build_test_args

  local -a cmd=(
    deno test
  )

  if [ ${#TEST_FILE_ARGS[@]} -gt 0 ]; then
    cmd+=("${TEST_FILE_ARGS[@]}")
  else
    cmd+=(tests)
  fi

  cmd+=("--allow-net" "--allow-env" "--allow-read" "--sloppy-imports" "--unstable-worker-options" "--fail-fast")

  if [ "$watch_mode" = "1" ]; then
    cmd+=("--watch")
  fi

  cmd+=("$@")

  "${cmd[@]}"
}

await_mcp_test_server() {
  echo "Waiting for MCP test server to be ready..."
  for i in {1..30}; do
    if curl -s http://localhost:3456/health > /dev/null 2>&1; then
      echo "MCP test server is ready"
      break
    fi
    sleep 1
  done
}

do_run() {
  load_env_file

  deno install

  echo "Starting PM2 processes (MCP test server)..."
  pm2 start ecosystem.config.js

  echo "PM2 processes started. Tailing logs..."
  pm2 logs &

  await_mcp_test_server

  run_deno_tests "1" "$@"
}

do_test() {
  load_env_file

  deno install

  echo "Starting PM2 processes (MCP test server)..."
  pm2 start ecosystem.config.js

  await_mcp_test_server

  echo "Running tests..."
  run_deno_tests "0" "$@"
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
