/**
 * A voice text-expansion snippet: speaking the `trigger` expands it to
 * `expansion` (à la Wispr Flow). E.g. trigger "my address" -> the full address.
 */
export interface Snippet {
  trigger: string
  expansion: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Expands snippet triggers found in `text`. Each trigger is matched
 * case-insensitively on word boundaries and replaced with its expansion.
 *
 * - Empty/invalid snippets are skipped.
 * - Longer triggers are applied first so a multi-word trigger isn't pre-empted by
 *   a shorter one it contains.
 * - The original casing of the surrounding text is preserved; only the matched
 *   trigger is replaced.
 */
export function expandSnippets(text: string, snippets: Snippet[]): string {
  if (!text || !Array.isArray(snippets) || snippets.length === 0) {
    return text
  }

  const valid = snippets
    .filter(s => s && typeof s.trigger === 'string' && s.trigger.trim() !== '')
    .sort((a, b) => b.trigger.trim().length - a.trigger.trim().length)

  let result = text
  for (const { trigger, expansion } of valid) {
    // Boundaries via lookarounds rather than \b, so triggers that start or end
    // with a non-word character (e.g. "c++", "@home") still match cleanly while
    // alphanumeric triggers won't match inside a larger word.
    const pattern = new RegExp(
      `(?<!\\w)${escapeRegExp(trigger.trim())}(?!\\w)`,
      'gi',
    )
    result = result.replace(pattern, expansion ?? '')
  }
  return result
}
