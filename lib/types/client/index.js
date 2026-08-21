import { DigestView } from "./DigestView.js";
import { en, NS, zh } from "./locales.js";
export { DigestView } from "./DigestView.js";
export { buildDigests, categorizeTool, extractFilePaths, firstSentence } from "./digest.js";
/** Required services: the view slot, the session binding for history paging, and copy. */
export const inject = ['slots', 'sessions', 'locale'];
/**
 * Client plugin body: register the digest tab in the conversation view ring.
 * The fold reads the assembled Chat snapshot through the standard kit, so the
 * plugin owns no store, no RPC, and no event listener of its own.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-digest: dictionaries');
    const t = ctx.locale.bind(NS);
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'digest',
        order: 20,
        locale: NS,
        label: () => t('view.digest'),
        inject: (sessionId) => ({
            loadOlder: () => {
                ctx.sessions.binding(sessionId)?.session.loadOlder().catch(() => { });
            },
        }),
    }, DigestView));
}
//# sourceMappingURL=index.js.map