# HELLO TRADER — PRODUCTION DISASTER RECOVERY & BACKUP RUNBOOK

This document establishes the official standard operating procedure (SOP) for automated backups, integrity verification, retention policies, and complete disaster recovery for the **Hello Trader** production system.

---

## 1. System Architecture & Backup Topology

| Component | Production Path | Backup Strategy | Storage Location |
|---|---|---|---|
| **Database** | `/var/www/hello-trader/backend/prisma/backend.db` | Online SQLite ACID snapshot (`.backup`) + Full SQL text dump (`.dump`) + Gzip | `/var/backups/hello-trader/{category}/backup_*/backend.db.gz` and `database.sql.gz` |
| **Application Source** | `/var/www/hello-trader` | Tarball of `backend/`, `src/`, `packages/`, `prisma/`, config, build scripts | `/var/backups/hello-trader/{category}/backup_*/application_source.tar.gz` |
| **Server & PM2 Config** | `/etc/nginx/sites-available`, PM2 config | Tarball of ecosystem and web server configs | `/var/backups/hello-trader/{category}/backup_*/server_config.tar.gz` |
| **Manifest & Checksums** | — | JSON manifest with SHA-256 cryptographic hashes & table row counts | `/var/backups/hello-trader/{category}/backup_*/manifest.json` and `CHECKSUMS.sha256` |
| **Rollback Checkpoints** | — | Auto-created before any restore operation | `/var/backups/hello-trader/emergency_rollback/` |

---

## 2. Backup Schedule & Retention Policy

Automated backups run via root crontab on the host VPS:

```cron
# Hello Trader Daily Production Backup at 03:00 AM IST (21:30 UTC)
0 3 * * * /usr/bin/node /var/www/hello-trader/scripts/backup.js --type=daily >> /var/backups/hello-trader/logs/backup_cron.log 2>&1

# Hello Trader Weekly Production Backup (Sundays at 03:30 AM IST)
30 3 * * 0 /usr/bin/node /var/www/hello-trader/scripts/backup.js --type=weekly >> /var/backups/hello-trader/logs/backup_cron.log 2>&1

# Hello Trader Monthly Production Backup (1st of month at 04:00 AM IST)
0 4 1 * * /usr/bin/node /var/www/hello-trader/scripts/backup.js --type=monthly >> /var/backups/hello-trader/logs/backup_cron.log 2>&1
```

### Retention Policy (Grandfather-Father-Son)
- **Daily Backups**: Retained for **7 days** (rolling window).
- **Weekly Backups**: Retained for **4 weeks** (rolling window).
- **Monthly Backups**: Retained for **3 months** (rolling window).
- **Pre-Deployment Snapshots**: Retained for **5 most recent deployments**.

Expired archives are automatically pruned upon successful completion of a new backup.

---

## 3. Automated Integrity & Non-Destructive Restore Verification

Every backup run undergoes an automated **Live Restore & Integrity Verification**:
1. Creates the database snapshot and SQL dump.
2. Restores `database.sql` into an isolated temporary database file (`/var/backups/hello-trader/tmp/verify_restore_*.db`).
3. Queries and verifies minimum row thresholds across core business tables:
   - `User` table row count $\ge 1$
   - `Ledger` table row count $\ge 1$
   - `SystemSettings` table row count $\ge 1$
4. Validates production invariant: verifies that user `Nitu Ojha` (`HT0802` / `AACI583141`) token balance and trade records exist intact.
5. Computes and records SHA-256 checksums in `CHECKSUMS.sha256`.
6. Purges the temporary verification DB.
7. Only upon passing all checks does `manifest.json` mark `verification.status = "VERIFIED_SUCCESS"`.

---

## 4. Disaster Recovery & Restoration Procedures

### Scenario A: Rollback / Restore on the Existing VPS

To restore from the latest verified backup:

```bash
cd /var/www/hello-trader
node scripts/restore.js --CONFIRM-PRODUCTION-RESTORE
```

To restore from a specific timestamp backup:

```bash
cd /var/www/hello-trader
node scripts/restore.js --backup=/var/backups/hello-trader/daily/backup_YYYY-MM-DD_... --CONFIRM-PRODUCTION-RESTORE
```

