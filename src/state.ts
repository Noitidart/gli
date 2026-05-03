import type { Commit, FileStat } from './git.js'

export type UiState = {
  commits: Commit[]
  cursorIndex: number
  scrollOffset: number
  expandedIndex: number | null
  termHeight: number
  termWidth: number
  hasMore: boolean
  totalCommits: number
  branchTips: Map<string, string[]>
  branchColWidth: number
  unpushedShas: Set<string>
  fileCursorIndex: number | null
  selectedFiles: Set<number>
  selectionUndoStack: { index: number }[]
  selectionRedoStack: { index: number }[]
}

export type Action =
  | { type: 'move-down' }
  | { type: 'move-up' }
  | { type: 'page-down' }
  | { type: 'page-up' }
  | { type: 'jump-top' }
  | { type: 'jump-bottom' }
  | { type: 'jump-line'; line: number }
  | { type: 'expand' }
  | { type: 'fold' }
  | { type: 'toggle-expand' }
  | { type: 'enter-file-cursor' }
  | { type: 'exit-file-cursor' }
  | { type: 'toggle-mark' }
  | { type: 'undo-mark' }
  | { type: 'redo-mark' }
  | { type: 'move-rel'; direction: 'down' | 'up'; count: number }
  | { type: 'yank' }
  | { type: 'yank-line'; line: number }
  | { type: 'inspect' }
  | { type: 'quit' }
  | { type: 'hard-quit' }
  | { type: 'resize'; height: number; width: number }
  | { type: 'commits-loaded'; commits: Commit[]; total: number; hasMore: boolean }
  | { type: 'detail-loaded'; index: number; body: string; files: FileStat[] }

export function createInitialState(
  commits: Commit[],
  totalCommits: number,
  hasMore: boolean,
  termHeight: number,
  termWidth: number,
  branchTips: Map<string, string[]>,
  unpushedShas: Set<string>,
): UiState {
  const branchColWidth = computeBranchColWidth(branchTips)

  return {
    commits,
    cursorIndex: 0,
    scrollOffset: 0,
    expandedIndex: null,
    termHeight,
    termWidth,
    hasMore,
    totalCommits,
    branchTips,
    branchColWidth,
    unpushedShas,
    fileCursorIndex: null,
    selectedFiles: new Set(),
    selectionUndoStack: [],
    selectionRedoStack: [],
  }
}

export function reduce(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'move-down':
      return moveDown(state)
    case 'move-up':
      return moveUp(state)
    case 'page-down':
      return pageDown(state)
    case 'page-up':
      return pageUp(state)
    case 'jump-top':
      return jumpTop(state)
    case 'jump-bottom':
      return jumpBottom(state)
    case 'jump-line':
      return jumpLine(state, action.line)
    case 'expand':
      return expand(state)
    case 'fold':
      return fold(state)
    case 'toggle-expand':
      return toggleExpand(state)
    case 'enter-file-cursor':
      return enterFileCursor(state)
    case 'exit-file-cursor':
      return exitFileCursor(state)
    case 'toggle-mark':
      return toggleMark(state)
    case 'undo-mark':
      return undoMark(state)
    case 'redo-mark':
      return redoMark(state)
    case 'move-rel':
      return moveRel(state, action.direction, action.count)
    case 'yank':
      return state
    case 'yank-line':
      return state
    case 'inspect':
      return state
    case 'quit':
      return state
    case 'hard-quit':
      return state
    case 'resize':
      return resize(state, action.height, action.width)
    case 'commits-loaded':
      return commitsLoaded(state, action.commits, action.total, action.hasMore)
    case 'detail-loaded':
      return detailLoaded(state, action.index, action.body, action.files)
  }
}

function moveDown(state: UiState): UiState {
  if (state.fileCursorIndex !== null && state.expandedIndex !== null) {
    const expandedCommit = state.commits[state.expandedIndex]
    const files = expandedCommit?.files

    if (files != null && state.fileCursorIndex < files.length - 1) {
      return { ...state, fileCursorIndex: state.fileCursorIndex + 1 }
    }

    return moveDown(clearSelections({ ...state, fileCursorIndex: null, expandedIndex: null }))
  }

  if (state.cursorIndex >= state.commits.length - 1) {
    return state
  }

  const newCursor = state.cursorIndex + 1
  let newOffset = state.scrollOffset

  if (newCursor >= state.scrollOffset + state.termHeight) {
    newOffset = newCursor - state.termHeight + 1
  }

  return {
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
  }
}

