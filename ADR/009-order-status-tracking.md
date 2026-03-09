# ADR-009: Order Status Tracking

## Status
Accepted

## Context

After ADR-008 introduced trade records, `place_order` only returned `{"orderId": "..."}` — a submission confirmation with no fill or rejection information. Claude had no immediate feedback about whether an order was accepted, filled, or rejected. Compounding this, `sync_tradebook` only detected fills via `GET /v2/tradebook` and never detected rejections (which appear only in `GET /v2/orders`), so rejected orders remained `"pending"` in local storage indefinitely.

Two practical failures resulted:

1. Claude would say "order placed" and move on, even when the order was immediately rejected (e.g., invalid quantity, insufficient margin).
2. Pending records for rejected/cancelled orders accumulated and cluttered the trade log, inflating "open positions" counts and distorting P&L reports.

---

## Decisions

### 1. `place_order` polls for immediate status (1.5 s delay)

After Dhan returns `{ orderId }`, the handler waits 1.5 seconds and calls `GET /v2/orders/{orderId}`. The response is parsed and returned alongside the orderId:

```json
{
  "orderId": "...",
  "currentStatus": "TRADED",
  "executedPrice": 2345.50,
  "rejectionReason": null,
  "filledAt": "2026-03-09T09:17:03.000Z",
  "message": "Order filled at ₹2345.5"
}
```

If the poll fails (network error, rate limit), the original Dhan response is returned unchanged — no failure propagation.

**Rationale:** 1.5 s is long enough for MARKET orders and most fast-path rejections to settle. The immediate feedback changes Claude's conversational output from "order submitted" to "order filled at ₹X" or "order REJECTED: insufficient margin", making it genuinely useful. The poll-fail fallback keeps the original approval flow intact.

### 2. Initial `TradeRecord` uses the polled status

The auto-recording block in `chat.ts` reads `currentStatus` from the enriched `place_order` result and writes the initial record with the correct status (`"filled"`, `"rejected"`, `"cancelled"`, or `"pending"`) and fill fields (`executedPrice`, `filledAt`, `rejectionReason`).

**Rationale:** Without this, MARKET orders always wrote a `"pending"` record and needed a subsequent `sync_tradebook` to become `"filled"`. Now the record is accurate at write time for the common case, and `sync_tradebook` / `syncOrders` only needs to handle edge cases.

### 3. Unified `syncOrders()` in `lib/order-sync.ts`

A shared `syncOrders(client, store)` function replaces the fill-only logic that was inline in `sync_tradebook`. It runs in two passes:

- **Guard:** if no pending trades exist, return immediately (zero Dhan API calls).
- **Pass 1 — fills:** `GET /v2/tradebook` → match pending trades by `orderId` → write `status: "filled"`, `executedPrice`, `filledAt`, `realizedPnl`.
- **Pass 2 — rejections/cancellations:** `GET /v2/orders` → for still-pending trades, call `parseOrderStatus()` → if `REJECTED`, `CANCELLED`, or `EXPIRED`, write the final status with `rejectionReason`.

**Rationale:** Centralising the logic in one place ensures fill detection and rejection detection stay consistent across all callers (the `sync_tradebook` tool, the heartbeat, and the scheduler). The guard means that the typical case — no open orders — costs nothing.

### 4. `parseOrderStatus()` is the single Dhan→TradeStatus mapping

A pure function `parseOrderStatus(order)` maps the raw Dhan order object to a typed result. It uses dual-name defensive field lookups (`orderStatus ?? order_status`, etc.) and returns `tradeStatus: null` for statuses that require no local write (`TRANSIT`, `PENDING`, `OPEN`).

This function is also used by the `place_order` handler to parse the 1.5 s poll result, avoiding duplicated status mapping logic.

### 5. Heartbeat syncs once per tick, only before reasoning jobs

`syncOrders()` is called in `HeartbeatService.tick()` after evaluating triggers and before processing fired triggers — but only if at least one fired trigger is a `reasoning_job`. Hard-order-only ticks and ticks with no fires skip sync entirely.

**Rationale:** Reasoning jobs need accurate order state before the LLM reasons. Calling `syncOrders` once per tick (not per trigger) prevents redundant API calls when multiple reasoning jobs fire simultaneously. Hard-order triggers don't need prior-trade context. The guard inside `syncOrders` means zero Dhan API calls when there are no pending trades.

### 6. Scheduler pre-run sync

`runScheduleJob()` accepts an optional `tradeStore` parameter. When present, `syncOrders()` is called before the LLM loop starts. This gives scheduled analysis runs an up-to-date view of fills, P&L, and rejections.

`SchedulerService` receives `tradeStore` as a constructor parameter (after `strategyStore`) and threads it through to `runScheduleJob`.

---

## Data Flow

```
place_order approved
  → Dhan: POST /v2/orders → { orderId }
  → wait 1.5 s
  → Dhan: GET /v2/orders/{orderId} → parseOrderStatus()
  → return enriched result to Claude + write accurate initial TradeRecord

Heartbeat tick (≥1 reasoning_job fires):
  → syncOrders() once (guard: skip if no pending trades)
  → fills from GET /v2/tradebook
  → rejections from GET /v2/orders
  → runReasoningJob() with fresh state

Scheduled LLM run:
  → syncOrders() before LLM loop
  → LLM reasons with accurate trade state

sync_tradebook tool:
  → syncOrders() → { fillsUpdated, rejectedOrCancelledDetected }
```

---

## Files Changed

| File | Change |
|---|---|
| `lib/storage/types.ts` | Added `rejectionReason?: string` to `TradeRecord` |
| `lib/dhan/client.ts` | Added `getOrderById(orderId)` |
| `lib/order-sync.ts` | **New** — `parseOrderStatus()` + `syncOrders()` |
| `lib/tools.ts` | `place_order` handler enriched with 1.5 s poll; `sync_tradebook` refactored to call `syncOrders()` |
| `routes/chat.ts` | Auto-recording block uses polled status instead of always writing `"pending"` |
| `lib/heartbeat/service.ts` | `syncOrders()` called before reasoning jobs in `tick()` |
| `lib/scheduler/runner.ts` | `runScheduleJob()` gains optional `tradeStore` param; pre-run `syncOrders()` call |
| `lib/scheduler/service.ts` | `SchedulerService` gains optional `tradeStore` constructor param |
| `server.ts` | Passes `storage.trades` to `SchedulerService` |

---

## Alternatives Considered

**Poll with longer delay (5–10 s):** Would catch more LIMIT order confirmations but degrades chat responsiveness noticeably. The 1.5 s heuristic is tuned for MARKET orders and fast rejections; LIMIT orders pending confirmation fall through to `"pending"` and are resolved by later syncs.

**WebSocket order feed instead of polling:** Dhan offers an order update feed. This would eliminate the 1.5 s delay and the need for heartbeat/scheduler syncs entirely. Deferred — higher integration complexity, requires persistent connection management. The polling approach is good enough for current scale.

**Sync on every heartbeat tick:** Simple but wasteful. Most ticks have no pending trades and no reasoning jobs. The guard inside `syncOrders` handles this, but the function call overhead (and the async stack) is still non-zero. The current approach (conditional call only when reasoning jobs fire) is more precise.
