#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
IMAGE="${IMAGE:-samples/sample-vehicle.png}"

response=$(curl -fsS -X POST "$BASE_URL/api/v1/media" -F "image=@$IMAGE")
printf '%s\n' "$response"

processing_id=$(printf '%s' "$response" | sed -n 's/.*"processingId":"\([^"]*\)".*/\1/p')
if [[ -z "$processing_id" ]]; then
  echo "Could not parse processingId" >&2
  exit 1
fi

echo "Polling $processing_id"
for _ in $(seq 1 30); do
  status=$(curl -fsS "$BASE_URL/api/v1/media/$processing_id/status")
  printf '%s\n' "$status"
  if printf '%s' "$status" | grep -q '"status":"completed"'; then
    curl -fsS "$BASE_URL/api/v1/media/$processing_id/results"
    exit 0
  fi
  if printf '%s' "$status" | grep -q '"status":"failed"'; then
    curl -fsS "$BASE_URL/api/v1/media/$processing_id/results" || true
    exit 1
  fi
  sleep 2
done

echo "Timed out waiting for job" >&2
exit 1
