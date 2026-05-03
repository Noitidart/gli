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
): UiState {
  return {
    commits,
    cursorIndex: 0,
    scrollOffset: 0,
    expandedIndex: null,
    termHeight,
    termWidth,
    hasMore,
    totalCommits,
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
  const newCursor = Math.min(
    state.cursorIndex + state.termHeight,
    state.commits.length - 1,
  )
  const newOffset = Math.max(0, newCursor - state.termHeight + 1)

  return {
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
  }
}

function pageUp(state: UiState): UiState {
  const newCursor = Math.max(
    state.cursorIndex - state.termHeight,
    0,
  )
  const newOffset = Math.max(newCursor, 0)

  return {
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
  }
}

function jumpTop(state: UiState): UiState {
  return {
    ...state,
    cursorIndex: 0,
    scrollOffset: 0,
    expandedIndex: null,
  }
}

function jumpBottom(state: UiState): UiState {
  const newCursor = state.commits.length - 1
  const newOffset = Math.max(0, newCursor - state.termHeight + 1)

  return {
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
  }
}

function jumpLine(state: UiState, line: number): UiState {
  const newCursor = Math.min(line - 1, state.commits.length - 1)
  const newOffset = Math.max(0, newCursor - Math.floor(state.termHeight / 2))

  return {
    ...state,
    cursorIndex: Math.max(0, newCursor),
    scrollOffset: newOffset,
    expandedIndex: null,
  }
}

function expand(state: UiState): UiState {
  return {
    ...state,
    expandedIndex: state.cursorIndex,
  }
}

function fold(state: UiState): UiState {
  return {
    ...state,
    expandedIndex: null,
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
