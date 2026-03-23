/**
 * Notion-style table controls: add/delete column/row, sort, reorder columns.
 * Hover zones and header controls wire to TipTap table commands.
 */

import { Editor } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';

const EDGE_ZONE = 24;
const HEADER_CONTROL_OFFSET = 4;

function findTableWrapper(el: Node | null): HTMLElement | null {
  while (el) {
    if (el instanceof HTMLElement && el.classList?.contains('tableWrapper')) return el;
    el = el.parentElement;
  }
  return null;
}

function getCellPos(editor: Editor, cell: HTMLTableCellElement): number | null {
  try {
    const pos = editor.view.posAtDOM(cell, 0);
    const $pos = editor.state.doc.resolve(pos);
    return $pos.pos + 1;
  } catch {
    return null;
  }
}

function getTableNode(editor: Editor, tableEl: HTMLTableElement): { pos: number; node: ProseNode } | null {
  const cell = tableEl.querySelector('th, td');
  if (!cell) return null;
  const cellPos = getCellPos(editor, cell as HTMLTableCellElement);
  if (cellPos == null) return null;
  const $pos = editor.state.doc.resolve(cellPos);
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'table') return { pos: $pos.before(d), node };
  }
  return null;
}

function columnIndex(cell: HTMLTableCellElement): number {
  const row = cell.closest('tr');
  if (!row) return 0;
  const cells = Array.from(row.querySelectorAll('th, td'));
  return cells.indexOf(cell);
}

function isHeaderRow(tr: HTMLTableRowElement): boolean {
  return tr.closest('thead') !== null;
}

function sortTable(editor: Editor, tableEl: HTMLTableElement, colIndex: number, asc: boolean) {
  const info = getTableNode(editor, tableEl);
  if (!info) return;
  const { pos, node } = info;
  const rows: ProseNode[] = [];
  node.forEach((row) => rows.push(row));
  const headerRows: ProseNode[] = [];
  const bodyRows: ProseNode[] = [];
  rows.forEach((row) => {
    const firstCell = row.firstChild;
    if (firstCell?.type.name === 'table_header') headerRows.push(row);
    else bodyRows.push(row);
  });
  if (bodyRows.length <= 1) return;

  const colCount = headerRows[0]?.childCount ?? bodyRows[0]?.childCount ?? 0;
  if (colIndex >= colCount) return;

  const getCellText = (row: ProseNode, i: number): string => {
    const cell = row.child(i);
    return cell ? cell.textContent.trim() : '';
  };

  bodyRows.sort((a, b) => {
    const aVal = getCellText(a, colIndex);
    const bVal = getCellText(b, colIndex);
    const aNum = parseFloat(aVal.replace(/[^0-9.-]/g, ''));
    const bNum = parseFloat(bVal.replace(/[^0-9.-]/g, ''));
    const numCompare = !Number.isNaN(aNum) && !Number.isNaN(bNum);
    const cmp = numCompare ? aNum - bNum : aVal.localeCompare(bVal);
    return asc ? cmp : -cmp;
  });

  const newRows = [...headerRows, ...bodyRows];
  const newTable = node.type.create(node.attrs, newRows);
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, newTable);
  editor.view.dispatch(tr);
  editor.view.focus();
}

function moveColumn(editor: Editor, tableEl: HTMLTableElement, fromCol: number, toCol: number) {
  const info = getTableNode(editor, tableEl);
  if (!info || fromCol === toCol) return;
  const { pos, node } = info;
  const colCount = node.firstChild?.childCount ?? 0;
  if (fromCol < 0 || fromCol >= colCount || toCol < 0 || toCol >= colCount) return;

  const newRows: ProseNode[] = [];
  node.forEach((row) => {
    const cells: ProseNode[] = [];
    row.forEach((cell) => cells.push(cell));
    const extracted = cells.splice(fromCol, 1)[0];
    if (!extracted) return;
    cells.splice(toCol, 0, extracted);
    newRows.push(row.type.create(row.attrs, cells));
  });
  if (newRows.length !== node.childCount) return;
  const newTable = node.type.create(node.attrs, newRows);
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, newTable);
  editor.view.dispatch(tr);
  editor.view.focus();
}

function createButton(icon: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = title;
  btn.className = 'table-ctrl-btn';
  btn.innerHTML = icon;
  return btn;
}

