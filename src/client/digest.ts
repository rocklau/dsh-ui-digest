/**
 * Turn-digest computation: folds the assembled Chat conversation nodes into
 * one round per user message ("you said → what the AI did"), purely
 * client-side and replayable from the loaded session window. No LLM, no
 * RPC, no mutable cross-plugin state: the digest is a deterministic function
 * of the conversation snapshot.
 */
import type { ChatConversationViewNode, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

/** One counted tool category in a round (label keys live in the locale dictionaries). */
export interface DigestAction {
  /** Category key: 'shell' | 'read' | 'edit' | 'search' | 'web' | 'subagent'
   * | 'todo' | 'skill' | 'goal' | 'plan', or the raw tool name when unknown. */
  readonly kind: string
  /** Fallback display label: the raw tool name when the category is unknown. */
  readonly label: string
  /** Number of distinct call ids folded into this category. */
  readonly count: number
  /** Unique file paths extracted from edit/write-style arguments (display only). */
  readonly files: readonly string[]
}

/** One digest round: one user message plus the AI activity that followed it. */
export interface DigestRound {
  /** Anchor seq of the user message node (stable ordering key). */
  readonly seq: number
  /** User message time, Unix epoch ms. */
  readonly time: number
  /** Turn number when the AI replied, otherwise null (still pending). */
  readonly turn: number | null
  /** Raw user message text (text blocks joined). */
  readonly userText: string
  /** Raw assistant final text (all settled text blocks joined, trimmed). */
  readonly assistantText: string
  /** Categorized tool actions, sorted by descending count. */
  readonly actions: readonly DigestAction[]
  /** Distinct tool call count in the round. */
  readonly totalCalls: number
  /** True when no assistant evidence (text or settled tool result) exists yet. */
  readonly pending: boolean
}

/** Structural slices of the assembled chat nodes this fold consumes (duck-typed to stay decoupled). */
interface UserLikeData {
  readonly time: number
  readonly content: readonly { readonly type?: string; readonly text?: string }[]
}
interface AssistantStepLikeData {
  readonly turn: number
  readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
}
interface ToolCallLikeData {
  readonly root: ToolCallBlock
}
interface TurnTailLikeData {
  readonly closing: { readonly blocks: readonly { readonly kind: string; readonly text?: string }[] } | null
}

/** Friendly category map for first-party dsh tools; unknown names fall through to themselves. */
const ACTION_CATEGORIES: Readonly<Record<string, string>> = {
  bash: 'shell',
  pwsh: 'shell',
  terminal: 'shell',
  read: 'read',
  read_image: 'read',
  edit: 'edit',
  write: 'edit',
  str_replace_editor: 'edit',
  glob: 'search',
  grep: 'search',
  web_search: 'web',
  web_fetch: 'web',
}

/**
 * Categorize one tool name into a stable display category key.
 * @param name - raw tool name from the call block.
 * @returns the category key, or the input unchanged when unknown.
 */
export function categorizeTool(name: string): string {
  const direct = ACTION_CATEGORIES[name]
  if (direct !== undefined) return direct
  if (name.startsWith('subagent')) return 'subagent'
  if (name.startsWith('todo')) return 'todo'
  if (name.startsWith('skill')) return 'skill'
  if (name.startsWith('goal')) return 'goal'
  if (name.startsWith('plan')) return 'plan'
  return name
}

/** Keys probed for file paths in edit/write-style tool arguments. */
const FILE_ARG_KEYS = ['path', 'filePath', 'oldPath', 'newPath', 'uri', 'root', 'file'] as const

/**
 * Extract unique file paths from a raw JSON tool-arguments string.
 * @param argsRaw - JSON-encoded arguments of one tool call, when captured.
 * @returns trimmed path values in {@link FILE_ARG_KEYS} order, deduplicated.
 */
export function extractFilePaths(argsRaw: string | undefined): string[] {
  if (argsRaw === undefined) return []
  let args: unknown
  try {
    args = JSON.parse(argsRaw)
  } catch {
    return []
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return []
  const record = args as Record<string, unknown>
  const files: string[] = []
  for (const key of FILE_ARG_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') files.push(value.trim())
  }
  return [...new Set(files)]
}

/** Name and raw arguments of one tool block, in either lifecycle form. */
function toolCallFacts(block: ToolCallBlock): { readonly name: string | undefined; readonly args: string | undefined } {
  return 'kind' in block
    ? { name: block.call?.name, args: block.call?.argsRaw }
    : { name: block.name, args: block.argsRaw }
}

/** Whether a tool root has settled (carries its final result). */
function isSettledToolRoot(block: ToolCallBlock): boolean {
  return 'kind' in block
}

/** Walk one tool root and its nested subcalls into the dedupe map (keyed by call id). */
function collectCalls(
  root: ToolCallBlock,
  out: Map<string, { readonly name: string; readonly args: string | undefined }>,
): void {
  const facts = toolCallFacts(root)
  if (facts.name !== undefined) out.set(root.callId, { name: facts.name, args: facts.args })
  for (const child of root.subCalls) collectCalls(child, out)
}

/** Fold the raw call map into sorted, categorized actions. */
function foldActions(calls: Map<string, { readonly name: string; readonly args: string | undefined }>): DigestAction[] {
  const byKind = new Map<string, { count: number; files: string[]; label: string }>()
  for (const { name, args } of calls.values()) {
    const kind = categorizeTool(name)
    let bucket = byKind.get(kind)
    if (bucket === undefined) {
      bucket = { count: 0, files: [], label: name }
      byKind.set(kind, bucket)
    }
    bucket.count += 1
    if (kind === 'edit' || kind === 'read') {
      for (const file of extractFilePaths(args)) {
        if (!bucket.files.includes(file)) bucket.files.push(file)
      }
    }
  }
  return [...byKind.entries()]
    .map(([kind, bucket]) => ({
      kind,
      label: bucket.label,
      count: bucket.count,
      files: bucket.files.slice(0, 8),
    }))
    .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind))
}

