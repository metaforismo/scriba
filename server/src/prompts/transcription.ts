/**
 * Estimates token count.
 *
 * ASCII text is roughly 4 characters per token, but non-ASCII text (CJK,
 * accented Latin, emoji) is far more token-dense — often close to 1 token per
 * character. We count non-ASCII characters near 1 token each so the estimate
 * errs conservative, avoiding a silent overflow of Whisper's 224-token prompt
 * cap (which degrades transcription) at the cost of keeping slightly less vocab.
 */
function estimateTokenCount(text: string): number {
  let ascii = 0
  let nonAscii = 0
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) < 128) {
      ascii++
    } else {
      nonAscii++
    }
  }
  return Math.ceil(ascii / 4 + nonAscii)
}

/**
 * Creates a transcription prompt that stays within the 224 token limit.
 */
export function createTranscriptionPrompt(vocabulary: string[]): string {
  const suffix = ''
  const maxTokens = 224

  const terms = vocabulary
    .map(term => term.trim())
    .filter(term => term.length > 0)

  // If no vocabulary, just return the base instruction
  if (terms.length === 0) {
    const finalTokenCount = estimateTokenCount(suffix)
    console.log(`Transcription prompt: ${finalTokenCount} estimated tokens`)
    return suffix
  }

  const basePrompt = 'Dictionary entries include: '
  const baseTokens = estimateTokenCount(basePrompt + '. ' + suffix)

  // Add whole terms while we stay within budget. Unlike a raw character cut, this
  // never leaves a partial term and stops at the first term that would overflow,
  // so it keeps as many complete terms as fit. Per-term ceilings over-estimate
  // slightly, which keeps the final prompt safely at or under the limit.
  const kept: string[] = []
  let usedTokens = baseTokens
  for (const term of terms) {
    const addition = kept.length === 0 ? term : `, ${term}`
    const cost = estimateTokenCount(addition)
    if (usedTokens + cost > maxTokens) {
      break
    }
    usedTokens += cost
    kept.push(term)
  }

  const wasTruncated = kept.length < terms.length
  const vocabString = kept.join(', ')

  if (wasTruncated) {
    const originalLength = terms.join(', ').length
    console.log(
      `Vocabulary truncated from ${originalLength} to ${vocabString.length} characters to stay within token limit`,
    )
  }

  // If nothing fit (e.g. a single term longer than the budget), return the suffix
  if (vocabString.trim() === '') {
    const finalTokenCount = estimateTokenCount(suffix)
    console.log(`Transcription prompt: ${finalTokenCount} estimated tokens`)
    return suffix
  }

  const finalPrompt = `${basePrompt}${vocabString}. ${suffix}`
  const finalTokenCount = estimateTokenCount(finalPrompt)

  console.log(
    `Transcription prompt: ${finalTokenCount} estimated tokens${wasTruncated ? ' (vocabulary truncated)' : ''}`,
  )

  return finalPrompt
}
