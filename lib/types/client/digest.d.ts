/**
 * Turn-digest computation: folds the assembled Chat conversation nodes into
 * one round per user message ("you said → what the AI did"), purely
 * client-side and replayable from the loaded session window. No LLM, no
 * RPC, no mutable cross-plugin state: the digest is a deterministic function
 * of the conversation snapshot.
 */
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client';
/** One counted tool category in a round (label keys live in the locale dictionaries). */
export interface DigestAction {
    /** Category key: 'shell' | 'read' | 'edit' | 'search' | 'web' | 'subagent' | 'todo' | 'skill' | 'goal' | 'plan', or the raw tool name when unknown. */
    readonly kind: string;
    /** Fallback display label: the raw tool name when the category is unknown. */
    readonly label: string;
    /** Number of distinct call ids folded into this category. */
    readonly count: number;
    /** Unique file paths extracted from edit/write-style arguments (display only). */
    readonly files: readonly string[];
}
/** One digest round: one user message plus the AI activity that followed it. */
export interface DigestRound {
    /** Anchor seq of the user message node (stable ordering key). */
    readonly seq: number;
    /** User message time, Unix epoch ms. */
    readonly time: number;
    /** Turn number when the AI replied, otherwise null (still pending). */
    readonly turn: number | null;
    /** Raw user message text (text blocks joined). */
    readonly userText: string;
    /** Raw assistant final text (all settled text blocks joined, trimmed). */
    readonly assistantText: string;
    /** Categorized tool actions, sorted by descending count. */
    readonly actions: readonly DigestAction[];
    /** Distinct tool call count in the round. */
    readonly totalCalls: number;
    /** True when no assistant evidence (text or settled tool result) exists yet. */
    readonly pending: boolean;
}
/** Categorize one tool name into a stable display category key. */
export declare function categorizeTool(name: string): string;
/** Extract unique file paths from a raw JSON tool-arguments string. */
export declare function extractFilePaths(argsRaw: string | undefined): string[];
/**
 * Fold the assembled Chat nodes (any order) into per-user-message digest
 * rounds ordered by anchor seq. Assistant evidence for a round is: settled
 * text from assistant steps, settled tool results, or the turn-tail closing.
 */
export declare function buildDigests(nodes: readonly ChatConversationViewNode[]): DigestRound[];
/**
 * Extract the first sentence of a text for one-line display: cut before the
 * first sentence punctuation, falling back to the first line when the text
 * carries none; hard-truncate at `max` with an ellipsis when the sentence
 * runs longer. Internal whitespace collapses to single spaces.
 */
export declare function firstSentence(text: string, max?: number): string;
//# sourceMappingURL=digest.d.ts.map