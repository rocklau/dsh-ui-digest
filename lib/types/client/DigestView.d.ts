/** Turn-digest overview view: one row per user message with a one-line AI summary. */
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
/** Session-bound control injected by the digest view registration. */
export interface DigestViewInjected {
    /** Extend the history window backwards one page. */
    loadOlder: () => void;
}
/**
 * The digest view entry: a full conversation overview tab folding every user
 * message and its AI reply into one line, so long assistant outputs cannot
 * bury what the user asked or what the AI did.
 */
export declare function DigestView({ useSession, loadOlder, t, }: ConvViewProps & InjectFace<DigestViewInjected> & PropsLocale<'digest'>): import("react").JSX.Element;
//# sourceMappingURL=DigestView.d.ts.map