function moveUp(state: UiState): UiState {
  if (state.fileCursorIndex !== null && state.expandedIndex !== null) {
    if (state.fileCursorIndex > 0) {
      return { ...state, fileCursorIndex: state.fileCursorIndex - 1 }
    }

    return clearSelections({ ...state, fileCursorIndex: null })
  }

  if (state.cursorIndex <= 0) {
    return state
  }

  const newCursor = state.cursorIndex - 1
  let newOffset = state.scrollOffset

  if (newCursor < state.scrollOffset) {
    newOffset = newCursor
  }

  return {
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
  }
}

function pageDown(state: UiState): UiState {
  if (state.fileCursorIndex !== null) {
    return pageDown(clearSelections({ ...state, fileCursorIndex: null }))
  }

  const newCursor = Math.min(
    state.cursorIndex + state.termHeight,
    state.commits.length - 1,
  )
  const newOffset = Math.max(0, newCursor - state.termHeight + 1)

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
  })
}

function pageUp(state: UiState): UiState {
  if (state.fileCursorIndex !== null) {
    return pageUp(clearSelections({ ...state, fileCursorIndex: null }))
  }

  const newCursor = Math.max(
    state.cursorIndex - state.termHeight,
    0,
  )
  const newOffset = Math.max(newCursor, 0)

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
  })
}

function jumpTop(state: UiState): UiState {
  return clearSelections({
    ...state,
    cursorIndex: 0,
    scrollOffset: 0,
    expandedIndex: null,
    fileCursorIndex: null,
  })
}

function jumpBottom(state: UiState): UiState {
  const newCursor = state.commits.length - 1
  const newOffset = Math.max(0, newCursor - state.termHeight + 1)

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
  })
}

function jumpLine(state: UiState, line: number): UiState {
  const newCursor = Math.min(line - 1, state.commits.length - 1)
  const newOffset = Math.max(0, newCursor - Math.floor(state.termHeight / 2))

  return clearSelections({
    ...state,
    cursorIndex: Math.max(0, newCursor),
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
  })
}

function expand(state: UiState): UiState {
  return {
    ...clearSelections(state),
    expandedIndex: state.cursorIndex,
    fileCursorIndex: null,
  }
}

function fold(state: UiState): UiState {
  return {
    ...clearSelections(state),
    expandedIndex: null,
    fileCursorIndex: null,
  }
}

function toggleExpand(state: UiState): UiState {
  if (state.expandedIndex === state.cursorIndex) {
    return {
      ...clearSelections(state),
      expandedIndex: null,
      fileCursorIndex: null,
    }
  }
  return {
    ...clearSelections(state),
    expandedIndex: state.cursorIndex,
    fileCursorIndex: null,
  }
}

function resize(state: UiState, height: number, width: number): UiState {
  const newOffset = clampScroll(
    state.cursorIndex,
    height,
    state.scrollOffset,
  )

  return {
    ...state,
    termHeight: height,
    termWidth: width,
    scrollOffset: newOffset,
  }
}

function enterFileCursor(state: UiState): UiState {
  if (state.expandedIndex === state.cursorIndex) {
    const expandedCommit = state.commits[state.expandedIndex]
    const files = expandedCommit?.files

    if (files != null && files.length > 0) {
      return { ...state, fileCursorIndex: 0 }
    }

    return state
  }

  const commitToExpand = state.commits[state.cursorIndex]
  const alreadyLoaded = commitToExpand?.files != null && commitToExpand.files.length > 0

  return {
    ...state,
    expandedIndex: state.cursorIndex,
    fileCursorIndex: alreadyLoaded ? 0 : null,
  }
}

function exitFileCursor(state: UiState): UiState {
  if (state.fileCursorIndex !== null) {
    return clearSelections({ ...state, fileCursorIndex: null })
  }
  return clearSelections({ ...state, expandedIndex: null })
}

function commitsLoaded(
  state: UiState,
  newCommits: Commit[],
  total: number,
  hasMore: boolean,
): UiState {
  return {
    ...state,
    commits: [...state.commits, ...newCommits],
    totalCommits: total,
    hasMore,
  }
}

function detailLoaded(
  state: UiState,
  index: number,
  body: string,
  files: FileStat[],
): UiState {
  const commits = state.commits.map((commit, i) => {
    if (i !== index) {
      return commit
    }
    return { ...commit, body, files }
  })

  return { ...state, commits }
}

