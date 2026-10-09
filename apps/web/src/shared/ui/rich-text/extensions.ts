import { mergeAttributes, type AnyExtension } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Code from "@tiptap/extension-code";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import Mention from "@tiptap/extension-mention";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { isSafeLinkUrl, mentionTokenAt, mentionToken } from "@flowdesk/contracts";

/**
 * The editor's building blocks for formatted comments (ADR 0056). Only what comments allow is listed, so a heading, a quote, a code block or an
 * image can never be made, typed with a shortcut, or pasted in: ProseMirror throws away anything its schema does not have.
 *
 * The editor reads and writes the SAME Markdown subset the comment card reads (`parseCommentMarkdown` in the contracts package), including the
 * @mention token (ADR 0033): a mention is its own node here, written back as `@[Name](user:<id>)`.
 */

/** The mention as a node that reads and writes the stored token. The picker (`suggestion`) is supplied by the editor component. */
export function mentionExtension(suggestion?: Partial<SuggestionOptions>) {
  return Mention.extend({
    markdownTokenName: "mention",
    markdownTokenizer: {
      name: "mention",
      level: "inline",
      start: "@[",
      tokenize(src: string) {
        const found = mentionTokenAt(src, 0);
        if (!found) return undefined;
        return { type: "mention", raw: src.slice(0, found.end), id: found.userId, label: found.name };
      },
    },
    parseMarkdown(token, helpers) {
      return helpers.createNode("mention", { id: token.id, label: token.label });
    },
    renderMarkdown(node) {
      return mentionToken(String(node.attrs?.id ?? ""), String(node.attrs?.label ?? ""));
    },
  }).configure({
    HTMLAttributes: { class: "font-medium" },
    renderText: ({ node }) => `@${node.attrs.label ?? ""}`,
    renderHTML: ({ options, node }) => ["span", mergeAttributes(options.HTMLAttributes, { "data-mention": node.attrs.id }), `@${node.attrs.label ?? ""}`],
    suggestion: { char: "@", allowSpaces: false, ...suggestion },
  });
}

export function buildExtensions(options: {
  placeholder?: string;
  /** Called by the link shortcut (Ctrl+Shift+K); the component opens its link box. */
  onLinkShortcut: () => void;
  suggestion?: Partial<SuggestionOptions>;
}): AnyExtension[] {
  return [
    Document,
    Paragraph,
    Text,
    HardBreak,
    Bold,
    Italic,
    // Ctrl+Shift+X (the default, Ctrl+Shift+S, is the browser's and many apps' "save as").
    Strike.extend({
      addKeyboardShortcuts() {
        return { "Mod-Shift-x": () => this.editor.commands.toggleStrike() };
      },
    }),
    Code,
    Link.extend({
      // Loading a body: a link the reader would refuse to draw (unsafe address, or a title, which the reader does not read) stays the text it was.
      parseMarkdown(token, helpers) {
        if (!isSafeLinkUrl(String(token.href ?? "")) || token.title) return helpers.createTextNode(String(token.raw ?? ""));
        return helpers.applyMark("link", helpers.parseInline(token.tokens || []), { href: token.href, title: null });
      },
      // Ctrl+K stays the app's search palette; the link shortcut is Ctrl+Shift+K.
      addKeyboardShortcuts() {
        return {
          "Mod-Shift-k": () => {
            options.onLinkShortcut();
            return true;
          },
        };
      },
    }).configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      // The same check as the reader, so the editor can never hold a link the card would refuse to draw.
      isAllowedUri: (url) => isSafeLinkUrl(url),
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow ugc", class: "underline underline-offset-2" },
    }),
    BulletList,
    OrderedList,
    ListItem,
    UndoRedo,
    Placeholder.configure({ placeholder: options.placeholder ?? "" }),
    mentionExtension(options.suggestion),
    Markdown,
  ];
}
