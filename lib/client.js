window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-digest",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/digest.js
		/** Friendly category map for first-party dsh tools; unknown names fall through to themselves. */
		const ACTION_CATEGORIES = {
			bash: "shell",
			pwsh: "shell",
			terminal: "shell",
			read: "read",
			read_image: "read",
			edit: "edit",
			write: "edit",
			str_replace_editor: "edit",
			glob: "search",
			grep: "search",
			web_search: "web",
			web_fetch: "web"
		};
		/** Categorize one tool name into a stable display category key. */
		function categorizeTool(name) {
			const direct = ACTION_CATEGORIES[name];
			if (direct !== void 0) return direct;
			if (name.startsWith("subagent")) return "subagent";
			if (name.startsWith("todo")) return "todo";
			if (name.startsWith("skill")) return "skill";
			if (name.startsWith("goal")) return "goal";
			if (name.startsWith("plan")) return "plan";
			return name;
		}
		/** Keys probed for file paths in edit/write-style tool arguments. */
		const FILE_ARG_KEYS = [
			"path",
			"filePath",
			"oldPath",
			"newPath",
			"uri",
			"root",
			"file"
		];
		/** Extract unique file paths from a raw JSON tool-arguments string. */
		function extractFilePaths(argsRaw) {
			if (argsRaw === void 0) return [];
			let args;
			try {
				args = JSON.parse(argsRaw);
			} catch {
				return [];
			}
			if (typeof args !== "object" || args === null || Array.isArray(args)) return [];
			const record = args;
			const files = [];
			for (const key of FILE_ARG_KEYS) {
				const value = record[key];
				if (typeof value === "string" && value.trim() !== "") files.push(value.trim());
			}
			return [...new Set(files)];
		}
		/** Name and raw arguments of one tool block, in either lifecycle form. */
		function toolCallFacts(block) {
			return "kind" in block ? {
				name: block.call?.name,
				args: block.call?.argsRaw
			} : {
				name: block.name,
				args: block.argsRaw
			};
		}
		/** Whether a tool root has settled (carries its final result). */
		function isSettledToolRoot(block) {
			return "kind" in block;
		}
		/** Walk one tool root and its nested subcalls into the dedupe map (keyed by call id). */
		function collectCalls(root, out) {
			const facts = toolCallFacts(root);
			if (facts.name !== void 0) out.set(root.callId, {
				name: facts.name,
				args: facts.args
			});
			for (const child of root.subCalls) collectCalls(child, out);
		}
		/** Fold the raw call map into sorted, categorized actions. */
		function foldActions(calls) {
			const byKind = /* @__PURE__ */ new Map();
			for (const { name, args } of calls.values()) {
				const kind = categorizeTool(name);
				let bucket = byKind.get(kind);
				if (bucket === void 0) {
					bucket = {
						count: 0,
						files: [],
						label: name
					};
					byKind.set(kind, bucket);
				}
				bucket.count += 1;
				if (kind === "edit" || kind === "read") {
					for (const file of extractFilePaths(args)) if (!bucket.files.includes(file)) bucket.files.push(file);
				}
			}
			return [...byKind.entries()].map(([kind, bucket]) => ({
				kind,
				label: bucket.label,
				count: bucket.count,
				files: bucket.files.slice(0, 8)
			})).sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind));
		}
		/** True when the node is an append-surface user or steering message. */
		function isUserNode(kind) {
			return kind === "user" || kind === "steering";
		}
		/**
		* Fold the assembled Chat nodes (any order) into per-user-message digest
		* rounds ordered by anchor seq. Assistant evidence for a round is: settled
		* text from assistant steps, settled tool results, or the turn-tail closing.
		*/
		function buildDigests(nodes) {
			const ordered = [...nodes].sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
			const rounds = [];
			let current = null;
			const finalize = () => {
				if (current === null) return;
				const actions = foldActions(current.calls);
				rounds.push({
					seq: current.seq,
					time: current.time,
					turn: current.turn,
					userText: current.userText,
					assistantText: current.textParts.join("\n").trim(),
					actions,
					totalCalls: current.calls.size,
					pending: !current.hasAssistantEvidence
				});
				current = null;
			};
			for (const node of ordered) {
				if (node.visibility !== "visible") continue;
				if (isUserNode(node.kind)) {
					finalize();
					const data = node.data;
					current = {
						seq: node.anchorSeq,
						time: data.time,
						userText: data.content.filter((block) => block.type === "text" && block.text !== void 0).map((block) => block.text).join("\n").trim(),
						textParts: [],
						calls: /* @__PURE__ */ new Map(),
						turn: null,
						hasAssistantEvidence: false
					};
					continue;
				}
				if (current === null) continue;
				if (node.kind === "assistant-step") {
					const data = node.data;
					current.turn = data.turn;
					for (const block of data.blocks) if (block.kind === "text" && block.text !== void 0 && block.text.trim() !== "") {
						current.textParts.push(block.text.trim());
						current.hasAssistantEvidence = true;
					}
					continue;
				}
				if (node.kind === "tool-call") {
					const data = node.data;
					collectCalls(data.root, current.calls);
					if (isSettledToolRoot(data.root)) current.hasAssistantEvidence = true;
					continue;
				}
				if (node.kind === "turn-tail") {
					const closing = node.data.closing;
					if (closing !== null && current.textParts.length === 0) {
						for (const block of closing.blocks) if (block.kind === "text" && block.text !== void 0 && block.text.trim() !== "") {
							current.textParts.push(block.text.trim());
							current.hasAssistantEvidence = true;
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
		function firstSentence(text, max = 140) {
			const trimmed = text.trim();
			if (trimmed === "") return "";
			const punct = trimmed.search(SENTENCE_PUNCT);
			const newline = trimmed.search(NEWLINE);
			let end = -1;
			if (punct > 0) end = punct;
			else if (newline > 0) end = newline;
			let candidate = end > 0 ? trimmed.slice(0, end) : trimmed;
			candidate = candidate.replace(/\s+/g, " ").trim();
			if (candidate === "") candidate = trimmed.replace(/\s+/g, " ").trim();
			if (candidate.length <= max) return candidate;
			return `${candidate.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
		}
		//#endregion
		//#region \0dsh-css:/Users/ezgrid-dev/ai/deepseek-harness/packages/client/ui-digest/src/client/DigestView.module.css.mjs
		const css = ".ceFBHG_view{flex-direction:column;height:100%;min-height:0;display:flex}.ceFBHG_viewHeader{border-bottom:1px solid var(--dsh-border,#7f7f7f40);align-items:baseline;gap:.5rem;padding:.75rem 1rem;display:flex}.ceFBHG_viewTitle{font-weight:600}.ceFBHG_viewCount{opacity:.6;font-size:.85em}.ceFBHG_list{flex-direction:column;flex:1;gap:.5rem;min-height:0;padding:.5rem 1rem 1rem;display:flex;overflow-y:auto}.ceFBHG_row{border:1px solid var(--dsh-border,#7f7f7f40);cursor:pointer;border-radius:8px;padding:.6rem .75rem;transition:border-color .12s}.ceFBHG_row:hover,.ceFBHG_rowExpanded{border-color:var(--dsh-accent,#5a78ff99)}.ceFBHG_rowHeader{justify-content:space-between;align-items:baseline;margin-bottom:.35rem;display:flex}.ceFBHG_rowHeading{opacity:.75;font-size:.85em;font-weight:600}.ceFBHG_rowTime{opacity:.55;font-size:.8em}.ceFBHG_userLine,.ceFBHG_aiLine{gap:.5rem;margin:.15rem 0;line-height:1.45;display:flex}.ceFBHG_who{border-radius:4px;flex:none;align-self:flex-start;padding:.1rem .35rem;font-size:.8em;font-weight:700}.ceFBHG_userLine .ceFBHG_who{color:var(--dsh-accent,#5a78ff);background:#5a78ff24}.ceFBHG_aiLine .ceFBHG_who{color:var(--dsh-accent-ok,#2e9e6b);background:#3cb47829}.ceFBHG_userText,.ceFBHG_summary{word-break:break-word;overflow-wrap:anywhere}.ceFBHG_summary{opacity:.92}.ceFBHG_actions{flex-wrap:wrap;gap:.35rem;margin:.4rem 0 0;padding:0;list-style:none;display:flex}.ceFBHG_action{background:#7f7f7f1f;border-radius:999px;align-items:center;gap:.3rem;padding:.15rem .55rem;font-size:.8em;display:inline-flex}.ceFBHG_actionLabel{font-weight:600}.ceFBHG_actionCount{opacity:.7}.ceFBHG_actionFiles{opacity:.75;font-family:var(--dsh-mono,ui-monospace, SFMono-Regular, Menlo, monospace);font-size:.92em}.ceFBHG_fullReply{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;background:#7f7f7f14;border-radius:6px;max-height:24rem;margin:.5rem 0 0;padding:.5rem;font-size:.85em;overflow-y:auto}.ceFBHG_expandHint{opacity:.55;margin-top:.35rem;font-size:.75em;display:block}.ceFBHG_loadOlder{border:1px solid var(--dsh-border,#7f7f7f40);color:inherit;cursor:pointer;background:0 0;border-radius:8px;flex:none;margin:0 1rem 1rem;padding:.5rem}.ceFBHG_loadOlder:disabled{opacity:.5;cursor:default}.ceFBHG_empty{text-align:center;flex-direction:column;justify-content:center;align-items:center;gap:.4rem;height:100%;padding:2rem;display:flex}.ceFBHG_emptyTitle{font-size:1.05em;font-weight:600}.ceFBHG_emptyHint{opacity:.6;max-width:28rem;font-size:.9em}";
		const tagId = "@deepseek-ai/dsh-client-ui-digest/DigestView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-digest";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var DigestView_module_css_default = {
			"action": "ceFBHG_action",
			"actionCount": "ceFBHG_actionCount",
			"actionFiles": "ceFBHG_actionFiles",
			"actionLabel": "ceFBHG_actionLabel",
			"actions": "ceFBHG_actions",
			"aiLine": "ceFBHG_aiLine",
			"empty": "ceFBHG_empty",
			"emptyHint": "ceFBHG_emptyHint",
			"emptyTitle": "ceFBHG_emptyTitle",
			"expandHint": "ceFBHG_expandHint",
			"fullReply": "ceFBHG_fullReply",
			"list": "ceFBHG_list",
			"loadOlder": "ceFBHG_loadOlder",
			"row": "ceFBHG_row",
			"rowExpanded": "ceFBHG_rowExpanded",
			"rowHeader": "ceFBHG_rowHeader",
			"rowHeading": "ceFBHG_rowHeading",
			"rowTime": "ceFBHG_rowTime",
			"summary": "ceFBHG_summary",
			"userLine": "ceFBHG_userLine",
			"userText": "ceFBHG_userText",
			"view": "ceFBHG_view",
			"viewCount": "ceFBHG_viewCount",
			"viewHeader": "ceFBHG_viewHeader",
			"viewTitle": "ceFBHG_viewTitle",
			"who": "ceFBHG_who"
		};
		//#endregion
		//#region lib/types/client/DigestView.js
		/** Turn-digest overview view: one row per user message with a one-line AI summary. */
		/** Friendly action category → locale key; unknown categories display their raw tool name. */
		const ACTION_LABEL_KEYS = {
			shell: "action.shell",
			read: "action.read",
			edit: "action.edit",
			search: "action.search",
			web: "action.web",
			subagent: "action.subagent",
			todo: "action.todo",
			skill: "action.skill",
			goal: "action.goal",
			plan: "action.plan"
		};
		const SUMMARY_MAX = 160;
		const USER_TEXT_CLAMP = 140;
		function basename(path) {
			const segments = path.split(/[\\/]/);
			return segments[segments.length - 1] ?? path;
		}
		function actionLabel(t, action) {
			const key = ACTION_LABEL_KEYS[action.kind];
			return key === void 0 ? action.label : t(key);
		}
		/** The one-line summary of a round: first sentence of the reply, with structured fallbacks. */
		function roundSummary(t, round) {
			const sentence = firstSentence(round.assistantText, SUMMARY_MAX);
			if (sentence !== "") return sentence;
			if (round.totalCalls > 0) return t("summary.toolOnly");
			return round.pending ? t("summary.running") : t("summary.noReply");
		}
		/** Short clock time for one row. */
		function clockTime(time) {
			return new Date(time).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit"
			});
		}
		function clampText(text, max) {
			if (text.length <= max) return text;
			return `${text.slice(0, max).trimEnd()}…`;
		}
		/** Render one digest round; expanded rows show the full user message and reply. */
		function DigestRow({ round, index, t, expanded, onToggle }) {
			const userText = round.userText.trim();
			const summary = roundSummary(t, round);
			const showMore = userText.length > USER_TEXT_CLAMP || round.assistantText !== "";
			const heading = round.turn === null ? `${index + 1} · ${t("pending")}` : `#${round.turn} ${t("turn")}`;
			return (0, react_jsx_runtime.jsxs)("article", {
				className: `${DigestView_module_css_default.row} ${expanded ? DigestView_module_css_default.rowExpanded : ""}`,
				onClick: onToggle,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: DigestView_module_css_default.rowHeader,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: DigestView_module_css_default.rowHeading,
							children: heading
						}), (0, react_jsx_runtime.jsx)("time", {
							className: DigestView_module_css_default.rowTime,
							children: clockTime(round.time)
						})]
					}),
					(0, react_jsx_runtime.jsxs)("p", {
						className: DigestView_module_css_default.userLine,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: DigestView_module_css_default.who,
							children: t("you")
						}), (0, react_jsx_runtime.jsx)("span", {
							className: DigestView_module_css_default.userText,
							children: expanded ? userText || t("summary.noReply") : clampText(userText, USER_TEXT_CLAMP) || t("summary.noReply")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("p", {
						className: DigestView_module_css_default.aiLine,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: DigestView_module_css_default.who,
							children: t("ai")
						}), (0, react_jsx_runtime.jsx)("span", {
							className: DigestView_module_css_default.summary,
							children: summary
						})]
					}),
					round.actions.length > 0 ? (0, react_jsx_runtime.jsx)("ul", {
						className: DigestView_module_css_default.actions,
						children: round.actions.map((action) => {
							const label = actionLabel(t, action);
							const files = action.files.slice(0, 3).map(basename).join(", ");
							return (0, react_jsx_runtime.jsxs)("li", {
								className: DigestView_module_css_default.action,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: DigestView_module_css_default.actionLabel,
										children: label
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: DigestView_module_css_default.actionCount,
										children: ["×", action.count]
									}),
									files !== "" ? (0, react_jsx_runtime.jsx)("span", {
										className: DigestView_module_css_default.actionFiles,
										children: files
									}) : null
								]
							}, action.kind);
						})
					}) : null,
					expanded && round.assistantText !== "" ? (0, react_jsx_runtime.jsx)("pre", {
						className: DigestView_module_css_default.fullReply,
						children: round.assistantText
					}) : null,
					showMore ? (0, react_jsx_runtime.jsx)("span", {
						className: DigestView_module_css_default.expandHint,
						children: expanded ? t("collapse") : t("expand")
					}) : null
				]
			});
		}
		/**
		* The digest view entry: a full conversation overview tab folding every user
		* message and its AI reply into one line, so long assistant outputs cannot
		* bury what the user asked or what the AI did.
		*/
		function DigestView({ useSession, loadOlder, t }) {
			const nodes = useSession((snapshot) => snapshot.chat.nodes.values());
			const hasMore = useSession((snapshot) => snapshot.hasMore);
			const loadingOlder = useSession((snapshot) => snapshot.loadingOlder);
			const rounds = (0, react.useMemo)(() => buildDigests(nodes), [nodes]);
			const [expanded, setExpanded] = (0, react.useState)(/* @__PURE__ */ new Set());
			const toggle = (seq) => {
				setExpanded((previous) => {
					const next = new Set(previous);
					if (next.has(seq)) next.delete(seq);
					else next.add(seq);
					return next;
				});
			};
			if (rounds.length === 0) return (0, react_jsx_runtime.jsxs)("div", {
				className: DigestView_module_css_default.empty,
				children: [(0, react_jsx_runtime.jsx)("p", {
					className: DigestView_module_css_default.emptyTitle,
					children: t("empty.title")
				}), (0, react_jsx_runtime.jsx)("p", {
					className: DigestView_module_css_default.emptyHint,
					children: t("empty.hint")
				})]
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				className: DigestView_module_css_default.view,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: DigestView_module_css_default.viewHeader,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: DigestView_module_css_default.viewTitle,
							children: t("view.digest")
						}), (0, react_jsx_runtime.jsxs)("span", {
							className: DigestView_module_css_default.viewCount,
							children: [
								rounds.length,
								" ",
								t("header.count")
							]
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: DigestView_module_css_default.list,
						children: rounds.map((round, index) => (0, react_jsx_runtime.jsx)(DigestRow, {
							round,
							index,
							t,
							expanded: expanded.has(round.seq),
							onToggle: () => toggle(round.seq)
						}, round.seq))
					}),
					hasMore ? (0, react_jsx_runtime.jsx)("button", {
						className: DigestView_module_css_default.loadOlder,
						disabled: loadingOlder,
						onClick: loadOlder,
						children: loadingOlder ? t("loadingOlder") : t("loadOlder")
					}) : null
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `digest` namespace dictionaries (view tab label, empty state, action chips). */
		/** Dictionary namespace owned by this plugin. */
		const NS = "digest";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"view.digest": "全览",
			"header.count": "轮",
			"empty.title": "还没有对话",
			"empty.hint": "发送一条消息后，这里会逐轮列出你的提问和 AI 的一句话总结。",
			"loadOlder": "加载更早的对话",
			"loadingOlder": "加载中…",
			"you": "你",
			"ai": "AI",
			"pending": "等待回复",
			"summary.toolOnly": "仅执行了工具调用，无文本回复",
			"summary.noReply": "本轮无文本回复",
			"summary.running": "回复生成中…",
			"expand": "展开",
			"collapse": "收起",
			"turn": "轮",
			"actions": "动作",
			"action.shell": "运行命令",
			"action.read": "读取文件",
			"action.edit": "修改文件",
			"action.search": "搜索文件",
			"action.web": "检索网页",
			"action.subagent": "委派子代理",
			"action.todo": "更新待办",
			"action.skill": "调用技能",
			"action.goal": "更新目标",
			"action.plan": "更新计划"
		};
		/** English dictionary. */
		const en = {
			"view.digest": "Overview",
			"header.count": "turns",
			"empty.title": "No conversation yet",
			"empty.hint": "After you send a message, each turn appears here as your question plus a one-sentence summary of what the AI did.",
			"loadOlder": "Load older messages",
			"loadingOlder": "Loading…",
			"you": "You",
			"ai": "AI",
			"pending": "Waiting for reply",
			"summary.toolOnly": "Ran tool calls only, no text reply",
			"summary.noReply": "No text reply this turn",
			"summary.running": "Reply in progress…",
			"expand": "Expand",
			"collapse": "Collapse",
			"turn": "Turn",
			"actions": "actions",
			"action.shell": "Run commands",
			"action.read": "Read files",
			"action.edit": "Edit files",
			"action.search": "Search files",
			"action.web": "Web search",
			"action.subagent": "Delegate subagent",
			"action.todo": "Update todos",
			"action.skill": "Use skill",
			"action.goal": "Update goal",
			"action.plan": "Update plan"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Required services: the view slot, the session binding for history paging, and copy. */
		const inject = [
			"slots",
			"sessions",
			"locale"
		];
		/**
		* Client plugin body: register the digest tab in the conversation view ring.
		* The fold reads the assembled Chat snapshot through the standard kit, so the
		* plugin owns no store, no RPC, and no event listener of its own.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-digest: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "digest",
				order: 20,
				locale: NS,
				label: () => t("view.digest"),
				inject: (sessionId) => ({ loadOlder: () => {
					ctx.sessions.binding(sessionId)?.session.loadOlder().catch(() => {});
				} })
			}, DigestView));
		}
		//#endregion
		exports.DigestView = DigestView;
		exports.apply = apply;
		exports.buildDigests = buildDigests;
		exports.categorizeTool = categorizeTool;
		exports.extractFilePaths = extractFilePaths;
		exports.firstSentence = firstSentence;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map