import type { CheckResult } from '../types.js';

export class TaskRunner {
  concurrency: number;

  constructor(concurrency: number = 4) {
    this.concurrency = concurrency;
  }

  async execute(tasks: Array<{ run: (...args: unknown[]) => Promise<unknown>; name: string }>, context: unknown): Promise<CheckResult[]> {
    const results = new Array<CheckResult>(tasks.length);
    let nextIndex = 0;

    const runTask = async (task: { run: (...args: unknown[]) => Promise<unknown>; name: string }, index: number) => {
      try {
        const result = await task.run(context) as Omit<CheckResult, 'name'>;
        results[index] = { name: task.name, ...result } as CheckResult;
      } catch (error) {
        const err = error as { message: string };
        results[index] = {
          name: task.name,
          success: false,
          message: err.message,
        } as CheckResult;
      }
    };

    const worker = async () => {
      while (nextIndex < tasks.length) {
        const index = nextIndex;
        nextIndex += 1;
        await runTask(tasks[index]!, index);
      }
    };

    const workerCount = Math.min(this.concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }
}
