import type { ClickEvent } from '../types/index.js';
import { insertClickEvent } from './clickhouse.service.js';

/**
 * Interface for click event storage/analytics engines.
 * This abstraction allows seamless integration of analytics sinks.
 */
export interface IEventProcessor {
  process(event: ClickEvent): Promise<void>;
}

/**
 * Standard Click Event Processor for Phase 5.
 * Validates, enriches, and persists the event stream into ClickHouse Cloud.
 */
export class ClickEventProcessor implements IEventProcessor {
  async process(event: ClickEvent): Promise<void> {
    const startTime = Date.now();
    // 1. Structured log of the incoming event
    console.log(
      `[EVENT_PROCESSOR] ⏳ Processing click event: ` +
        `clickId=${event.clickId}, ` +
        `shortCode=${event.shortCode}, ` +
        `urlId=${event.urlId}, ` +
        `device=${event.device}, ` +
        `browser=${event.browser}, ` +
        `os=${event.operatingSystem}, ` +
        `referrer=${event.referrer || 'direct'}, ` +
        `ip=${event.ipAddress || 'unknown'}, ` +
        `timestamp=${event.timestamp}`,
    );

    // 2. Persist to ClickHouse Cloud OLAP database
    try {
      await insertClickEvent(event);
      const duration = Date.now() - startTime;
      console.log(`[EVENT_PROCESSOR] ✅ Successfully processed event in ${duration}ms: clickId=${event.clickId}`);
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`[EVENT_PROCESSOR] ❌ Failed to process event after ${duration}ms: clickId=${event.clickId}, error=${(err as Error).message}`);
      throw err;
    }
  }
}

// Singleton event processor instance
export const defaultEventProcessor: IEventProcessor = new ClickEventProcessor();

/**
 * Process a validated click event.
 */
export async function processClickEvent(event: ClickEvent): Promise<void> {
  await defaultEventProcessor.process(event);
}
