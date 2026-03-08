import type { FastifyInstance } from "fastify";
import type { StrategyStore, TriggerStore, ScheduleStore } from "../lib/storage/index.js";

export async function strategiesRoute(
  fastify: FastifyInstance,
  opts: { strategies: StrategyStore; triggers: TriggerStore; schedules: ScheduleStore },
) {
  // GET /api/strategies — list
  fastify.get("/api/strategies", async (request) => {
    const query = request.query as { status?: string };
    const statusFilter = query.status === "archived" ? "archived" : query.status === "all" ? undefined : "active";
    if (query.status === "all") {
      const [active, archived] = await Promise.all([
        opts.strategies.list({ status: "active" }),
        opts.strategies.list({ status: "archived" }),
      ]);
      return [...active, ...archived];
    }
    return opts.strategies.list(statusFilter ? { status: statusFilter as "active" | "archived" } : undefined);
  });

  // POST /api/strategies — create
  fastify.post("/api/strategies", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { randomUUID } = await import("crypto");
    const now = new Date().toISOString();
    const strategy = {
      id: randomUUID(),
      name: body.name as string,
      description: body.description as string,
      plan: body.plan as string,
      allocation: body.allocation as number,
      state: (body.state as string ?? "scanning") as import("../lib/storage/types.js").StrategyState,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };
    await opts.strategies.upsert(strategy);
    reply.code(201);
    return strategy;
  });

  // GET /api/strategies/:id — get with linked triggers + schedules
  fastify.get("/api/strategies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const strategy = await opts.strategies.get(id);
    if (!strategy) {
      reply.code(404);
      return { error: "Not found" };
    }
    const [allTriggers, allSchedules] = await Promise.all([
      opts.triggers.list({ status: "active" }),
      opts.schedules.list(),
    ]);
    const linkedTriggers = allTriggers.filter(t => t.strategyId === id);
    const linkedSchedules = allSchedules.filter(s => s.strategyId === id);
    return { ...strategy, linkedTriggers, linkedSchedules };
  });

  // PATCH /api/strategies/:id/state — update state
  fastify.patch("/api/strategies/:id/state", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { state: string };
    const strategy = await opts.strategies.get(id);
    if (!strategy) {
      reply.code(404);
      return { error: "Not found" };
    }
    await opts.strategies.setState(id, body.state as import("../lib/storage/types.js").StrategyState);
    return { success: true };
  });

  // PATCH /api/strategies/:id/plan — update plan text
  fastify.patch("/api/strategies/:id/plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { plan: string };
    const strategy = await opts.strategies.get(id);
    if (!strategy) {
      reply.code(404);
      return { error: "Not found" };
    }
    await opts.strategies.updatePlan(id, body.plan);
    return { success: true };
  });

  // DELETE /api/strategies/:id — archive
  fastify.delete("/api/strategies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const strategy = await opts.strategies.get(id);
    if (!strategy) {
      reply.code(404);
      return { error: "Not found" };
    }
    await opts.strategies.setStatus(id, "archived");
    return { success: true };
  });
}