function clampScroll(
  cursorIndex: number,
  termHeight: number,
  currentOffset: number,
): number {
  if (cursorIndex < currentOffset) {
    return cursorIndex
  }
  if (cursorIndex >= currentOffset + termHeight) {
    return cursorIndex - termHeight + 1
  }
  return currentOffset
}

export function formatBranches(branches: string[] | undefined): string {
  if (branches === undefined || branches.length === 0) {
    return ''
  }
  return `<${branches.join(', ')}>`
}

function computeBranchColWidth(branchTips: Map<string, string[]>): number {
  let maxWidth = 0

  for (const branches of branchTips.values()) {
    const text = formatBranches(branches)
    if (text.length > maxWidth) {
      maxWidth = text.length
    }
  }

  return Math.max(1, maxWidth)
}

function clearSelections(state: UiState): UiState {
  return { ...state, selectedFiles: new Set(), selectionUndoStack: [], selectionRedoStack: [] }
}

function toggleMark(state: UiState): UiState {
  if (state.fileCursorIndex === null) {
    return state
  }

  const newSelected = new Set(state.selectedFiles)
  const index = state.fileCursorIndex

  if (newSelected.has(index)) {
    newSelected.delete(index)
  } else {
    newSelected.add(index)
  }

  return {
    ...state,
    selectedFiles: newSelected,
    selectionUndoStack: [...state.selectionUndoStack, { index }],
    selectionRedoStack: [],
  }
}

function undoMark(state: UiState): UiState {
  if (state.fileCursorIndex === null || state.selectionUndoStack.length === 0) {
    return state
  }

  const newUndo = [...state.selectionUndoStack]
  const lastAction = newUndo.pop()
  if (lastAction === undefined) {
    return state
  }

  const newSelected = new Set(state.selectedFiles)
  if (newSelected.has(lastAction.index)) {
    newSelected.delete(lastAction.index)
  } else {
    newSelected.add(lastAction.index)
  }

  return {
    ...state,
    selectedFiles: newSelected,
    selectionUndoStack: newUndo,
    selectionRedoStack: [...state.selectionRedoStack, lastAction],
    fileCursorIndex: lastAction.index,
  }
}

function redoMark(state: UiState): UiState {
  if (state.fileCursorIndex === null || state.selectionRedoStack.length === 0) {
    return state
  }

  const newRedo = [...state.selectionRedoStack]
  const lastAction = newRedo.pop()
  if (lastAction === undefined) {
    return state
  }

  const newSelected = new Set(state.selectedFiles)
  if (newSelected.has(lastAction.index)) {
    newSelected.delete(lastAction.index)
  } else {
    newSelected.add(lastAction.index)
  }

  return {
    ...state,
    selectedFiles: newSelected,
    selectionUndoStack: [...state.selectionUndoStack, lastAction],
    selectionRedoStack: newRedo,
    fileCursorIndex: lastAction.index,
  }
}

function moveRel(state: UiState, direction: 'down' | 'up', count: number): UiState {
  if (state.fileCursorIndex !== null && state.expandedIndex !== null) {
    const expandedCommit = state.commits[state.expandedIndex]
    const files = expandedCommit?.files

    if (files != null && files.length > 0) {
      const delta = direction === 'down' ? count : -count
      const lastIndex = files.length - 1
      const newFileCursor = Math.max(0, Math.min(lastIndex, state.fileCursorIndex + delta))

      if (newFileCursor !== state.fileCursorIndex) {
        return { ...state, fileCursorIndex: newFileCursor }
      }

      if (direction === 'down' && state.fileCursorIndex >= lastIndex) {
        return moveRel(
          clearSelections({ ...state, fileCursorIndex: null, expandedIndex: null }),
          'down',
          1,
        )
      }

      if (direction === 'up' && state.fileCursorIndex <= 0) {
        return clearSelections({ ...state, fileCursorIndex: null })
      }
    }

    return state
  }

  const raw = { ...state, expandedIndex: null }
  const delta = direction === 'down' ? count : -count
  const newCursor = Math.max(0, Math.min(raw.commits.length - 1, raw.cursorIndex + delta))

  let newOffset = raw.scrollOffset

  if (newCursor < raw.scrollOffset) {
    newOffset = newCursor
  } else if (newCursor >= raw.scrollOffset + raw.termHeight) {
    newOffset = newCursor - raw.termHeight + 1
  }

  return {
    ...raw,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
  }
}
