import { describe, expect, it } from 'vitest'
import type { ChatConversationViewNode, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { buildDigests, categorizeTool, extractFilePaths, firstSentence } from '../src/client/digest.ts'

function node(kind: string, anchorSeq: number, data: unknown): ChatConversationViewNode {
  return { key: `${kind}:${anchorSeq}`, kind, id: `${anchorSeq}`, target: 'chat', anchorSeq, location: { kind: 'unresolved' }, visibility: 'visible', data }
}

function userNode(seq: number, text: string, time = seq * 1000): ChatConversationViewNode {
  return node('user', seq, { time, content: [{ type: 'text', text }] })
}

function assistantNode(seq: number, turn: number, text: string): ChatConversationViewNode {
  return node('assistant-step', seq, { turn, step: 1, status: 'settled', time: seq * 1000, blocks: [{ kind: 'text', text }] })
}

function runningTool(callId: string, name: string, argsRaw = '{}'): ToolCallBlock {
  return { callId, name, argsRaw, turn: 1, step: 1, time: 1, callView: null, subCalls: [] }
}

function settledTool(callId: string, name: string, argsRaw = '{}'): ToolCallBlock {
  return {
    kind: 'tool-result', seq: 2, time: 2000, callId,
    call: { name, argsRaw }, callTime: 1, content: [], isError: false,
    callView: null, resultView: null, subCalls: [],
  }
}

function toolNode(seq: number, root: ToolCallBlock): ChatConversationViewNode {
  return node('tool-call', seq, { root })
}

describe('firstSentence', () => {
  it('cuts before the first CJK sentence ender', () => {
    expect(firstSentence('修复了崩溃问题。还加了日志。')).toBe('修复了崩溃问题')
  })

  it('cuts before the first Latin sentence ender', () => {
    expect(firstSentence('Fixed the crash. Also added logging.')).toBe('Fixed the crash')
  })

  it('cuts at a newline for prose that never ends', () => {
    expect(firstSentence('第一行摘要\n第二行细节')).toBe('第一行摘要')
  })

  it('hard-truncates long sentences with an ellipsis', () => {
    const long = '字'.repeat(200)
    const result = firstSentence(long, 140)
    expect(result).toHaveLength(140)
    expect(result.endsWith('…')).toBe(true)
  })

  it('returns empty for empty or whitespace-only input', () => {
    expect(firstSentence('')).toBe('')
    expect(firstSentence('   \n  ')).toBe('')
  })

  it('collapses internal whitespace', () => {
    expect(firstSentence('a   b\nc d。')).toBe('a b c d')
  })
})

describe('categorizeTool', () => {
  it('maps first-party tools to friendly categories', () => {
    expect(categorizeTool('bash')).toBe('shell')
    expect(categorizeTool('read')).toBe('read')
    expect(categorizeTool('write')).toBe('edit')
    expect(categorizeTool('web_search')).toBe('web')
  })

  it('maps prefix families', () => {
    expect(categorizeTool('subagent_fork')).toBe('subagent')
    expect(categorizeTool('todo_create')).toBe('todo')
  })

  it('falls through to the raw name', () => {
    expect(categorizeTool('mystery_tool')).toBe('mystery_tool')
  })
})

describe('extractFilePaths', () => {
  it('extracts path-like keys and dedupes', () => {
    expect(extractFilePaths('{"path":"a.ts","newPath":"a.ts","filePath":"b.ts"}')).toEqual(['a.ts', 'b.ts'])
  })

  it('returns [] on invalid JSON or non-objects', () => {
    expect(extractFilePaths('not json')).toEqual([])
    expect(extractFilePaths('["a"]')).toEqual([])
    expect(extractFilePaths(undefined)).toEqual([])
  })
})

describe('buildDigests', () => {
  it('folds one user message and its reply into a round with a text summary', () => {
    const rounds = buildDigests([
      userNode(1, '帮我修一下登录 bug'),
      assistantNode(2, 1, '我检查了登录逻辑，问题出在 token 过期未刷新。'),
      toolNode(3, runningTool('c1', 'read', '{"path":"src/login.ts"}')),
      toolNode(4, runningTool('c2', 'edit', '{"path":"src/login.ts"}')),
    ])
    expect(rounds).toHaveLength(1)
    expect(rounds[0]?.userText).toBe('帮我修一下登录 bug')
    expect(rounds[0]?.turn).toBe(1)
    expect(rounds[0]?.pending).toBe(false)
    expect(rounds[0]?.totalCalls).toBe(2)
    expect(rounds[0]?.actions).toEqual([
      { kind: 'read', label: 'read', count: 1, files: ['src/login.ts'] },
      { kind: 'edit', label: 'edit', count: 1, files: ['src/login.ts'] },
    ].sort((a, b) => a.kind.localeCompare(b.kind)))
  })

  it('leaves a round pending when no assistant evidence exists', () => {
    const rounds = buildDigests([userNode(10, 'hello')])
    expect(rounds).toHaveLength(1)
    expect(rounds[0]?.pending).toBe(true)
    expect(rounds[0]?.turn).toBeNull()
    expect(rounds[0]?.assistantText).toBe('')
    expect(rounds[0]?.actions).toEqual([])
  })

  it('orders rounds by seq and keeps multiple user messages separate', () => {
    const rounds = buildDigests([
      assistantNode(5, 1, '第一个回答。'),
      userNode(6, '第二个问题'),
      userNode(1, '第一个问题'),
      assistantNode(7, 2, '第二个回答。'),
    ])
    expect(rounds.map(round => round.userText)).toEqual(['第一个问题', '第二个问题'])
    expect(rounds[0]?.assistantText).toBe('第一个回答。')
    expect(rounds[1]?.assistantText).toBe('第二个回答。')
  })

  it('joins multi-step assistant text in seq order', () => {
    const rounds = buildDigests([
      userNode(1, 'q'),
      assistantNode(2, 1, '第一步思考输出。'),
      assistantNode(3, 1, '最终答案。'),
    ])
    expect(rounds[0]?.assistantText).toBe('第一步思考输出。\n最终答案。')
  })

  it('uses the turn-tail closing text when no assistant step is in the window', () => {
    const rounds = buildDigests([
      userNode(1, 'q'),
      node('turn-tail', 2, { turn: 1, seq: 2, time: 2000, closing: { blocks: [{ kind: 'text', text: '尾部总结。' }] } }),
    ])
    expect(rounds[0]?.assistantText).toBe('尾部总结。')
    expect(rounds[0]?.pending).toBe(false)
  })

  it('counts nested subcalls and dedupes by call id', () => {
    const parent: ToolCallBlock = {
      callId: 'parent', name: 'bash', argsRaw: '{}', turn: 1, step: 1, time: 1, callView: null,
      subCalls: [
        runningTool('child1', 'edit', '{"path":"x.ts"}'),
        runningTool('child1', 'edit', '{"path":"x.ts"}'),
      ],
    }
    const rounds = buildDigests([userNode(1, 'q'), toolNode(2, parent)])
    expect(rounds[0]?.totalCalls).toBe(2)
    expect(rounds[0]?.actions.find(action => action.kind === 'edit')?.count).toBe(1)
  })

  it('marks a round as replied when only a settled tool result exists', () => {
    const rounds = buildDigests([userNode(1, 'q'), toolNode(2, settledTool('c1', 'bash'))])
    expect(rounds[0]?.pending).toBe(false)
    expect(rounds[0]?.totalCalls).toBe(1)
    expect(rounds[0]?.actions[0]?.kind).toBe('shell')
  })

  it('skips hidden nodes', () => {
    const hidden = { ...userNode(1, 'hidden'), visibility: 'hidden' as const }
    const rounds = buildDigests([hidden, assistantNode(2, 1, 'answer')])
    expect(rounds).toHaveLength(0)
  })
})
