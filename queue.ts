/**
 * Request Queue Module
 * Implements FIFO request queue with concurrency control for the Tempo API Proxy
 */

// ============== Types ==============

export interface QueueConfig {
  maxConcurrent: number;   // Maximum concurrent requests
  maxQueueSize: number;    // Maximum queue length
}

export interface QueueStatus {
  pending: number;         // Requests waiting in queue
  active: number;          // Requests currently being processed
}

interface QueuedTask<T> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

// ============== Configuration ==============

/**
 * Get queue configuration from environment variables
 */
export function getQueueConfig(): QueueConfig {
  const maxConcurrent = parseInt(Deno.env.get("MAX_CONCURRENT") || "5", 10);
  const maxQueueSize = parseInt(Deno.env.get("MAX_QUEUE_SIZE") || "100", 10);

  return {
    maxConcurrent: isNaN(maxConcurrent) ? 5 : maxConcurrent,
    maxQueueSize: isNaN(maxQueueSize) ? 100 : maxQueueSize,
  };
}

// ============== Request Queue ==============

/**
 * FIFO Request Queue with concurrency control
 * Manages concurrent requests to prevent overwhelming upstream API
 */
export class RequestQueue {
  private queue: QueuedTask<unknown>[] = [];
  private activeCount = 0;
  private config: QueueConfig;
  private processedOrder: number[] = [];  // Track order for testing

  constructor(config?: Partial<QueueConfig>) {
    const defaultConfig = getQueueConfig();
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? defaultConfig.maxConcurrent,
      maxQueueSize: config?.maxQueueSize ?? defaultConfig.maxQueueSize,
    };
  }

  /**
   * Enqueue a task for execution
   * @param task - Async function to execute
   * @returns Promise that resolves when task completes
   * @throws Error if queue is full
   */
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    // Check if queue is full
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new QueueFullError("Queue is full");
    }

    // If we have capacity, execute immediately
    if (this.activeCount < this.config.maxConcurrent) {
      return this.executeTask(task);
    }

    // Otherwise, add to queue and wait
    return new Promise<T>((resolve, reject) => {
      const queuedTask: QueuedTask<T> = {
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
      };
      this.queue.push(queuedTask as QueuedTask<unknown>);
    });
  }

  /**
   * Execute a task and process next in queue when done
   */
  private async executeTask<T>(task: () => Promise<T>): Promise<T> {
    this.activeCount++;
    const taskId = Date.now() + Math.random();
    
    try {
      const result = await task();
      this.processedOrder.push(taskId);
      return result;
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  /**
   * Process the next task in the queue
   */
  private processNext(): void {
    if (this.queue.length === 0 || this.activeCount >= this.config.maxConcurrent) {
      return;
    }

    const next = this.queue.shift();
    if (next) {
      this.activeCount++;
      const taskId = Date.now() + Math.random();
      
      next.task()
        .then((result) => {
          this.processedOrder.push(taskId);
          next.resolve(result);
        })
        .catch((error) => {
          next.reject(error);
        })
        .finally(() => {
          this.activeCount--;
          this.processNext();
        });
    }
  }

  /**
   * Get current queue status
   */
  getStatus(): QueueStatus {
    return {
      pending: this.queue.length,
      active: this.activeCount,
    };
  }

  /**
   * Check if queue can accept more requests
   */
  canAccept(): boolean {
    return this.queue.length < this.config.maxQueueSize;
  }

  /**
   * Check if there's immediate capacity (no queueing needed)
   */
  hasCapacity(): boolean {
    return this.activeCount < this.config.maxConcurrent;
  }

  /**
   * Get current configuration
   */
  getConfig(): QueueConfig {
    return { ...this.config };
  }

  /**
   * Reset queue state (useful for testing)
   */
  reset(): void {
    this.queue = [];
    this.activeCount = 0;
    this.processedOrder = [];
  }

  /**
   * Get processed order (for testing FIFO property)
   */
  getProcessedOrder(): number[] {
    return [...this.processedOrder];
  }
}

// ============== Custom Errors ==============

export class QueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueFullError";
  }
}

// ============== Singleton Instance ==============

let queueInstance: RequestQueue | null = null;

/**
 * Get the global request queue instance
 */
export function getRequestQueue(): RequestQueue {
  if (!queueInstance) {
    queueInstance = new RequestQueue();
  }
  return queueInstance;
}

/**
 * Reset the global request queue instance (useful for testing)
 */
export function resetRequestQueue(): void {
  if (queueInstance) {
    queueInstance.reset();
    queueInstance = null;
  }
}
