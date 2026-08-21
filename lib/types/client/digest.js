/** Friendly category map for first-party dsh tools; unknown names fall through to themselves. */
const ACTION_CATEGORIES = {
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
};
/** Categorize one tool name into a stable display category key. */
export function categorizeTool(name) {
    const direct = ACTION_CATEGORIES[name];
    if (direct !== undefined)
        return direct;
    if (name.startsWith('subagent'))
        return 'subagent';
    if (name.startsWith('todo'))
        return 'todo';
    if (name.startsWith('skill'))
        return 'skill';
    if (name.startsWith('goal'))
        return 'goal';
    if (name.startsWith('plan'))
        return 'plan';
    return name;
}
/** Keys probed for file paths in edit/write-style tool arguments. */
const FILE_ARG_KEYS = ['path', 'filePath', 'oldPath', 'newPath', 'uri', 'root', 'file'];
/** Extract unique file paths from a raw JSON tool-arguments string. */
export function extractFilePaths(argsRaw) {
    if (argsRaw === undefined)
        return [];
    let args;
    try {
        args = JSON.parse(argsRaw);
    }
    catch {
        return [];
    }
    if (typeof args !== 'object' || args === null || Array.isArray(args))
        return [];
    const record = args;
    const files = [];
    for (const key of FILE_ARG_KEYS) {
        const value = record[key];
        if (typeof value === 'string' && value.trim() !== '')
            files.push(value.trim());
    }
    return [...new Set(files)];
}
/** Name and raw arguments of one tool block, in either lifecycle form. */
function toolCallFacts(block) {
    return 'kind' in block
        ? { name: block.call?.name, args: block.call?.argsRaw }
        : { name: block.name, args: block.argsRaw };
}
/** Whether a tool root has settled (carries its final result). */
function isSettledToolRoot(block) {
    return 'kind' in block;
}
/** Walk one tool root and its nested subcalls into the dedupe map (keyed by call id). */
function collectCalls(root, out) {
    const facts = toolCallFacts(root);
    if (facts.name !== undefined)
        out.set(root.callId, { name: facts.name, args: facts.args });
    for (const child of root.subCalls)
        collectCalls(child, out);
}
/** Fold the raw call map into sorted, categorized actions. */
function foldActions(calls) {
    const byKind = new Map();
    for (const { name, args } of calls.values()) {
        const kind = categorizeTool(name);
        let bucket = byKind.get(kind);
        if (bucket === undefined) {
            bucket = { count: 0, files: [], label: name };
            byKind.set(kind, bucket);
        }
        bucket.count += 1;
        if (kind === 'edit' || kind === 'read') {
            for (const file of extractFilePaths(args)) {
                if (!bucket.files.includes(file))
                    bucket.files.push(file);
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
        .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind));
}
/** True when the node is an append-surface user or steering message. */
function isUserNode(kind) {
    return kind === 'user' || kind === 'steering';
}
/**
 * Fold the assembled Chat nodes (any order) into per-user-message digest
 * rounds ordered by anchor seq. Assistant evidence for a round is: settled
 * text from assistant steps, settled tool results, or the turn-tail closing.
 */
export function buildDigests(nodes) {
    const ordered = [...nodes].sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
    const rounds = [];
    let current = null;
    const finalize = () => {
        if (current === null)
            return;
        const actions = foldActions(current.calls);
        rounds.push({
            seq: current.seq,
            time: current.time,
            turn: current.turn,
            userText: current.userText,
            assistantText: current.textParts.join('\n').trim(),
            actions,
            totalCalls: current.calls.size,
            pending: !current.hasAssistantEvidence,
        });
        current = null;
    };
    for (const node of ordered) {
        if (node.visibility !== 'visible')
            continue;
        if (isUserNode(node.kind)) {
            finalize();
            const data = node.data;
            current = {
                seq: node.anchorSeq,
                time: data.time,
                userText: data.content
                    .filter((block) => block.type === 'text' && block.text !== undefined)
                    .map(block => block.text)
                    .join('\n')
                    .trim(),
                textParts: [],
                calls: new Map(),
                turn: null,
                hasAssistantEvidence: false,
            };
            continue;
        }
        if (current === null)
            continue;
        if (node.kind === 'assistant-step') {
            const data = node.data;
            current.turn = data.turn;
            for (const block of data.blocks) {
                if (block.kind === 'text' && block.text !== undefined && block.text.trim() !== '') {
                    current.textParts.push(block.text.trim());
                    current.hasAssistantEvidence = true;
                }
            }
            continue;
        }
        if (node.kind === 'tool-call') {
            const data = node.data;
            collectCalls(data.root, current.calls);
            if (isSettledToolRoot(data.root))
                current.hasAssistantEvidence = true;
            continue;
        }
        if (node.kind === 'turn-tail') {
            const data = node.data;
            const closing = data.closing;
            if (closing !== null && current.textParts.length === 0) {
                for (const block of closing.blocks) {
                    if (block.kind === 'text' && block.text !== undefined && block.text.trim() !== '') {
                        current.textParts.push(block.text.trim());
                        current.hasAssistantEvidence = true;
                    }
                }
            }
        }
    }
    finalize();
    return rounds;
}
/** Sentence punctuation honored by {@link firstSentence} (CJK and Latin). */
const SENTENCE_PUNCT = /[。！？!?….]/;
/** Newline acts as a fallback sentence ender when no punctuation precedes it. */
const NEWLINE = /\n/;
/**
 * Extract the first sentence of a text for one-line display: cut before the
 * first sentence punctuation, falling back to the first line when the text
 * carries none; hard-truncate at `max` with an ellipsis when the sentence
 * runs longer. Internal whitespace collapses to single spaces.
 */
export function firstSentence(text, max = 140) {
    const trimmed = text.trim();
    if (trimmed === '')
        return '';
    const punct = trimmed.search(SENTENCE_PUNCT);
    const newline = trimmed.search(NEWLINE);
    let end = -1;
    if (punct > 0)
        end = punct;
    else if (newline > 0)
        end = newline;
    let candidate = end > 0 ? trimmed.slice(0, end) : trimmed;
    candidate = candidate.replace(/\s+/g, ' ').trim();
    if (candidate === '')
        candidate = trimmed.replace(/\s+/g, ' ').trim();
    if (candidate.length <= max)
        return candidate;
    return `${candidate.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
//# sourceMappingURL=digest.js.map