/**
 * YouTube extension with tiptap-markdown support.
 *
 * Serialises as a fenced code block with language "youtube":
 *   ```youtube
 *   https://www.youtube.com/watch?v=...
 *   ```
 *
 * This round-trips cleanly through the markdown file without needing html:true.
 */

import Youtube from '@tiptap/extension-youtube';

export const YoutubeExtension = Youtube.extend({
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(state: any, node: any) {
          const src = node.attrs.src || '';
          state.write(`\`\`\`youtube\n${src}\n\`\`\``);
          state.closeBlock(node);
        },
        parse: {
          setup(md: any) {
            if ((md as any).__mmwYoutube) return;
            (md as any).__mmwYoutube = true;

            // Override the fence renderer to intercept ```youtube blocks
            const origFence = md.renderer.rules.fence;
            md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
              const token = tokens[idx];
              if (token.info.trim() === 'youtube') {
                const src = token.content.trim();
                // Produce HTML that matches the YouTube extension's parseHTML rule
                return `<div data-youtube-video><iframe src="${src}" frameborder="0" allowfullscreen></iframe></div>\n`;
              }
              return origFence
                ? origFence(tokens, idx, options, env, self)
                : self.renderToken(tokens, idx, options);
            };
          },
        },
      },
    };
  },
});
