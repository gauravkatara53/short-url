import type { Request, Response } from 'express';

interface MetricsRegistry {
  http: {
    totalRequests: number;
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
    byRoute: Record<string, number>;
  };
  redirects: {
    total: number;
    cacheHits: number;
    cacheMisses: number;
    notFound: number;
    expired: number;
  };
  cache: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
  };
  kafka: {
    producesSuccess: number;
    producesFailed: number;
    consumesSuccess: number;
    consumesFailed: number;
  };
  clickhouse: {
    insertsSuccess: number;
    insertsFailed: number;
  };
}

class TelemetryMetrics {
  private startedAt: number = Date.now();
  private data: MetricsRegistry = {
    http: {
      totalRequests: 0,
      status2xx: 0,
      status3xx: 0,
      status4xx: 0,
      status5xx: 0,
      byRoute: {},
    },
    redirects: {
      total: 0,
      cacheHits: 0,
      cacheMisses: 0,
      notFound: 0,
      expired: 0,
    },
    cache: {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    },
    kafka: {
      producesSuccess: 0,
      producesFailed: 0,
      consumesSuccess: 0,
      consumesFailed: 0,
    },
    clickhouse: {
      insertsSuccess: 0,
      insertsFailed: 0,
    },
  };

  recordHttpRequest(method: string, route: string, statusCode: number): void {
    this.data.http.totalRequests++;
    if (statusCode >= 200 && statusCode < 300) this.data.http.status2xx++;
    else if (statusCode >= 300 && statusCode < 400) this.data.http.status3xx++;
    else if (statusCode >= 400 && statusCode < 500) this.data.http.status4xx++;
    else if (statusCode >= 500) this.data.http.status5xx++;

    const key = `${method} ${route}`;
    this.data.http.byRoute[key] = (this.data.http.byRoute[key] || 0) + 1;
  }

  recordRedirect(result: 'cache_hit' | 'cache_miss' | 'not_found' | 'expired'): void {
    this.data.redirects.total++;
    if (result === 'cache_hit') this.data.redirects.cacheHits++;
    else if (result === 'cache_miss') this.data.redirects.cacheMisses++;
    else if (result === 'not_found') this.data.redirects.notFound++;
    else if (result === 'expired') this.data.redirects.expired++;
  }

  recordCache(op: 'hit' | 'miss' | 'set' | 'del'): void {
    if (op === 'hit') this.data.cache.hits++;
    else if (op === 'miss') this.data.cache.misses++;
    else if (op === 'set') this.data.cache.sets++;
    else if (op === 'del') this.data.cache.deletes++;
  }

  recordKafkaProduce(success: boolean): void {
    if (success) this.data.kafka.producesSuccess++;
    else this.data.kafka.producesFailed++;
  }

  recordKafkaConsume(success: boolean): void {
    if (success) this.data.kafka.consumesSuccess++;
    else this.data.kafka.consumesFailed++;
  }

  recordClickHouseInsert(success: boolean, count = 1): void {
    if (success) this.data.clickhouse.insertsSuccess += count;
    else this.data.clickhouse.insertsFailed += count;
  }

  getSnapshot(): object {
    const memory = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024) * 100) / 100,
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024) * 100) / 100,
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024) * 100) / 100,
      },
      ...this.data,
    };
  }

  reset(): void {
    this.startedAt = Date.now();
    this.data.http.totalRequests = 0;
    this.data.http.status2xx = 0;
    this.data.http.status3xx = 0;
    this.data.http.status4xx = 0;
    this.data.http.status5xx = 0;
    this.data.http.byRoute = {};
    this.data.redirects = { total: 0, cacheHits: 0, cacheMisses: 0, notFound: 0, expired: 0 };
    this.data.cache = { hits: 0, misses: 0, sets: 0, deletes: 0 };
    this.data.kafka = { producesSuccess: 0, producesFailed: 0, consumesSuccess: 0, consumesFailed: 0 };
    this.data.clickhouse = { insertsSuccess: 0, insertsFailed: 0 };
  }
}

export const metrics = new TelemetryMetrics();

/**
 * Controller for GET /api/metrics
 */
export function getMetricsHandler(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    data: metrics.getSnapshot(),
  });
}
