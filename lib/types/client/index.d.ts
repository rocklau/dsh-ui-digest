/** Turn-digest overview plugin, browser half: one `conversation.view` tab. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type DigestKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The turn-digest overview tab copy. */
        digest: DigestKey;
    }
}
export { DigestView } from './DigestView.tsx';
export type { DigestViewInjected } from './DigestView.tsx';
export type { DigestAction, DigestRound } from './digest.ts';
export { buildDigests, categorizeTool, extractFilePaths, firstSentence } from './digest.ts';
/** Required services: the view slot, the session binding for history paging, and copy. */
export declare const inject: string[];
/**
 * Client plugin body: register the digest tab in the conversation view ring.
 * The fold reads the assembled Chat snapshot through the standard kit, so the
 * plugin owns no store, no RPC, and no event listener of its own.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map