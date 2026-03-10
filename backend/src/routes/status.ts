import type { FastifyInstance } from "fastify";
import { getDhanClient } from "../lib/credentials.js";
import { DhanTokenExpiredError } from "../types.js";

export async function statusRoute(fastify: FastifyInstance) {
  fastify.get("/status", async (_request, reply) => {
    try {
      const client = getDhanClient();
      // Use getFunds as a lightweight connectivity check
      await client.getFunds();
      return reply.send({ status: "connected", message: "Dhan account connected successfully" });
    } catch (err) {
      if (err instanceof DhanTokenExpiredError) {
        return reply.status(401).send({ status: "token_expired", message: err.message });
      }
      if (err instanceof Error && err.message.includes("credentials not configured")) {
        return reply.status(500).send({ status: "misconfigured", message: err.message });
      }
      return reply.status(503).send({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
