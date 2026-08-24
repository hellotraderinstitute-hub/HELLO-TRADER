#!/bin/bash
# ==============================================================================
# Hello Trader Production Disaster Recovery & Restore Script
# Usage:
#   ./scripts/restore.sh --CONFIRM-PRODUCTION-RESTORE
#   ./scripts/restore.sh --backup=/var/backups/hello-trader/daily/backup_... --CONFIRM-PRODUCTION-RESTORE
# ==============================================================================

set -e

APP_DIR="/var/www/hello-trader"
cd "$APP_DIR"

if [[ "$*" != *"--CONFIRM-PRODUCTION-RESTORE"* ]]; then
  echo "================================================================================"
  echo "✖ RESTORE ABORTED: Missing safety confirmation flag!"
  echo "  To perform a production restore, run:"
  echo "  $0 --CONFIRM-PRODUCTION-RESTORE"
  echo "================================================================================"
  exit 1
fi

node scripts/restore.js "$@"
