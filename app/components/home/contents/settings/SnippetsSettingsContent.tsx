import { useState } from 'react'
import { X, Plus } from '@mynaui/icons-react'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import type { Snippet } from '@/lib/utils/snippets'
import { Button } from '@/app/components/ui/button'

export default function SnippetsSettingsContent() {
  const { snippets, setSnippets } = useSettingsStore()
  // Local draft so typing is responsive; persisted on blur instead of on every
  // keystroke (each persist is a disk write + IPC broadcast).
  const [draft, setDraft] = useState<Snippet[]>(snippets)

  const updateAt = (index: number, patch: Partial<Snippet>) =>
    setDraft(current =>
      current.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    )

  const removeAt = (index: number) => {
    const next = draft.filter((_, i) => i !== index)
    setDraft(next)
    setSnippets(next)
  }

  const addSnippet = () => setDraft(current => [...current, { trigger: '', expansion: '' }])

  // Empty-trigger rows are harmless (the engine ignores them), so we persist the
  // draft as-is on blur.
  const persist = () => setSnippets(draft)

  return (
    <div className="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-500 scrollbar-track-transparent">
      <div className="ml-1 mr-1">
        <h3 className="text-md font-medium text-slate-900">Snippets</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Say a trigger phrase while dictating and Scriba inserts the expansion —
          e.g. say &ldquo;my address&rdquo; to insert your full address. Triggers
          match whole words, case-insensitively.
        </p>

        <div className="space-y-3">
          {draft.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No snippets yet.</p>
          ) : (
            draft.map((snippet, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-md border border-slate-200 p-3"
              >
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={snippet.trigger}
                    onChange={e => updateAt(index, { trigger: e.target.value })}
                    onBlur={persist}
                    placeholder="Trigger (e.g. my address)"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <textarea
                    value={snippet.expansion}
                    onChange={e =>
                      updateAt(index, { expansion: e.target.value })
                    }
                    onBlur={persist}
                    placeholder="Expansion"
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label="Remove snippet"
                  className="mt-1 rounded-md p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <X width={16} height={16} />
                </button>
              </div>
            ))
          )}
        </div>

        <Button
          variant="outline"
          onClick={addSnippet}
          className="mt-4 gap-2"
          type="button"
        >
          <Plus width={16} height={16} />
          Add snippet
        </Button>
      </div>
    </div>
  )
}
