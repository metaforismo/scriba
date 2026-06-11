import { describe, test, expect } from 'bun:test'
import { expandSnippets, type Snippet } from './snippets'

describe('expandSnippets', () => {
  test('expands a simple trigger', () => {
    const snippets: Snippet[] = [
      { trigger: 'my email', expansion: 'john@example.com' },
    ]
    expect(expandSnippets('please send it to my email today', snippets)).toBe(
      'please send it to john@example.com today',
    )
  })

  test('is case-insensitive but matches whole words only', () => {
    const snippets: Snippet[] = [{ trigger: 'addr', expansion: '1 Main St' }]
    expect(expandSnippets('my ADDR is here', snippets)).toBe('my 1 Main St is here')
    // Should not match inside another word.
    expect(expandSnippets('the address bar', snippets)).toBe('the address bar')
  })

  test('applies longer triggers before shorter overlapping ones', () => {
    const snippets: Snippet[] = [
      { trigger: 'sig', expansion: 'X' },
      { trigger: 'sig block', expansion: 'Best, Jane' },
    ]
    expect(expandSnippets('add my sig block here', snippets)).toBe(
      'add my Best, Jane here',
    )
  })

  test('expands multiple different triggers', () => {
    const snippets: Snippet[] = [
      { trigger: 'gm', expansion: 'good morning' },
      { trigger: 'ty', expansion: 'thank you' },
    ]
    expect(expandSnippets('gm and ty', snippets)).toBe('good morning and thank you')
  })

  test('skips empty/invalid snippets and treats triggers literally', () => {
    const snippets: Snippet[] = [
      { trigger: '   ', expansion: 'nope' },
      { trigger: 'c++', expansion: 'C plus plus' },
    ]
    expect(expandSnippets('I code in c++ daily', snippets)).toBe(
      'I code in C plus plus daily',
    )
  })

  test('returns the text unchanged when there are no snippets or no match', () => {
    expect(expandSnippets('hello world', [])).toBe('hello world')
    expect(
      expandSnippets('hello world', [{ trigger: 'xyz', expansion: 'Z' }]),
    ).toBe('hello world')
    expect(expandSnippets('', [{ trigger: 'a', expansion: 'b' }])).toBe('')
  })
})
