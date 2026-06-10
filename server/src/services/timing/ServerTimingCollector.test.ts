import { describe, it, expect, afterEach } from 'bun:test'
import {
  ServerTimingCollector,
  ServerTimingEventName,
} from './ServerTimingCollector.js'

describe('ServerTimingCollector', () => {
  let collector: ServerTimingCollector | null = null

  afterEach(async () => {
    // Stop the periodic flush timer so the test process can exit cleanly.
    if (collector) {
      await collector.shutdown()
      collector = null
    }
  })

  it('bounds activeTimings so unfinished interactions cannot grow unbounded', () => {
    collector = new ServerTimingCollector()
    const cap = (collector as any).MAX_ACTIVE_TIMINGS as number

    // Start far more interactions than the cap, never finalizing/clearing them.
    for (let i = 0; i < cap + 50; i++) {
      collector.startInteraction(`interaction-${i}`, 'user-1')
    }

    const size = (collector as any).activeTimings.size as number
    expect(size).toBeLessThanOrEqual(cap)
  })

  it('keeps timing the most recent interactions after eviction', () => {
    collector = new ServerTimingCollector()
    const cap = (collector as any).MAX_ACTIVE_TIMINGS as number

    for (let i = 0; i < cap + 10; i++) {
      collector.startInteraction(`interaction-${i}`, 'user-1')
    }

    // The newest interaction must still be tracked (oldest ones were evicted).
    const newest = `interaction-${cap + 9}`
    collector.startTiming(ServerTimingEventName.TOTAL_PROCESSING, newest)
    expect((collector as any).activeTimings.has(newest)).toBe(true)
  })
})
