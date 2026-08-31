#!/usr/bin/env bash
set -euo pipefail
source "$HOME/.railway/env"
cd /mnt/d/hr-hub
exec railway connect Postgres --tunnel-only --port 55433
