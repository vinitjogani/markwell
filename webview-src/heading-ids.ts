/**
 * Heading IDs — adds stable slug-based ids to headings for PDF ToC hyperlinks.
 * Shared slug logic for both Heading extension and InlineToc.
 */

import Heading from '@tiptap/extension-heading';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'heading';
}

export function buildHeadingSlugs(doc: import('@tiptap/pm/model').Node): Map<number, string> {
  const slugs = new Map<number, string>();
  const seen = new Map<string, number>();

  doc.forEach((node, offset) => {
    if (node.type.name !== 'heading') return;
    const base = slugify(node.textContent);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${count}`;
    slugs.set(offset + 1, slug);
  });

  return slugs;
}

const key = new PluginKey('headingIds');

export const HeadingWithIds = Heading.extend({
  addAttributes() {
    return {
      level: {
        default: 1,
        rendered: false,
      },
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('id') || null,
        renderHTML: (attrs) => (attrs.id ? { id: attrs.id } : {}),
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        appendTransaction(transactions, _oldState, state) {
          const slugs = buildHeadingSlugs(state.doc);
          const tr = state.tr;
          let changed = false;

          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'heading') return;
            const wanted = slugs.get(pos + 1);
            if (!wanted || node.attrs.id === wanted) return;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: wanted });
            changed = true;
          });

          return changed ? tr : null;
        },
      }),
    ];
  },
});
