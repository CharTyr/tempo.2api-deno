/**
 * Statistics Collector for Tempo API Proxy
 * Tracks request counts, response times, and per-model usage
 * 
 * **Feature: tempo-proxy-enhancements, Statistics Collector**
 * **Validates: Requirements 8.1, 8.2, 8.3**
 */

// ============== Types ==============

export interface Stats {
  startTime: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  totalResponseTime: number;
  modelCounts: Record<string, number>;
}

export interface StatsResponse {
  uptime: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  averageResponseTime: number;
  modelUsage: Record<string, number>;
}

// ============== Statistics Collector ==============

export class StatsCollector {
  private stats: Stats;

  constructor() {
    this.stats = {
      startTime: Date.now(),
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      modelCounts: {},
    };
  }

  /**
   * Record a request with its model, duration, and success status
   * @param model - The model name used for the request
   * @param duration - Response time in milliseconds
   * @param success - Whether the request was successful
   */
  recordRequest(model: string, duration: number, success: boolean): void {
    this.stats.totalRequests++;
    this.stats.totalResponseTime += duration;

    if (success) {
      this.stats.successCount++;
    } else {
      this.stats.errorCount++;
    }

    // Track per-model counts
    if (!this.stats.modelCounts[model]) {
      this.stats.modelCounts[model] = 0;
    }
    this.stats.modelCounts[model]++;
  }

  /**
   * Get the current statistics
   * @returns Stats with calculated averages and uptime
   */
  getStats(): StatsResponse {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const averageResponseTime = this.stats.totalRequests > 0
      ? Math.round(this.stats.totalResponseTime / this.stats.totalRequests)
      : 0;
    const successRate = this.stats.totalRequests > 0
      ? Math.round((this.stats.successCount / this.stats.totalRequests) * 100 * 100) / 100
      : 100;

    return {
      uptime,
      totalRequests: this.stats.totalRequests,
      successCount: this.stats.successCount,
      errorCount: this.stats.errorCount,
      successRate,
      averageResponseTime,
      modelUsage: { ...this.stats.modelCounts },
    };
  }

  /**
   * Get raw stats for testing purposes
   */
  getRawStats(): Stats {
    return { ...this.stats, modelCounts: { ...this.stats.modelCounts } };
  }

  /**
   * Reset statistics (useful for testing)
   */
  reset(): void {
    this.stats = {
      startTime: Date.now(),
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      modelCounts: {},
    };
  }
}

// ============== Singleton Instance ==============

let statsCollector: StatsCollector | null = null;

/**
 * Get the global stats collector instance
 */
export function getStatsCollector(): StatsCollector {
  if (!statsCollector) {
    statsCollector = new StatsCollector();
  }
  return statsCollector;
}

/**
 * Reset the global stats collector (for testing)
 */
export function resetStatsCollector(): void {
  if (statsCollector) {
    statsCollector.reset();
  }
  statsCollector = null;
}
