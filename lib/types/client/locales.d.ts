/** `digest` namespace dictionaries (view tab label, empty state, action chips). */
/** Dictionary namespace owned by this plugin. */
export declare const NS = "digest";
/** The digest dictionary key set (the source of truth for both locales). */
export type DigestKey = 'view.digest' | 'header.count' | 'empty.title' | 'empty.hint' | 'loadOlder' | 'loadingOlder' | 'you' | 'ai' | 'pending' | 'summary.toolOnly' | 'summary.noReply' | 'summary.running' | 'expand' | 'collapse' | 'turn' | 'actions' | 'action.shell' | 'action.read' | 'action.edit' | 'action.search' | 'action.web' | 'action.subagent' | 'action.todo' | 'action.skill' | 'action.goal' | 'action.plan';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The turn-digest overview tab label and copy. */
        'digest': DigestKey;
    }
}
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: Record<DigestKey, string>;
/** English dictionary. */
export declare const en: Record<DigestKey, string>;
//# sourceMappingURL=locales.d.ts.map