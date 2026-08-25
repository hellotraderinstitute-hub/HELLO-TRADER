# ⚙️ Hello Trader Background Workers & Runtime Requirements

This document registers all background workers, daemons, schedulers, and streamers active in the Hello Trader platform.

---

### 📋 Registered Background Workers

| Worker Name | Implementation File | Purpose & Function | Always-On Requirement |
|---|---|---|---|
| **SMDE Dhan Streamer** | [`backend/dhanStreamer.js`](file:///C:/Users/hello/.gemini/antigravity/scratch/hello-trader/backend/dhanStreamer.js) | Maintains persistent WebSocket stream to Dhan API for real-time 1-sec market ticks and OHLC candle generation. | **CRITICAL (Always-On)** — Process sleep causes missed ticks & broken OHLC charts. |
| **Master Order Poller** | [`backend/services/masterOrderPoller.js`](file:///C:/Users/hello/.gemini/antigravity/scratch/hello-trader/backend/services/masterOrderPoller.js) | Polls master broker trade books every 2s to replicate trades to follower accounts. | **CRITICAL (Always-On)** — Process sleep delays copy trade replication. |
| **Cron Scheduler** | [`backend/scheduler.js`](file:///C:/Users/hello/.gemini/antigravity/scratch/hello-trader/backend/scheduler.js) | Runs node-cron jobs for daily membership trial expiration, auto-renewals, and DB cleanups. | **CRITICAL (Always-On)** — Process sleep causes missed scheduled jobs. |
| **Justdial Lead Ingestion** | [`backend/services/justdialGmailOAuthWorker.js`](file:///C:/Users/hello/.gemini/antigravity/scratch/hello-trader/backend/services/justdialGmailOAuthWorker.js) | Polls Gmail/IMAP OAuth2 for auto-capturing student education leads. | **HIGH (Always-On)** — Process sleep delays lead processing. |

---

### 🚨 Production Hosting SLA Requirement

> [!WARNING]
> **Server Spin-Down / Sleep Notice**:
> Server environments with free-tier inactivity sleep (e.g. Render Free Tier 15-minute inactivity spin-down) will **terminate** all WebSocket connections, cron schedulers, and background pollers.
>
> To ensure **100% 24/7 continuous production execution** without missed webhooks or ticker drops, the backend MUST be deployed on an **Always-On Web Service Instance** (e.g., Render Web Service Starter/Individual $7/mo, Railway, AWS EC2, or VPS). Fake keep-alive/health-ping hacks are explicitly rejected for real-time financial trading.
