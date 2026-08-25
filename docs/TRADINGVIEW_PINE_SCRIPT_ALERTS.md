# TradingView Pine Script Unambiguous Semantic Alert Protocol

This document provides the standard Pine Script v5 code and alert configuration to ensure that **ENTRY**, **EXIT**, **PARTIAL PROFIT (P1/P2)**, and **SESSION CLOSE** signals are 100% unambiguous.

---

## 1. Why Not Use `{{strategy.order.action}}` Alone?

In Pine Script strategies:
- Closing a **Short** position produces an internal broker `BUY` action.
- If the alert message only sends `{"action":"{{strategy.order.action}}"}`, the backend receives `"BUY"` and cannot distinguish between a **New CE Entry** vs **Exit of a Short Position**.

---

## 2. Standard Semantic JSON Alert Format

Use `{{strategy.order.alert_message}}` in TradingView's Alert Message box.

In your Pine Script code, supply the explicit JSON message for each order type:

### A. UP / CE Entry
```pinescript
strategy.entry("UP", strategy.long, alert_message='{"event":"ENTRY","direction":"UP","option_type":"CE","symbol":"NIFTY","price":' + str.tostring(close) + '}')
```

### B. DOWN / PE Entry
```pinescript
strategy.entry("DOWN", strategy.short, alert_message='{"event":"ENTRY","direction":"DOWN","option_type":"PE","symbol":"NIFTY","price":' + str.tostring(close) + '}')
```

### C. UP / Long SL / Target / Trail Exit
```pinescript
strategy.exit("Exit UP", "UP", stop=longStopPrice, limit=longTargetPrice, alert_message='{"event":"EXIT","direction":"UP","option_type":"CE","exit_reason":"STRATEGY_EXIT","symbol":"NIFTY","price":' + str.tostring(close) + '}')
```

### D. DOWN / Short SL / Target / Trail Exit
```pinescript
strategy.exit("Exit DOWN", "DOWN", stop=shortStopPrice, limit=shortTargetPrice, alert_message='{"event":"EXIT","direction":"DOWN","option_type":"PE","exit_reason":"STRATEGY_EXIT","symbol":"NIFTY","price":' + str.tostring(close) + '}')
```

### E. Partial Profit Booking (P1 / P2)
```pinescript
// Partial exit of 65 qty (1 lot)
strategy.close("UP", qty=65, comment="P1", alert_message='{"event":"EXIT","direction":"UP","option_type":"CE","exit_reason":"P1","qty":65,"symbol":"NIFTY","price":' + str.tostring(close) + '}')
```

### F. Session Close / End-of-Day Exit
```pinescript
strategy.close_all(comment="Session Close", alert_message='{"event":"EXIT","direction":"CURRENT","exit_reason":"SESSION_CLOSE","symbol":"NIFTY","price":' + str.tostring(close) + '}')
```

---

## 3. TradingView Alert Dialog Configuration

When creating the Alert on TradingView:

1. **Condition**: Select your Strategy name.
2. **Trigger**: *Order fills only* (or *Once Per Bar Close*).
3. **Webhook URL**: `https://api.hellotrader.in/api/webhook/<your-user-webhook-token>`
4. **Message Box**:
```
{{strategy.order.alert_message}}
```
*(Leave the message box with strictly `{{strategy.order.alert_message}}`)*