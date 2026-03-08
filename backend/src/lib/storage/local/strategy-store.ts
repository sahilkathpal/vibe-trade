import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { StrategyStore, Strategy, StrategyStatus, StrategyState } from "../types.js";

export class LocalStrategyStore implements StrategyStore {
  private filePath: string;
  private cache: Strategy[] | null = null;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "strategies.json");
  }

  private async load(): Promise<Strategy[]> {
    if (this.cache) return this.cache;
    try {
      const content = await readFile(this.filePath, "utf-8");
      this.cache = JSON.parse(content) as Strategy[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async save(strategies: Strategy[]): Promise<void> {
    this.cache = strategies;
    await writeFile(this.filePath, JSON.stringify(strategies, null, 2), "utf-8");
  }

  async list(filter?: { status?: StrategyStatus }): Promise<Strategy[]> {
    const all = await this.load();
    if (!filter?.status) return all.filter(s => s.status === "active");
    return all.filter(s => s.status === filter.status);
  }

  async get(id: string): Promise<Strategy | null> {
    const all = await this.load();
    return all.find(s => s.id === id) ?? null;
  }

  async upsert(strategy: Strategy): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex(s => s.id === strategy.id);
    if (idx >= 0) all[idx] = strategy;
    else all.push(strategy);
    await this.save(all);
  }

  async setStatus(id: string, status: StrategyStatus): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex(s => s.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], status, updatedAt: new Date().toISOString() };
    await this.save(all);
  }

  async setState(id: string, state: StrategyState): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex(s => s.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], state, updatedAt: new Date().toISOString() };
    await this.save(all);
  }

  async updatePlan(id: string, plan: string): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex(s => s.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], plan, updatedAt: new Date().toISOString() };
    await this.save(all);
  }
}
