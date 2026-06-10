import { describe, it, expect } from 'bun:test'
import { detectScribaMode, getScribaMode } from './helpers.js'
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
