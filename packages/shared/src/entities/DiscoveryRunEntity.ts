import { Table } from "dynamodb-onetable";
import type { AppTableSchema } from "./schema.js";

export interface DiscoveryRun {
  status: "running" | "completed" | "failed";
  triggeredBy: string;
  startedAt: string;
  completedAt?: string | undefined;
  discovered?: number | undefined;
  enqueued?: number | undefined;
  skipped?: number | undefined;
  errors?: number | undefined;
  errorMessage?: string | undefined;
}

export class DiscoveryRunEntity {
  private model;

  constructor(table: Table<typeof AppTableSchema>) {
    this.model = table.getModel("DiscoveryRun");
  }

  private toExternal(item: Record<string, unknown>): DiscoveryRun {
    return {
      status: item.status as DiscoveryRun["status"],
      triggeredBy: item.triggeredBy as string,
      startedAt: item.startedAt as string,
      completedAt: item.completedAt as string | undefined,
      discovered: item.discovered as number | undefined,
      enqueued: item.enqueued as number | undefined,
      skipped: item.skipped as number | undefined,
      errors: item.errors as number | undefined,
      errorMessage: item.errorMessage as string | undefined,
    };
  }

  async markRunning(triggeredBy: string): Promise<void> {
    await this.model.upsert(
      {
        status: "running",
        triggeredBy,
        startedAt: new Date().toISOString(),
      } as never,
      { exists: null },
    );
  }

  async markCompleted(stats: {
    discovered: number;
    enqueued: number;
    skipped: number;
    errors: number;
  }): Promise<void> {
    await this.model.update({
      status: "completed",
      completedAt: new Date().toISOString(),
      discovered: stats.discovered,
      enqueued: stats.enqueued,
      skipped: stats.skipped,
      errors: stats.errors,
    } as never);
  }

  async markFailed(errorMessage: string): Promise<void> {
    await this.model.update({
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage,
    } as never);
  }

  async getLatest(): Promise<DiscoveryRun | null> {
    const item = await this.model.get({} as never);
    if (!item) return null;
    return this.toExternal(item as unknown as Record<string, unknown>);
  }
}
