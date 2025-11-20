#!/bin/bash

# Wait for the API server to be ready before running codegen
# This prevents race conditions when the server restarts

MAX_ATTEMPTS=30
ATTEMPT=0

echo "Waiting for API server to be ready..."

until curl -sf http://localhost/status > /dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))

  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "ERROR: API server did not become ready after $MAX_ATTEMPTS attempts"
    exit 1
  fi

  echo "API server not ready yet (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
  sleep 0.5
done

echo "API server is ready! Running GraphQL codegen..."
