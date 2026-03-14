/**
 * Simple emoji picker — no external data fetch, no CDN.
 * A curated grid of ~120 common emojis.
 */

import type { Editor } from '@tiptap/core';

// Grouped by category for the tab strip
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: '😀', emojis: ['😀','😃','😄','😁','😆','🤣','😂','😊','😍','🥰','😘','😎','🤩','🥳','😏','😔','😢','😭','😡','🤯','🤔','🙄','😴','🤗','🫡','🫠','👻','😈','💀','🤡'] },
  { label: '👋', emojis: ['👋','🤚','✋','🖐️','👌','✌️','🤞','👍','👎','👏','🙌','🫶','🤝','🙏','💪','🦾','👀','🫀','🧠','🦷','💅','🤳'] },
  { label: '🌿', emojis: ['🌸','🌺','🌻','🌹','🍀','🌿','🌲','🌳','🌴','🌵','🍄','🌾','🦋','🐝','🐛','🦎','🐢','🐬','🦁','🐶','🐱','🐻','🦊','🐼','🐨'] },
  { label: '🍎', emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍑','🍒','🍍','🥝','🥑','🍕','🍔','🌮','🌯','🍜','🍣','🍱','🍰','🎂','🍩','☕','🍺','🍷','🧃'] },
  { label: '🚀', emojis: ['🚀','✈️','🚗','🚂','🚲','⛵','🏔️','🏖️','🗺️','🌍','🏙️','🗼','🏰','🎡','🎢','⛺','🏕️'] },
  { label: '💻', emojis: ['💻','📱','📷','📹','🎬','📚','📝','✉️','📦','🔑','🔒','💡','🔧','⚙️','🎸','🎮','🎲','🃏','🎯','🏆','🥇','🎁','🎉','🎊','🎈'] },
  { label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🩷','🩵','🤍','💔','❣️','✅','❌','⭐','🌟','✨','🔥','💯','🆕','🔔','❓','‼️','♾️'] },
];

let container: HTMLElement | null = null;
let currentEditor: Editor | null = null;
let activeGroupIdx = 0;

export function openEmojiPicker(editor: Editor) {
  currentEditor = editor;

  if (!container) {
    container = document.createElement('div');
    container.id = 'emoji-picker-wrap';
    document.body.appendChild(container);

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (container?.style.display !== 'none' && !container!.contains(e.target as Node)) {
        closeEmojiPicker();
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeEmojiPicker();
    });
  }

  renderPicker();
  container.style.display = 'block';
}

export function closeEmojiPicker() {
  if (container) container.style.display = 'none';
}

function renderPicker() {
  if (!container) return;

  const tabs = EMOJI_GROUPS.map((g, i) =>
    `<button class="ep-tab${i === activeGroupIdx ? ' active' : ''}" data-gi="${i}">${g.label}</button>`
  ).join('');

  const grid = EMOJI_GROUPS[activeGroupIdx].emojis
    .map(e => `<button class="ep-emoji" data-emoji="${e}">${e}</button>`)
    .join('');

  container.innerHTML = `
    <div class="ep-tabs">${tabs}</div>
    <div class="ep-grid">${grid}</div>
  `;

  container.querySelectorAll<HTMLElement>('.ep-tab').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      activeGroupIdx = parseInt(btn.dataset.gi!, 10);
      renderPicker();
    });
  });

  container.querySelectorAll<HTMLElement>('.ep-emoji').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const emoji = btn.dataset.emoji!;
      currentEditor?.chain().focus().insertContent(emoji).run();
      closeEmojiPicker();
    });
  });
}
