/** Turn-digest overview view: one row per user message with a one-line AI summary. */

import { useMemo, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DigestKey } from './locales.ts'
import { buildDigests, firstSentence, type DigestAction, type DigestRound } from './digest.ts'
import css from './DigestView.module.css'

/** Session-bound control injected by the digest view registration. */
export interface DigestViewInjected {
  /** Extend the history window backwards one page. */
  loadOlder: () => void
}

/** Friendly action category → locale key; unknown categories display their raw tool name. */
const ACTION_LABEL_KEYS: Readonly<Record<string, DigestKey>> = {
  shell: 'action.shell',
  read: 'action.read',
  edit: 'action.edit',
  search: 'action.search',
  web: 'action.web',
  subagent: 'action.subagent',
  todo: 'action.todo',
  skill: 'action.skill',
  goal: 'action.goal',
  plan: 'action.plan',
}

const SUMMARY_MAX = 160
const USER_TEXT_CLAMP = 140

function basename(path: string): string {
  const segments = path.split(/[\\/]/)
  return segments[segments.length - 1] ?? path
}

function actionLabel(t: (key: DigestKey) => string, action: DigestAction): string {
  const key = ACTION_LABEL_KEYS[action.kind]
  return key === undefined ? action.label : t(key)
}

/** The one-line summary of a round: first sentence of the reply, with structured fallbacks. */
function roundSummary(t: (key: DigestKey) => string, round: DigestRound): string {
  const sentence = firstSentence(round.assistantText, SUMMARY_MAX)
  if (sentence !== '') return sentence
  if (round.totalCalls > 0) return t('summary.toolOnly')
  return round.pending ? t('summary.running') : t('summary.noReply')
}

/** Short clock time for one row. */
function clockTime(time: number): string {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function clampText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

/** Render one digest round; expanded rows show the full user message and reply. */
function DigestRow({
  round, index, t, expanded, onToggle,
}: {
  readonly round: DigestRound
  readonly index: number
  readonly t: (key: DigestKey) => string
  readonly expanded: boolean
  readonly onToggle: () => void
}) {
  const userText = round.userText.trim()
  const summary = roundSummary(t, round)
  const showMore = userText.length > USER_TEXT_CLAMP || round.assistantText !== ''
  const heading = round.turn === null
    ? `${index + 1} · ${t('pending')}`
    : `#${round.turn} ${t('turn')}`

  return (
    <article className={`${css.row} ${expanded ? css.rowExpanded : ''}`} onClick={onToggle}>
      <header className={css.rowHeader}>
        <span className={css.rowHeading}>{heading}</span>
        <time className={css.rowTime}>{clockTime(round.time)}</time>
      </header>
      <p className={css.userLine}>
        <span className={css.who}>{t('you')}</span>
        <span className={css.userText}>{expanded ? userText || t('summary.noReply') : clampText(userText, USER_TEXT_CLAMP) || t('summary.noReply')}</span>
      </p>
      <p className={css.aiLine}>
        <span className={css.who}>{t('ai')}</span>
        <span className={css.summary}>{summary}</span>
      </p>
      {round.actions.length > 0 ? (
        <ul className={css.actions}>
          {round.actions.map(action => {
            const label = actionLabel(t, action)
            const files = action.files.slice(0, 3).map(basename).join(', ')
            return (
              <li className={css.action} key={action.kind}>
                <span className={css.actionLabel}>{label}</span>
                <span className={css.actionCount}>×{action.count}</span>
                {files !== '' ? <span className={css.actionFiles}>{files}</span> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {expanded && round.assistantText !== '' ? (
        <pre className={css.fullReply}>{round.assistantText}</pre>
      ) : null}
      {showMore ? (
        <span className={css.expandHint}>{expanded ? t('collapse') : t('expand')}</span>
      ) : null}
    </article>
  )
}

/**
 * The digest view entry: a full conversation overview tab folding every user
 * message and its AI reply into one line, so long assistant outputs cannot
 * bury what the user asked or what the AI did.
 */
export function DigestView({
  useSession, loadOlder, t,
}: ConvViewProps & InjectFace<DigestViewInjected> & PropsLocale<'digest'>) {
  const nodes = useSession(snapshot => snapshot.chat.nodes.values())
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const loadingOlder = useSession(snapshot => snapshot.loadingOlder)
  const rounds = useMemo(() => buildDigests(nodes), [nodes])
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())

  const toggle = (seq: number): void => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(seq)) next.delete(seq)
      else next.add(seq)
      return next
    })
  }

  if (rounds.length === 0) {
    return (
      <div className={css.empty}>
        <p className={css.emptyTitle}>{t('empty.title')}</p>
        <p className={css.emptyHint}>{t('empty.hint')}</p>
      </div>
    )
  }

  return (
    <div className={css.view}>
      <header className={css.viewHeader}>
        <span className={css.viewTitle}>{t('view.digest')}</span>
        <span className={css.viewCount}>{rounds.length} {t('header.count')}</span>
      </header>
      <div className={css.list}>
        {rounds.map((round, index) => (
          <DigestRow
            key={round.seq}
            round={round}
            index={index}
            t={t}
            expanded={expanded.has(round.seq)}
            onToggle={() => toggle(round.seq)}
          />
        ))}
      </div>
      {hasMore ? (
        <button
          className={css.loadOlder}
          disabled={loadingOlder}
          onClick={loadOlder}
        >
          {loadingOlder ? t('loadingOlder') : t('loadOlder')}
        </button>
      ) : null}
    </div>
  )
}
