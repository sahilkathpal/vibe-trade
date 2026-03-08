# ADR-007: Strategy Entity — Named Trading Policies

## Status
Accepted

## Context

VibeTrade had triggers, schedules, and reasoning jobs — but they were ungrouped. Each ran independently with no shared context about *why* they existed or what capital envelope they operated within. A user could register ten triggers and have no way to know which were related, or ensure they all followed the same risk rules.

The missing concept is a **strategy**: a named trading policy with its own capital allocation, written plan, and operational state. Strategies provide:

- A human-readable container for related triggers and schedules
- A plan text that the LLM reads before making decisions, ensuring consistency across all reasoning jobs under that strategy
- A capital allocation that is compared against live balance before any trade is queued
- An operational state machine (`scanning → accumulating → holding → exiting → paused`) that the LLM and user can advance

---

## Decisions

### 1. Plan is free-form text, not parsed rules

The `plan` field is injected verbatim into the LLM's system prompt when a reasoning job runs under this strategy. The LLM acts as executor: it reads the plan, checks market conditions using tools, and decides whether to queue a trade or do nothing.

**Rejected:** A structured DSL for encoding entry/exit conditions in machine-readable form. This would require a parser, a rule engine, and ongoing maintenance as new condition types are needed. The LLM is already a general-purpose rule evaluator — using it avoids all of that complexity.

**Consequence:** Plan quality determines decision quality. A specific, well-written plan ("Enter when price breaks 52-week high with RSI 50–65 and volume > 1.5× avg") produces better decisions than a vague one. Risk rules are not code-enforced; they are honoured because the LLM reads them.

### 2. Strategy state is descriptive, not prescriptive

States (`scanning`, `accumulating`, `holding`, `exiting`, `paused`) describe the strategy's current phase. The LLM reads them as context and the user can advance them via chat. No code gates tool access based on state.

**Rationale:** Prescriptive state machines (e.g. "cannot queue a BUY in `exiting` state") would require enumerating all valid transitions and checking them in the runner — brittle as the strategy space grows. The LLM can be trusted to respect the state when it is clearly stated in the plan.

### 3. Funds check is injected, not enforced

When a reasoning job fires under a strategy-linked trigger or schedule, the runner fetches `availableBalance` from the live snapshot (heartbeat) or `dhan.getFunds()` (scheduler) and injects it into the strategy context block alongside the allocation. If balance < allocation, a warning flag is included. The block ends with an explicit instruction to call `no_action` if funds are insufficient.

**Rejected:** Hard-blocking trade queuing when balance < allocation. This would require the runner to parse trade amounts and compare them — complex and fragile. The LLM can perform this check itself when given the numbers.

**Rejected:** Only checking funds at approval execution time (when the user clicks approve). This catches the failure late — the user has already reviewed a trade that cannot execute. Injecting funds at reasoning time catches it before the approval is even queued.

### 4. strategyId is a loose foreign key on Trigger and Schedule

Triggers and schedules gain an optional `strategyId` field. No referential integrity is enforced — if a strategy is archived, its linked triggers and schedules continue to run (they just won't inject strategy context, since the store returns `null` for archived strategies). This is intentional: archiving a strategy should not silently cancel active triggers.

**Consequence:** Users must manually cancel triggers and schedules when archiving a strategy.

### 5. @mention in chat injects strategy context per-turn

When the user types `@StrategyName` in the chat input, the backend resolves the mention to an active strategy and appends its plan as a `<strategy>` block to that turn's system prompt. This makes the plan available to the LLM without the user needing to call `list_strategies` first.

The frontend shows an autocomplete dropdown when `@` is typed, with a 30-second cache of the strategy list.

### 6. Storage is a JSON file, same pattern as triggers

Strategies are stored in `backend/data/strategies.json` with an in-memory write-through cache. The `LocalStrategyStore` follows the same interface pattern as `LocalTriggerStore`. Archiving sets `status = "archived"` and filters it from default list queries — no hard delete.

---

## Data Model

```typescript
type StrategyState  = "scanning" | "accumulating" | "holding" | "exiting" | "paused";
type StrategyStatus = "active" | "archived";

interface Strategy {
  id: string;
  name: string;
  description: string;
  plan: string;           // Injected verbatim into LLM system prompt
  allocation: number;     // Capital envelope in INR
  state: StrategyState;
  status: StrategyStatus;
  createdAt: string;
  updatedAt: string;
}
```

`strategyId?: string` added to `Trigger`, `Schedule`, `PendingApproval`, `TriggerAuditEntry`, `ScheduleRun` for traceability.

---

## API Surface

```
GET    /api/strategies            — list active (or ?status=archived|all)
POST   /api/strategies            — create
GET    /api/strategies/:id        — get with linkedTriggers + linkedSchedules
PATCH  /api/strategies/:id/state  — update state
PATCH  /api/strategies/:id/plan   — update plan text
DELETE /api/strategies/:id        — archive
```

Chat tools: `create_strategy`, `update_strategy_state`, `update_strategy_plan`, `list_strategies`, `archive_strategy`.

---

## Consequences

- The `create_strategy` tool description instructs the LLM to propose concrete triggers and schedules after creation, driving the proactive post-creation UX entirely through the tool description — no code change required.
- Strategy context injection adds one `strategyStore.get()` call per reasoning job. For the scheduler runner, one additional `dhan.getFunds()` call is made in parallel when a strategy is linked.
- The Strategies tab in the frontend shows state-colored badges, collapsible plan text, and an archive button. Triggers and schedule cards show a violet strategy tag when linked.
