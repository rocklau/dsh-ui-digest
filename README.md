# dsh-ui-digest

A **turn-digest overview** tab for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) Web UI.

Long agent replies — hundreds of lines of text, tool cards, diffs, reasoning — bury what you actually asked and what the AI did each round. This plugin adds a **Overview (全览)** tab to the conversation view ring that folds the whole session into one round per user message:

- the **message you sent**,
- a **one-sentence summary** of the AI reply (first sentence of the settled reply text, truncated at 140 chars),
- **tool-action chips** grouped by category (commands run, files edited, files read, web searches, subagent delegations, …) with file paths extracted from edit/write arguments.

Click a row to expand the full user message and the full reply text. The summary is heuristic, deterministic and purely client-side — no LLM call, no RPC, zero cost — and updates live while a turn streams.

![Overview tab in a real session](assets/digest-overview.png)

## Features

- **One line per round** — user message, one-sentence AI summary, action chips; expandable rows.
- **Whole-conversation overview** — the digest covers the loaded history window and pages older messages with a "Load older messages" button.
- **Live** — a running turn shows as *waiting for reply* and settles as chunks land.
- **Zero cost** — heuristic summary, pure function of the session snapshot; no LLM, no persistence, no event family.
- **Bilingual** — Simplified Chinese and English copy through the dsh locale system.
- **Read-only projection** — no service, no Context merge, no conversation-node definitions; follows the official `ui-trajectory` pure-consumer pattern.

![Digest rows](assets/digest-overview-2.png)

## Installation

### As a dsh bundle (recommended)

The package ships a pre-built client bundle in `lib/` and declares `dsh.bundle` + `dsh.client`, so it installs with the plugin CLI. Grab the tarball from the [latest release](https://github.com/rocklau/dsh-ui-digest/releases) and add it (no npm account needed):

```sh
dsh plugin add https://github.com/rocklau/dsh-ui-digest/releases/download/v0.1.0/dsh-ui-digest-0.1.0.tgz
```

This injects the `ui-digest` row into your profile's composition; the browser plugin is served from `lib/client.js`. A local checkout works the same way: `dsh plugin add ./dsh-ui-digest`.

### From the deepseek-harness source tree

1. Copy the package: `cp -R <this-repo> <dsh-root>/packages/client/ui-digest/`
2. Register it in the web composition (3 edits, see the deepseek-harness PR pattern):
   - `tsconfig.client.json` → add `{ "path": "./packages/client/ui-digest" }` to `references`
   - `packages/bundle/web-app/package.json` → add `"@deepseek-ai/dsh-ui-digest": "workspace:^"`… or keep the package name `@deepseek-ai/dsh-client-ui-digest` and add it as a workspace dep
   - `packages/bundle/web-app/cordis.patch.yml` → add a roster row `- id: ui-digest / name: <package name>`
3. `pnpm install && pnpm run build && pnpm dsh web`

Requires Node 22.19+ / 24 and pnpm 11 (matching the harness toolchain). The `lib/` artifacts in this repo are built with the harness's own tsdown pipeline; rebuild with `pnpm run build:lib:client` inside the harness checkout.

## How it works

The plugin is a pure-consumer browser plugin (mirroring the official `ui-trajectory` shape):

- registers one tab in the `conversation.view` slot ring (order 20),
- folds `snapshot.chat.nodes` via the framework standard kit's `useSession` into rounds keyed by user message,
- rounds start at append-surface `user`/`steering` nodes; assistant evidence is settled text from `assistant-step` nodes, settled `tool-call` roots, or the `turn-tail` closing,
- the summary is `firstSentence(replyText, 140)` with structured fallbacks (`ran tool calls only`, `no text reply`, `reply in progress`).

Tool categorization:

| Category | dsh tools |
|---|---|
| shell · 运行命令 | `bash`, `pwsh`, `terminal` |
| read · 读取文件 | `read`, `read_image` |
| edit · 修改文件 | `edit`, `write`, `str_replace_editor` |
| search · 搜索文件 | `glob`, `grep` |
| web · 检索网页 | `web_search`, `web_fetch` |
| subagent · 委派子代理 | `subagent*` |
| todo / skill / goal / plan | `todo*`, `skill*`, `goal*`, `plan*` |

Unknown tools fall through to their raw name. File paths are extracted from `path`/`filePath`/`oldPath`/`newPath`/`uri`/`root`/`file` keys of edit/write arguments (deduplicated, up to 8 per category).

## Known limitations

- **Window-scoped** — the digest covers the loaded history window; page older messages with "Load older messages". Compacted sessions show only the post-compaction surface plus whatever the window retains.
- **Heuristic summaries only** — first-sentence extraction is language-neutral but naive: an answer opening with a code block summarizes as its first prose fragment. LLM-generated summaries would require a host-side `turn/end` listener and an event family, deliberately out of scope.
- **No cross-view deep links** — rows are a read-only projection; they do not jump back into the Chat view at the matching turn.

## Development

```sh
# inside a deepseek-harness source checkout with this package in packages/client/
pnpm vitest run packages/client/ui-digest/tests/digest.client.spec.ts   # unit tests (19)
pnpm run build:lib:client                                                # rebuild lib/client.js
pnpm dsh web                                                             # run the Web UI
```

## License

MIT. Built on top of [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT).
