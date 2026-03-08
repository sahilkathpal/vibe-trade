# ADR-008: Trade Records — Per-Strategy P&L Tracking

## Status
Accepted

## Context

VibeTrade could place orders but had no memory of them. Once a trade was approved and submitted to Dhan, the only way to review it was through `get_orders` (today's order book, no history) or by manually checking the Dhan app. There was no link between a trade and the strategy that motivated it, no P&L tracking, and no way to evaluate strategy performance over time.

The missing capability is a **trade log**: a persistent record of every order placed through VibeTrade, tagged to the strategy that originated it, with fill prices and realized P&L populated via a sync against Dhan's tradebook API.

---

## Decisions

### 1. TradeRecord is written at placement, completed at sync

When a `place_order` succeeds, a `TradeRecord` is immediately appended with `status: "pending"` and the requested price. Actual fill data (executedPrice, filledAt, realizedPnl) is populated later by calling `sync_tradebook`, which pulls `GET /v2/tradebook` from Dhan and matches fills by `orderId`.

**Rationale:** Dhan's tradebook only reflects today's fills and may lag by seconds. Writing a pending record at placement guarantees every order is captured even if the sync never happens (e.g. backend restarts before the fill arrives). The pending record also provides an audit trail for MARKET orders where the fill price is unknown at submission time.

**Consequence:** P&L on SELL trades is only meaningful after sync. The UI surfaces a "Sync fills" button on the dashboard and notes fill prices may be provisional.

### 2. P&L uses average cost basis, computed at sync time

When a SELL fill is synced, `realizedPnl` is computed as:

```
avgBuyPrice = sum(executedPrice × quantity) / sum(quantity)
             for all prior filled BUY trades of the same symbol + strategyId
realizedPnl = (sellPrice − avgBuyPrice) × sellQuantity
```

This is stored on the `TradeRecord` rather than recomputed on every query.

**Rejected:** FIFO matching (match each SELL lot against the earliest unmatched BUY lot). More accurate for tax purposes but significantly more complex to implement and maintain. AVCO is sufficient for strategy performance evaluation, which is the primary use case here.

**Consequence:** P&L figures may differ from broker statements which may use FIFO for tax reporting. This is a trading assistant, not an accounting tool.

### 3. Auto-recording is a side effect at the execution layer, not a tool call

Trades are recorded automatically in two places:
- `chat.ts`: after every approved `place_order` succeeds
- `heartbeat/service.ts`: after every successful `hard_order` trigger execution

Claude does not need to call a `record_trade` tool. This ensures 100% capture regardless of whether Claude chooses to record, and keeps the tool list clean.

**Rejected:** A `record_trade` tool that Claude calls after placing an order. This would miss captures if Claude omits the call, and would create an awkward two-step (place + record) for what is logically one operation.

### 4. strategyId is the primary partitioning key

Every `TradeRecord` carries an optional `strategyId`. The `place_order` tool accepts an optional `strategy_id` parameter so Claude can tag trades at placement time. Heartbeat hard orders inherit the `strategyId` from the trigger that fired them.

Untagged trades (no strategyId) are still recorded and appear in the global `GET /api/trades` endpoint but not in any strategy-specific performance view.

**Consequence:** Trades placed without specifying a strategy (e.g. ad-hoc trades in chat) won't appear in strategy P&L. This is intentional — unattributed trades should not distort strategy metrics.

### 5. LocalTradeStore uses a JSON array file, not JSONL

`trades.json` stores a `TradeRecord[]`. Unlike the append-only audit log stores (JSONL), trade records need in-place updates (status, executedPrice, realizedPnl). A JSON array with full-file rewrite on mutation is the simplest consistent choice given the existing pattern in `LocalStrategyStore`.

**Consequence:** The file is fully rewritten on every `update()` call. For the expected volume (hundreds to low thousands of trades), this is negligible. When switching to a hosted DB, `TradeStore.update()` maps naturally to a single `UPDATE` statement.

### 6. Performance aggregation is computed on read, not stored

`GET /api/strategies/:id/performance` loads all filled trades for the strategy and computes stats (P&L, win rate, open positions, capital deployment) at request time. There is no materialized performance summary.

**Rationale:** Trade volume per strategy is low. Recomputing on every request costs ~1ms for hundreds of records and avoids a secondary write on every sync. If performance becomes an issue, a cached summary can be added without changing the interface.

---

## Data Model

```typescript
type TradeStatus = "pending" | "filled" | "cancelled" | "rejected";

interface TradeRecord {
  id: string;
  orderId: string;           // Dhan order ID returned from place_order
  symbol: string;            // NSE ticker, uppercased
  securityId: string;        // Dhan security ID at placement time
  transactionType: "BUY" | "SELL";
  quantity: number;
  orderType: "MARKET" | "LIMIT";
  requestedPrice?: number;   // Limit price (LIMIT orders); undefined for MARKET
  executedPrice?: number;    // Populated by sync_tradebook
  status: TradeStatus;
  strategyId?: string;       // Links to Strategy.id
  note?: string;             // Claude's reasoning or trigger name
  realizedPnl?: number;      // Populated by sync on SELL fills (AVCO basis)
  createdAt: string;         // ISO timestamp at placement
  filledAt?: string;         // ISO timestamp from Dhan tradebook
}

interface TradeStore {
  append(trade: TradeRecord): Promise<void>;
  list(filter?: {
    strategyId?: string;
    symbol?: string;
    fromDate?: string;
    toDate?: string;
    status?: TradeStatus;
  }): Promise<TradeRecord[]>;
  get(id: string): Promise<TradeRecord | null>;
  update(id: string, patch: Partial<TradeRecord>): Promise<void>;
}
```

---

## API Surface

```
GET  /api/strategies/:id/performance   — aggregated P&L, win rate, open positions, capital deployment
GET  /api/strategies/:id/trades        — raw TradeRecord[] for a strategy
POST /api/trades/sync                  — pull Dhan tradebook, update pending records with fill data
GET  /api/trades                       — all trades, optional ?strategyId=&symbol=&status= filters
```

Chat tools: `get_trade_history`, `sync_tradebook`, `get_strategy_performance`.

---

## File Layout

```
backend/src/lib/storage/
  types.ts                            — TradeRecord, TradeStatus, TradeStore added
  local/
    trade-store.ts                    — LocalTradeStore (trades.json, JSON array)
    index.ts                          — LocalStorageProvider.trades added

backend/src/routes/
  strategies.ts                       — /performance, /trades, /trades/sync endpoints added

frontend/src/components/
  StrategyDashboard.tsx               — per-strategy P&L view
  StrategiesPanel.tsx                 — "Performance" button per strategy card
```

---

## Consequences

- Every order placed through VibeTrade is captured in `backend/data/trades.json`, providing a durable audit trail independent of Dhan's 24-hour token expiry cycle.
- P&L figures require a manual or scheduled sync against Dhan's tradebook. For strategies using automated triggers, a `sync_tradebook` call can be added to the daily schedule prompt.
- Switching to a hosted database only requires a new `PostgresTradeStore` implementing the `TradeStore` interface and a one-line change in `createStorageProvider()`. No route or tool changes are needed.
- The `place_order` tool now accepts `strategy_id` and `note` as optional params. Existing callers are unaffected (both fields are optional).
