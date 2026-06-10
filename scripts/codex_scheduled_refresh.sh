#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export TZ="America/New_York"

log_dir="${HOME}/.codex/automations/daily-diamond-signal-refresh"
mkdir -p "${log_dir}"

timestamp="$(date '+%Y-%m-%d_%H-%M-%S')"
log_file="${log_dir}/run_${timestamp}.log"

exec > >(tee -a "${log_file}") 2>&1

echo "=== Codex scheduled refresh start: $(date '+%Y-%m-%d %I:%M:%S %p %Z') ==="
echo "Workspace: $(pwd)"

scripts/daily_refresh.sh

echo "=== Local refresh finished: $(date '+%Y-%m-%d %I:%M:%S %p %Z') ==="
echo "Checking published status endpoints..."

curl -L --fail --silent https://glederer04.github.io/Baseball-Props/site-data/pipeline_status.csv | sed -n '1,5p'
curl -L --fail --silent https://glederer04.github.io/Baseball-Props/site-data/pick_results.csv | sed -n '1,5p'

echo "=== Codex scheduled refresh end: $(date '+%Y-%m-%d %I:%M:%S %p %Z') ==="
