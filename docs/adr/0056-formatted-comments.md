# 0056 - Formatted comments (bold, italic, lists, links)

Status: Accepted - 2026-10-10 (slice 1 of 4 built; the editor is not built yet). Builds on ADR 0033 (@mentions), ADR 0053 (the same "build it behind a seam" habit).

## Context

Comments were plain text. The owner wants bold, italic and so on, chosen with the mouse or with shortcuts (Ctrl+B, Ctrl+I), and picked a "formatted while you type" editor (option B in the design preview on `/design-system`) over a toolbar over a Markdown text box (option A, which I had recommended; B costs more: an editor library, a rework of the @mention picker, more tests).

## Decisions

1. **The stored format is a small subset of Markdown in the same text field.** No database or contract change: the 10,000-character limit stays, and the server still finds @mentions by their token (`@[Name](user:<id>)`, ADR 0033). Existing comments are stored exactly as before.
2. **One reader, shared** (`packages/contracts/src/comment-markdown.ts`, `parseCommentMarkdown`): it turns a body into a tree of nodes (text, bold, italic, strikethrough, code, mention, safe link, break; paragraphs and one-level lists). The web app draws the tree as React elements; the API can use the same reader later (for example to make a plain-text preview), so the two cannot disagree. The package now has its own tests (`pnpm test` runs a second Vitest project).
3. **Safe by shape.** The tree has no node for HTML, images or scripts, so anything typed that is not formatting stays text. A link is made only for an absolute `http:`, `https:` or `mailto:` address with no spaces or control characters; an unsafe one (`javascript:`, `data:`, relative, `user:`) is left as the exact text typed, so its address is not hidden behind a label. Drawn links open in a new tab with `noopener noreferrer nofollow ugc`. The drawing code (`entities/member/ui/MentionedText.tsx`) never builds HTML.
4. **Supported:** `**bold**`, `*italic*` or `_italic_`, `~~strikethrough~~`, `` `code` ``, `[label](address)`, bulleted and numbered lists (one level), paragraphs, line breaks, and a backslash to write a marker literally. **Not supported, on purpose:** headings, quotes, images, tables, nested lists, auto-linking of bare addresses.
5. **Conservative reading, to keep old plain comments plain:** a marker needs text right next to it (no spaces just inside), so `2 * 3 * 4` and `a ** b ** c` stay as written; `_` makes italic only at word edges and never inside a run of underscores, so `snake_case_names`, `__init__` and `window.__x` stay as written. This was tested with a browser test that found the first version wrong (it read `window.__a ... window.__b` as italic).
6. **Known cost:** a comment written before this feature that happens to contain Markdown-looking text (`**x**`, a line starting with `- `, `[a](https://...)`) now shows formatted. Not measured on real data; the demo comments are plain.
7. **Not built yet (slices 2 to 4):** the editor. Decided with the owner: TipTap (ProseMirror), loaded only when someone clicks into a comment box (measured with a scratch bundle: about 155 KB gzip for TipTap with its markdown and mention add-ons, about 137 KB for Lexical, against about 350 KB gzip for the whole app today; neither measurement is of the final code); it reads and writes the same Markdown; the @mention picker is rebuilt for it; shortcuts Ctrl+B, Ctrl+I, Ctrl+E (code), Ctrl+Shift+X (strikethrough), Ctrl+Shift+K (link; Ctrl+K stays the search palette's), Ctrl+Shift+7 and 8 (lists), Cmd on a Mac. Issue descriptions get the same editor in a later slice.

## Tests

Contracts (22): plain text and line breaks unchanged, every kind of formatting and its nesting, mentions inside bold, false-positive cases, escapes, lists, safe and unsafe links, markup typed as text, no crash or hang on worst-case input, and a random-input check. Browser: a comment with formatting, a script tag, an `onerror` image and a `javascript:` link is drawn as formatting plus the typed text, with no `img`, no `script`, no unsafe link, and the injected code never runs. Mutation checks, all caught: any scheme counted as safe, no backslash escapes, spaces allowed next to markers (two gaps found and closed), a run of underscores allowed to close or open, a link without `noopener`.

## Not verified

The editor itself (not built); that TipTap works with React 19 here and can read and write the mention token (the first step of slice 2 is a proof of that); how the formatting looks to the owner in the app; that real stored comments (beyond the demo's) are unaffected.