interface RoundAccumulator {
  readonly seq: number
  readonly time: number
  readonly userText: string
  textParts: string[]
  calls: Map<string, { readonly name: string; readonly args: string | undefined }>
  turn: number | null
  hasAssistantEvidence: boolean
}

/** True when the node is an append-surface user or steering message. */
function isUserNode(kind: string): kind is 'user' | 'steering' {
  return kind === 'user' || kind === 'steering'
}

/**
 * Fold the assembled Chat nodes (any order) into per-user-message digest
 * rounds ordered by anchor seq. Assistant evidence for a round is: settled
 * text from assistant steps, settled tool results, or the turn-tail closing.
 * @param nodes - the assembled Chat nodes in log order.
 * @returns one round per user message, ordered by anchor seq.
 */
export function buildDigests(nodes: readonly ChatConversationViewNode[]): DigestRound[] {
  const ordered = [...nodes].sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key))
  const rounds: DigestRound[] = []
  let current: RoundAccumulator | null = null

  const finalize = (): void => {
    if (current === null) return
    const actions = foldActions(current.calls)
    rounds.push({
      seq: current.seq,
      time: current.time,
      turn: current.turn,
      userText: current.userText,
      assistantText: current.textParts.join('\n').trim(),
      actions,
      totalCalls: current.calls.size,
      pending: !current.hasAssistantEvidence,
    })
    current = null
  }

  for (const node of ordered) {
    if (node.visibility !== 'visible') continue
    if (isUserNode(node.kind)) {
      finalize()
      const data = node.data as UserLikeData
      current = {
        seq: node.anchorSeq,
        time: data.time,
        userText: data.content
          .filter((block): block is { readonly type: 'text'; readonly text: string } => block.type === 'text' && block.text !== undefined)
          .map(block => block.text)
          .join('\n')
          .trim(),
        textParts: [],
        calls: new Map(),
        turn: null,
        hasAssistantEvidence: false,
      }
      continue
    }
    if (current === null) continue
    if (node.kind === 'assistant-step') {
      const data = node.data as AssistantStepLikeData
      current.turn = data.turn
      for (const block of data.blocks) {
        if (block.kind === 'text' && block.text !== undefined && block.text.trim() !== '') {
          current.textParts.push(block.text.trim())
          current.hasAssistantEvidence = true
        }
      }
      continue
    }
    if (node.kind === 'tool-call') {
      const data = node.data as ToolCallLikeData
      collectCalls(data.root, current.calls)
      if (isSettledToolRoot(data.root)) current.hasAssistantEvidence = true
      continue
    }
    if (node.kind === 'turn-tail') {
      const data = node.data as TurnTailLikeData
      const closing = data.closing
      if (closing !== null && current.textParts.length === 0) {
        for (const block of closing.blocks) {
          if (block.kind === 'text' && block.text !== undefined && block.text.trim() !== '') {
            current.textParts.push(block.text.trim())
            current.hasAssistantEvidence = true
          }
        }
      }
    }
  }
  finalize()
  return rounds
}

/** Sentence punctuation honored by {@link firstSentence} (CJK and Latin). */
const SENTENCE_PUNCT = /[。！？!?….]/
/** Newline acts as a fallback sentence ender when no punctuation precedes it. */
const NEWLINE = /\n/

/**
 * Extract the first sentence of a text for one-line display: cut before the
 * first sentence punctuation, falling back to the first line when the text
 * carries none; hard-truncate at `max` with an ellipsis when the sentence
 * runs longer. Internal whitespace collapses to single spaces.
 * @param text - source reply text.
 * @param max - display cap in characters; longer sentences end with an ellipsis.
 * @returns the collapsed one-line summary, never exceeding `max` characters.
 */
export function firstSentence(text: string, max = 140): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const punct = trimmed.search(SENTENCE_PUNCT)
  const newline = trimmed.search(NEWLINE)
  let end = -1
  if (punct > 0) end = punct
  else if (newline > 0) end = newline
  let candidate = end > 0 ? trimmed.slice(0, end) : trimmed
  candidate = candidate.replace(/\s+/g, ' ').trim()
  if (candidate === '') candidate = trimmed.replace(/\s+/g, ' ').trim()
  if (candidate.length <= max) return candidate
  return `${candidate.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}