What the script automatically performs:
1. Validates the integrity of the backup files against `CHECKSUMS.sha256`.
2. Creates an emergency safety rollback checkpoint of the current live database in `/var/backups/hello-trader/emergency_rollback/`.
3. Restores the database file safely with proper file permissions (`0666`).
4. Audits restored table row counts to ensure data health.
5. Gracefully restarts the PM2 backend service (`pm2 restart hello-trader-backend`).

---

### Scenario B: Complete Bare-Metal VPS Recovery from Scratch

If the server is completely destroyed, follow this step-by-step rebuild procedure:

#### Step 1: Provision Clean Server & Base Packages
```bash
apt-get update -y && apt-get install -y git curl build-essential nginx sqlite3 ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2
```

#### Step 2: Clone Repository & Install Dependencies
```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/hellotraderinstitute-hub/HELLO-TRADER.git hello-trader
cd hello-trader
npm install
cd backend && npm install && cd ..
```

#### Step 3: Configure Environment
Copy the production `.env` file containing required secrets:
- `DATABASE_URL="file:./backend.db"`
- `JWT_SECRET`
- `ANGEL_ONE_API_KEY`, `ANGEL_ONE_SECRET`, `SMART_API_FEED_TOKEN`
- `PORT=5000`

#### Step 4: Restore the Latest Database Snapshot
```bash
# Transfer backup bundle from remote storage or backup archive
mkdir -p /var/backups/hello-trader
# Unpack database.sql.gz to /var/www/hello-trader/backend/prisma/backend.db
gunzip -c /var/backups/hello-trader/daily/latest_backup/database.sql.gz | sqlite3 /var/www/hello-trader/backend/prisma/backend.db
chmod 666 /var/www/hello-trader/backend/prisma/backend.db
```

#### Step 5: Build Frontend & Start PM2 Services
```bash
cd /var/www/hello-trader
npx next build
pm2 start ecosystem.config.js || pm2 start backend/server.js --name hello-trader-backend && pm2 start "npm run start" --name hello-trader-frontend
pm2 save
pm2 startup
```

#### Step 6: Verify Health & Trading Invariants
Run the automated verification suite:
```bash
node tests/today_pnl_reconciliation_test.js
node tests/tiered_brokerage_rate_test.js
node tests/algo_trading_complete_suite.js
node scripts/backup_status.js
```

---

## 5. Pre-Deployment Safety Hook

To prevent broken deployments from overwriting functional production systems, all deployment workflows should execute:

```bash
node scripts/pre_deploy_backup.js
```

If the snapshot or verification fails, the script exits with code `1`, halting the deployment immediately.

---

## 6. Monitoring & Backup Status API

- **CLI Inspection**:
  ```bash
  node scripts/backup_status.js
  ```
- **Admin REST API**:
  `GET https://hellotraderinstitute.com/api/admin/backup-status` (Requires Admin JWT Token)
  Returns:
  ```json
  {
    "success": true,
    "healthy": true,
    "lastBackup": {
      "backupId": "backup_2026-08-24T...",
      "type": "daily",
      "createdAt": "2026-08-24T...",
      "verificationStatus": "VERIFIED_SUCCESS",
      "verifiedTableCounts": {
        "User": 22,
        "Ledger": 92,
        "AlgoPosition": 5,
        "AlgoBrokerConnection": 6,
        "AuditLog": 470,
        "SystemSettings": 1
      }
    },
    "retention": { "daily": 1, "weekly": 0, "monthly": 0, "predeploy": 0 },
    "scheduleCron": "0 3 * * * (Asia/Kolkata daily 3:00 AM)"
  }
  ```

---

## 7. Security Best Practices

1. **Permission Hardening**: All backups are located in `/var/backups/hello-trader` with permissions `0700` owned by `root`.
2. **No Web Exposure**: Nginx is configured to block any request to `/var/backups/`, `.env`, `.db`, or `.sql` files.
3. **Zero Secrets in Logs**: No JWT secrets, broker tokens, or passwords are printed in manifests or terminal outputs.
4. **Non-Destructive Invariant**: Zero live broker orders are placed, and existing database tables are never truncated during test verification.
