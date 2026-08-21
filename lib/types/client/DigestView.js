import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Turn-digest overview view: one row per user message with a one-line AI summary. */
import { useMemo, useState } from 'react';
import { buildDigests, firstSentence } from "./digest.js";
import css from './DigestView.module.css';
/** Friendly action category → locale key; unknown categories display their raw tool name. */
const ACTION_LABEL_KEYS = {
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
};
const SUMMARY_MAX = 160;
const USER_TEXT_CLAMP = 140;
function basename(path) {
    const segments = path.split(/[\\/]/);
    return segments[segments.length - 1] ?? path;
}
function actionLabel(t, action) {
    const key = ACTION_LABEL_KEYS[action.kind];
    return key === undefined ? action.label : t(key);
}
/** The one-line summary of a round: first sentence of the reply, with structured fallbacks. */
function roundSummary(t, round) {
    const sentence = firstSentence(round.assistantText, SUMMARY_MAX);
    if (sentence !== '')
        return sentence;
    if (round.totalCalls > 0)
        return t('summary.toolOnly');
    return round.pending ? t('summary.running') : t('summary.noReply');
}
/** Short clock time for one row. */
function clockTime(time) {
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function clampText(text, max) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max).trimEnd()}…`;
}
/** Render one digest round; expanded rows show the full user message and reply. */
function DigestRow({ round, index, t, expanded, onToggle, }) {
    const userText = round.userText.trim();
    const summary = roundSummary(t, round);
    const showMore = userText.length > USER_TEXT_CLAMP || round.assistantText !== '';
    const heading = round.turn === null
        ? `${index + 1} · ${t('pending')}`
        : `#${round.turn} ${t('turn')}`;
    return (_jsxs("article", { className: `${css.row} ${expanded ? css.rowExpanded : ''}`, onClick: onToggle, children: [_jsxs("header", { className: css.rowHeader, children: [_jsx("span", { className: css.rowHeading, children: heading }), _jsx("time", { className: css.rowTime, children: clockTime(round.time) })] }), _jsxs("p", { className: css.userLine, children: [_jsx("span", { className: css.who, children: t('you') }), _jsx("span", { className: css.userText, children: expanded ? userText || t('summary.noReply') : clampText(userText, USER_TEXT_CLAMP) || t('summary.noReply') })] }), _jsxs("p", { className: css.aiLine, children: [_jsx("span", { className: css.who, children: t('ai') }), _jsx("span", { className: css.summary, children: summary })] }), round.actions.length > 0 ? (_jsx("ul", { className: css.actions, children: round.actions.map(action => {
                    const label = actionLabel(t, action);
                    const files = action.files.slice(0, 3).map(basename).join(', ');
                    return (_jsxs("li", { className: css.action, children: [_jsx("span", { className: css.actionLabel, children: label }), _jsxs("span", { className: css.actionCount, children: ["\u00D7", action.count] }), files !== '' ? _jsx("span", { className: css.actionFiles, children: files }) : null] }, action.kind));
                }) })) : null, expanded && round.assistantText !== '' ? (_jsx("pre", { className: css.fullReply, children: round.assistantText })) : null, showMore ? (_jsx("span", { className: css.expandHint, children: expanded ? t('collapse') : t('expand') })) : null] }));
}
/**
 * The digest view entry: a full conversation overview tab folding every user
 * message and its AI reply into one line, so long assistant outputs cannot
 * bury what the user asked or what the AI did.
 */
export function DigestView({ useSession, loadOlder, t, }) {
    const nodes = useSession(snapshot => snapshot.chat.nodes.values());
    const hasMore = useSession(snapshot => snapshot.hasMore);
    const loadingOlder = useSession(snapshot => snapshot.loadingOlder);
    const rounds = useMemo(() => buildDigests(nodes), [nodes]);
    const [expanded, setExpanded] = useState(new Set());
    const toggle = (seq) => {
        setExpanded(previous => {
            const next = new Set(previous);
            if (next.has(seq))
                next.delete(seq);
            else
                next.add(seq);
            return next;
        });
    };
    if (rounds.length === 0) {
        return (_jsxs("div", { className: css.empty, children: [_jsx("p", { className: css.emptyTitle, children: t('empty.title') }), _jsx("p", { className: css.emptyHint, children: t('empty.hint') })] }));
    }
    return (_jsxs("div", { className: css.view, children: [_jsxs("header", { className: css.viewHeader, children: [_jsx("span", { className: css.viewTitle, children: t('view.digest') }), _jsxs("span", { className: css.viewCount, children: [rounds.length, " ", t('header.count')] })] }), _jsx("div", { className: css.list, children: rounds.map((round, index) => (_jsx(DigestRow, { round: round, index: index, t: t, expanded: expanded.has(round.seq), onToggle: () => toggle(round.seq) }, round.seq))) }), hasMore ? (_jsx("button", { className: css.loadOlder, disabled: loadingOlder, onClick: loadOlder, children: loadingOlder ? t('loadingOlder') : t('loadOlder') })) : null] }));
}
//# sourceMappingURL=DigestView.js.map