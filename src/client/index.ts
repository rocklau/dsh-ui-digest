/** Turn-digest overview plugin, browser half: one `conversation.view` tab. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Context merge (ctx.locale) through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the conversation.view entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DigestView, type DigestViewInjected } from './DigestView.tsx'
import { en, NS, zh, type DigestKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The turn-digest overview tab copy. */
    digest: DigestKey
  }
}

export { DigestView } from './DigestView.tsx'
export type { DigestViewInjected } from './DigestView.tsx'
export type { DigestAction, DigestRound } from './digest.ts'
export { buildDigests, categorizeTool, extractFilePaths, firstSentence } from './digest.ts'

/** Required services: the view slot, the session binding for history paging, and copy. */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Client plugin body: register the digest tab in the conversation view ring.
 * The fold reads the assembled Chat snapshot through the standard kit, so the
 * plugin owns no store, no RPC, and no event listener of its own.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-digest: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'digest',
    order: 20,
    locale: NS,
    label: () => t('view.digest'),
    inject: (sessionId: SessionId): DigestViewInjected => ({
      loadOlder: () => {
        ctx.sessions.binding(sessionId)?.session.loadOlder().catch(() => {})
      },
    }),
  }, DigestView))
}
