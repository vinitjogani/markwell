import type { Editor } from '@tiptap/core';

export interface MarkdownRange {
  pmStart: number;
  pmEnd: number;
  mdStart: number;
  mdEnd: number;
}

/**
 * Walk the ProseMirror document and find each text node's content
 * within the serialized markdown string. This builds a mapping between
 * ProseMirror positions and markdown character offsets.
 *
 * We search forward through the markdown string, so repeated text is
 * mapped to its first occurrence after the previous mapped node.
 */
export function buildPmToMarkdownMap(editor: Editor): MarkdownRange[] {
  const markdown: string = (editor.storage.markdown as { getMarkdown(): string }).getMarkdown();
  const doc = editor.state.doc;
  const ranges: MarkdownRange[] = [];
  let mdCursor = 0;

  doc.descendants((node, pmPos) => {
    if (!node.isText || !node.text) return true;

    const text = node.text;
    const found = markdown.indexOf(text, mdCursor);
    if (found !== -1) {
      ranges.push({
        pmStart: pmPos,
        pmEnd: pmPos + text.length,
        mdStart: found,
        mdEnd: found + text.length,
      });
      mdCursor = found + text.length;
    }
    return false;
  });

  return ranges;
}

/**
 * Convert a ProseMirror document position to a markdown character offset.
 */
export function pmPosToMdOffset(ranges: MarkdownRange[], pmPos: number): number {
  for (const range of ranges) {
    if (pmPos >= range.pmStart && pmPos <= range.pmEnd) {
      return range.mdStart + (pmPos - range.pmStart);
    }
  }
  // Clamp to nearest range boundary
  if (ranges.length === 0) return 0;
  if (pmPos <= ranges[0].pmStart) return ranges[0].mdStart;
  return ranges[ranges.length - 1].mdEnd;
}
