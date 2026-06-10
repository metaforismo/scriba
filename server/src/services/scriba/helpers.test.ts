import { describe, it, expect } from 'bun:test'
import {
  detectScribaMode,
  getScribaMode,
  resolveNumberInRange,
} from './helpers.js'
import {
  LLMTemperatureSchema,
  NoSpeechThresholdSchema,
} from '../../validation/schemas.js'
import { ScribaMode } from '../../generated/scriba_pb.js'

describe('detectScribaMode', () => {
  it('detects EDIT when the utterance starts with the wake phrase', () => {
    expect(detectScribaMode('Hey Scriba, make this more formal')).toBe(
      ScribaMode.EDIT,
    )
    expect(detectScribaMode('hey scriba summarize this')).toBe(ScribaMode.EDIT)
  })

  it('tolerates leading punctuation/whitespace and an inner comma', () => {
    expect(detectScribaMode('  Hey, Scriba fix the grammar')).toBe(
      ScribaMode.EDIT,
    )
    expect(detectScribaMode('- hey scriba translate this')).toBe(ScribaMode.EDIT)
  })

  it('tolerates common ASR mishearings of "scriba"', () => {
    expect(detectScribaMode('Hey Scribe, rewrite this')).toBe(ScribaMode.EDIT)
    expect(detectScribaMode('hey scribba make it shorter')).toBe(ScribaMode.EDIT)
    expect(detectScribaMode('Hey Scribah, capitalize this')).toBe(
      ScribaMode.EDIT,
    )
  })

  it('does NOT trigger EDIT when the phrase appears mid-dictation', () => {
    // This is the key false-positive the old "first 5 words, anywhere" check hit.
    expect(detectScribaMode('I told him hey Scriba is great')).toBe(
      ScribaMode.TRANSCRIBE,
    )
    expect(detectScribaMode('so then hey scriba showed up')).toBe(
      ScribaMode.TRANSCRIBE,
    )
  })

  it('does not match unrelated "scri..." words', () => {
    expect(detectScribaMode('hey scribble on the page')).toBe(
      ScribaMode.TRANSCRIBE,
    )
    expect(detectScribaMode('hey script kiddie')).toBe(ScribaMode.TRANSCRIBE)
  })

  it('defaults to TRANSCRIBE for normal dictation and empty input', () => {
    expect(detectScribaMode('just transcribe this sentence please')).toBe(
      ScribaMode.TRANSCRIBE,
    )
    expect(detectScribaMode('')).toBe(ScribaMode.TRANSCRIBE)
    expect(detectScribaMode('   ')).toBe(ScribaMode.TRANSCRIBE)
  })
})

describe('getScribaMode', () => {
  it('parses valid numeric mode values', () => {
    expect(getScribaMode('0')).toBe(ScribaMode.TRANSCRIBE)
    expect(getScribaMode('1')).toBe(ScribaMode.EDIT)
    expect(getScribaMode(1)).toBe(ScribaMode.EDIT)
  })

  it('returns undefined for out-of-range numbers instead of an invalid mode', () => {
    expect(getScribaMode('7')).toBeUndefined()
    expect(getScribaMode(2)).toBeUndefined()
    expect(getScribaMode('-1')).toBeUndefined()
  })

  it('returns undefined for non-numeric / missing input', () => {
    expect(getScribaMode('edit')).toBeUndefined()
    expect(getScribaMode(undefined)).toBeUndefined()
    expect(getScribaMode(NaN)).toBeUndefined()
  })
})

describe('resolveNumberInRange', () => {
  it('keeps in-range LLM temperature values (0–2)', () => {
    expect(resolveNumberInRange(LLMTemperatureSchema, 0.7, 0.1)).toBe(0.7)
    expect(resolveNumberInRange(LLMTemperatureSchema, 0, 0.1)).toBe(0)
    expect(resolveNumberInRange(LLMTemperatureSchema, 2, 0.1)).toBe(2)
  })

  it('falls back to default for out-of-range temperature', () => {
    expect(resolveNumberInRange(LLMTemperatureSchema, 9999, 0.1)).toBe(0.1)
    expect(resolveNumberInRange(LLMTemperatureSchema, -1, 0.1)).toBe(0.1)
  })

  it('keeps in-range no-speech threshold values (0–1) and clamps the rest', () => {
    expect(resolveNumberInRange(NoSpeechThresholdSchema, 0.6, 0.6)).toBe(0.6)
    expect(resolveNumberInRange(NoSpeechThresholdSchema, 1.5, 0.6)).toBe(0.6)
    expect(resolveNumberInRange(NoSpeechThresholdSchema, -0.2, 0.6)).toBe(0.6)
  })

  it('falls back to default for null/undefined', () => {
    expect(resolveNumberInRange(LLMTemperatureSchema, undefined, 0.1)).toBe(0.1)
    expect(resolveNumberInRange(NoSpeechThresholdSchema, null, 0.6)).toBe(0.6)
  })
})