export function initTableHoverUI(editor: Editor) {
  const proseEl = editor.view.dom as HTMLElement;

  const addColBtn = createButton('+', 'Add column');
  addColBtn.classList.add('table-ctrl-floating');
  const addRowBtn = createButton('+', 'Add row');
  addRowBtn.classList.add('table-ctrl-floating');
  const headerMenu = document.createElement('div');
  headerMenu.className = 'table-header-menu';
  headerMenu.innerHTML = `
    <button type="button" class="table-ctrl-btn" title="Sort ascending">↑</button>
    <button type="button" class="table-ctrl-btn" title="Sort descending">↓</button>
    <button type="button" class="table-ctrl-btn table-ctrl-delete" title="Delete column">×</button>
  `;
  const rowDeleteBtn = createButton('×', 'Delete row');
  rowDeleteBtn.className = 'table-ctrl-btn table-ctrl-delete table-ctrl-floating';

  const colDragHandle = document.createElement('div');
  colDragHandle.className = 'table-col-drag';
  colDragHandle.title = 'Drag to reorder column';
  colDragHandle.innerHTML = '⋮⋮';

  document.body.appendChild(addColBtn);
  document.body.appendChild(addRowBtn);
  document.body.appendChild(headerMenu);
  document.body.appendChild(rowDeleteBtn);
  document.body.appendChild(colDragHandle);

  let activeWrapper: HTMLElement | null = null;
  let activeTable: HTMLTableElement | null = null;
  let activeHeaderCell: HTMLTableCellElement | null = null;
  let activeRow: HTMLTableRowElement | null = null;
  let dragColFrom = -1;
  let dragColTo = -1;
  let isColDragging = false;

  function hideAll() {
    if (isColDragging) return;
    addColBtn.classList.remove('visible');
    addRowBtn.classList.remove('visible');
    headerMenu.classList.remove('visible');
    rowDeleteBtn.classList.remove('visible');
    colDragHandle.classList.remove('visible');
    activeWrapper = null;
    activeTable = null;
    activeHeaderCell = null;
    activeRow = null;
  }

  const ctrlElements = [addColBtn, addRowBtn, headerMenu, rowDeleteBtn, colDragHandle];
  function isOverTableOrControls(el: Element | null): boolean {
    if (!el) return false;
    if (ctrlElements.some((c) => c.contains(el))) return true;
    return proseEl.contains(el) && !!findTableWrapper(el as Node);
  }

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (isColDragging) return;
    const elAt = document.elementFromPoint(e.clientX, e.clientY);
    if (!isOverTableOrControls(elAt)) {
      hideAll();
      return;
    }
    if (ctrlElements.some((c) => c.contains(elAt))) return;

    const wrapper = findTableWrapper(e.target as Node);
    const tableEl = wrapper?.querySelector('table') ?? null;
    if (!wrapper || !tableEl) {
      hideAll();
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const nearRight = relX >= rect.width - EDGE_ZONE;
    const nearBottom = relY >= rect.height - EDGE_ZONE;

    const cell = (e.target as HTMLElement).closest?.('th, td');
    const headerCell = cell?.closest('th') ? (cell as HTMLTableCellElement) : null;
    const row = (e.target as HTMLElement).closest?.('tr');
    const bodyRow = row && !isHeaderRow(row) ? row : null;

    if (nearRight && tableEl) {
      activeWrapper = wrapper;
      activeTable = tableEl;
      addColBtn.classList.add('visible');
      addColBtn.style.left = `${rect.right - 32}px`;
      addColBtn.style.top = `${rect.top + rect.height / 2 - 14}px`;
      addRowBtn.classList.remove('visible');
      headerMenu.classList.remove('visible');
      rowDeleteBtn.classList.remove('visible');
      colDragHandle.classList.remove('visible');
      return;
    }

    if (nearBottom && tableEl) {
      activeWrapper = wrapper;
      activeTable = tableEl;
      addRowBtn.classList.add('visible');
      addRowBtn.style.left = `${rect.left + rect.width / 2 - 14}px`;
      addRowBtn.style.top = `${rect.bottom - 32}px`;
      addColBtn.classList.remove('visible');
      headerMenu.classList.remove('visible');
      rowDeleteBtn.classList.remove('visible');
      colDragHandle.classList.remove('visible');
      return;
    }

    if (headerCell) {
      activeWrapper = wrapper;
      activeTable = tableEl;
      activeHeaderCell = headerCell;
      const hr = headerCell.getBoundingClientRect();
      headerMenu.classList.add('visible');
      headerMenu.style.left = `${hr.right - 90}px`;
      headerMenu.style.top = `${hr.top + HEADER_CONTROL_OFFSET}px`;
      colDragHandle.classList.add('visible');
      colDragHandle.style.left = `${hr.left - 20}px`;
      colDragHandle.style.top = `${hr.top + hr.height / 2 - 8}px`;
      colDragHandle.dataset.colIndex = String(columnIndex(headerCell));
      addColBtn.classList.remove('visible');
      addRowBtn.classList.remove('visible');
      rowDeleteBtn.classList.remove('visible');
      return;
    }

    if (bodyRow) {
      activeWrapper = wrapper;
      activeTable = tableEl;
      activeRow = bodyRow;
      const rowRect = bodyRow.getBoundingClientRect();
      rowDeleteBtn.classList.add('visible');
      rowDeleteBtn.style.left = `${rowRect.left - 28}px`;
      rowDeleteBtn.style.top = `${rowRect.top + rowRect.height / 2 - 10}px`;
      addColBtn.classList.remove('visible');
      addRowBtn.classList.remove('visible');
      headerMenu.classList.remove('visible');
      colDragHandle.classList.remove('visible');
      return;
    }

    hideAll();
  });

  addColBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeTable) return;
    const lastRow = activeTable.querySelector('tr');
    const cells = lastRow?.querySelectorAll('th, td');
    const lastCell = cells?.[cells.length - 1];
    const pos = lastCell ? getCellPos(editor, lastCell as HTMLTableCellElement) : null;
    if (pos == null) return;
    editor.chain().focus().setTextSelection(pos).addColumnAfter().run();
    hideAll();
  });

  addRowBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeTable) return;
    const rows = activeTable.querySelectorAll('tr');
    const lastRow = rows[rows.length - 1];
    const firstCell = lastRow?.querySelector('th, td');
    const pos = firstCell ? getCellPos(editor, firstCell as HTMLTableCellElement) : null;
    if (pos == null) return;
    editor.chain().focus().setTextSelection(pos).addRowAfter().run();
    hideAll();
  });

  const sortAsc = headerMenu.querySelector('button:nth-child(1)');
  const sortDesc = headerMenu.querySelector('button:nth-child(2)');
  const deleteCol = headerMenu.querySelector('button:nth-child(3)');

  sortAsc?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTable && activeHeaderCell) {
      sortTable(editor, activeTable, columnIndex(activeHeaderCell), true);
    }
    hideAll();
  });

  sortDesc?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTable && activeHeaderCell) {
      sortTable(editor, activeTable, columnIndex(activeHeaderCell), false);
    }
    hideAll();
  });

  deleteCol?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTable && activeHeaderCell) {
      const pos = getCellPos(editor, activeHeaderCell);
      if (pos != null) editor.chain().focus().setTextSelection(pos).deleteColumn().run();
    }
    hideAll();
  });

  rowDeleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeRow) return;
    const firstCell = activeRow.querySelector('th, td');
    const pos = firstCell ? getCellPos(editor, firstCell as HTMLTableCellElement) : null;
    if (pos == null) return;
    editor.chain().focus().setTextSelection(pos).deleteRow().run();
    hideAll();
  });

  let dragTableRef: HTMLTableElement | null = null;

  colDragHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const colIdx = parseInt(colDragHandle.dataset.colIndex ?? '-1', 10);
    if (colIdx < 0 || !activeTable) return;
    dragColFrom = colIdx;
    dragColTo = colIdx;
    dragTableRef = activeTable;
    isColDragging = true;
    document.addEventListener('mousemove', onColDragMove);
    document.addEventListener('mouseup', onColDragUp);
  });

  function onColDragMove(e: MouseEvent) {
    if (!dragTableRef) return;
    const rows = dragTableRef.querySelectorAll('tr');
    const firstRow = rows[0];
    const cells = firstRow?.querySelectorAll('th, td');
    if (!cells) return;
    let found = -1;
    for (let i = 0; i < cells.length; i++) {
      const r = (cells[i] as HTMLElement).getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right) {
        found = i;
        break;
      }
    }
    if (found >= 0) dragColTo = found;
  }

  function onColDragUp() {
    document.removeEventListener('mousemove', onColDragMove);
    document.removeEventListener('mouseup', onColDragUp);
    isColDragging = false;
    if (dragTableRef && dragColFrom >= 0 && dragColTo >= 0 && dragColFrom !== dragColTo) {
      moveColumn(editor, dragTableRef, dragColFrom, dragColTo);
    }
    dragColFrom = -1;
    dragColTo = -1;
    dragTableRef = null;
    hideAll();
  }
}
