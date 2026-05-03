import type { Commit, FileStat } from './git.js'

export type ExpandedMatch =
  | { type: 'subject' }
  | { type: 'body'; line: number }
  | { type: 'file'; index: number }

export type SearchScope = 'list' | 'expanded'

export type SearchState = {
  scope: SearchScope
  query: string | null
  prompt: string
  inputMode: boolean
  direction: 'forward' | 'backward'
  listMatches: number[]
  expandedMatches: ExpandedMatch[]
  activeIndex: number
  highlightsVisible: boolean
  loadingAll: boolean
}

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
  marks: Record<string, string>
  jumpStack: number[]
  jumpForwardStack: number[]
  search: SearchState
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
  | { type: 'set-mark'; letter: string }
  | { type: 'jump-to-mark'; letter: string }
  | { type: 'jump-previous' }
  | { type: 'jump-back' }
  | { type: 'jump-forward' }
  | { type: 'jump-to-branch-next' }
  | { type: 'jump-to-branch-prev' }
  | { type: 'jump-to-master' }
  | { type: 'search-start'; direction: 'forward' | 'backward' }
  | { type: 'search-input'; char: string | null }
  | { type: 'search-confirm' }
  | { type: 'search-cancel' }
  | { type: 'search-next' }
  | { type: 'search-prev' }
  | { type: 'search-clear-highlights' }
  | { type: 'search-load-complete' }

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
    marks: {},
    jumpStack: [],
    jumpForwardStack: [],
    search: emptySearch(),
  }
}

function emptySearch(): SearchState {
  return {
    scope: 'list',
    query: null,
    prompt: '',
    inputMode: false,
    direction: 'forward',
    listMatches: [],
    expandedMatches: [],
    activeIndex: -1,
    highlightsVisible: true,
    loadingAll: false,
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
    case 'set-mark':
      return setMark(state, action.letter)
    case 'jump-to-mark':
      return jumpToMark(state, action.letter)
    case 'jump-previous':
      return jumpPrevious(state)
    case 'jump-back':
      return jumpBack(state)
    case 'jump-forward':
      return jumpForward(state)
    case 'jump-to-branch-next':
      return jumpToBranchNext(state)
    case 'jump-to-branch-prev':
      return jumpToBranchPrev(state)
    case 'jump-to-master':
      return jumpToMaster(state)
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
    case 'search-start':
      return searchStart(state, action.direction)
    case 'search-input':
      return searchInput(state, action.char)
    case 'search-confirm':
      return searchConfirm(state)
    case 'search-cancel':
      return searchCancel(state)
    case 'search-next':
      return searchNext(state)
    case 'search-prev':
      return searchPrev(state)
    case 'search-clear-highlights':
      return searchClearHighlights(state)
    case 'search-load-complete':
      return searchLoadComplete(state)
  }
}

function isInBodyMatch(state: UiState): boolean {
  const s = state.search
  if (s.scope !== 'expanded' || !s.highlightsVisible || s.query === null) return false
  const match = s.expandedMatches[s.activeIndex]
  return match?.type === 'body'
}

function moveDown(state: UiState): UiState {
  if (isInBodyMatch(state)) {
    const expandedCommit = state.commits[state.expandedIndex!]
    const files = expandedCommit?.files
    if (files != null && files.length > 0) {
      return { ...state, fileCursorIndex: 0 }
    }

    return moveDown({ ...state, expandedIndex: null, search: clearSearch() })
  }

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
    search: preserveListSearch(state.search),
  }
}

function moveUp(state: UiState): UiState {
  if (isInBodyMatch(state)) {
    const s = state.search
    const subjectIdx = s.expandedMatches.findIndex(m => m.type === 'subject')
    if (subjectIdx !== -1) {
      return clearSelections({
        ...state,
        fileCursorIndex: null,
        search: { ...s, activeIndex: subjectIdx, highlightsVisible: true },
      })
    }
    return clearSelections({ ...state, fileCursorIndex: null })
  }

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
    search: preserveListSearch(state.search),
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
    search: preserveListSearch(state.search),
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
    search: preserveListSearch(state.search),
  })
}

function jumpTop(state: UiState): UiState {
  if (state.cursorIndex === 0) return state

  return clearSelections({
    ...state,
    cursorIndex: 0,
    scrollOffset: 0,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    jumpStack: [...state.jumpStack, state.cursorIndex],
    jumpForwardStack: [],
  })
}

function jumpBottom(state: UiState): UiState {
  const newCursor = state.commits.length - 1
  if (state.cursorIndex === newCursor) return state

  const newOffset = Math.max(0, newCursor - state.termHeight + 1)

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    jumpStack: [...state.jumpStack, state.cursorIndex],
    jumpForwardStack: [],
  })
}

function jumpLine(state: UiState, line: number): UiState {
  const newCursor = Math.max(0, Math.min(line - 1, state.commits.length - 1))
  if (state.cursorIndex === newCursor) return state

  const newOffset = Math.max(0, newCursor - Math.floor(state.termHeight / 2))

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    jumpStack: [...state.jumpStack, state.cursorIndex],
    jumpForwardStack: [],
  })
}

function expand(state: UiState): UiState {
  return {
    ...clearSelections(state),
    expandedIndex: state.cursorIndex,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
  }
}

function fold(state: UiState): UiState {
  return {
    ...clearSelections(state),
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
  }
}

function toggleExpand(state: UiState): UiState {
  if (state.expandedIndex === state.cursorIndex) {
    return {
      ...clearSelections(state),
      expandedIndex: null,
      fileCursorIndex: null,
      search: preserveListSearch(state.search),
    }
  }
  return {
    ...clearSelections(state),
    expandedIndex: state.cursorIndex,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
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
  if (isInBodyMatch(state)) {
    const expandedCommit = state.commits[state.expandedIndex!]
    const files = expandedCommit?.files
    if (files != null && files.length > 0) {
      return { ...state, fileCursorIndex: 0 }
    }
    return state
  }

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
    search: preserveListSearch(state.search),
  }
}

function exitFileCursor(state: UiState): UiState {
  if (state.fileCursorIndex !== null) {
    return clearSelections({ ...state, fileCursorIndex: null })
  }
  return clearSelections({ ...state, expandedIndex: null, search: preserveListSearch(state.search) })
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

function clearSearch(): SearchState {
  return emptySearch()
}

function preserveListSearch(search: SearchState): SearchState {
  return search.scope === 'list' ? search : clearSearch()
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
  if (isInBodyMatch(state)) {
    return direction === 'down' ? moveDown(state) : moveUp(state)
  }

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

function setMark(state: UiState, letter: string): UiState {
  if (state.fileCursorIndex !== null) return state

  const commit = state.commits[state.cursorIndex]
  if (commit === undefined) return state

  return {
    ...state,
    marks: { ...state.marks, [letter]: commit.fullSha },
  }
}

function jumpToMark(state: UiState, letter: string): UiState {
  const targetSha = state.marks[letter]
  if (targetSha === undefined) return state

  const targetIndex = state.commits.findIndex((c) => c.fullSha === targetSha)
  if (targetIndex === -1 || targetIndex === state.cursorIndex) return state

  return applyJump(state, targetIndex)
}

function jumpPrevious(state: UiState): UiState {
  if (state.jumpStack.length === 0) return state

  const newStack = [...state.jumpStack]
  const targetIndex = newStack.pop()
  if (targetIndex === undefined || targetIndex === state.cursorIndex) return state

  const newOffset = Math.max(0, targetIndex - Math.floor(state.termHeight / 2))

  return clearSelections({
    ...state,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    jumpStack: [...newStack, state.cursorIndex],
  })
}

function jumpBack(state: UiState): UiState {
  if (state.jumpStack.length === 0) return state

  const newStack = [...state.jumpStack]
  const targetIndex = newStack.pop()
  if (targetIndex === undefined) return state

  const newOffset = Math.max(0, targetIndex - Math.floor(state.termHeight / 2))

  return clearSelections({
    ...state,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    jumpStack: newStack,
    jumpForwardStack: [...state.jumpForwardStack, state.cursorIndex],
  })
}

function jumpForward(state: UiState): UiState {
  if (state.jumpForwardStack.length === 0) return state

  const newForward = [...state.jumpForwardStack]
  const targetIndex = newForward.pop()
  if (targetIndex === undefined) return state

  const newOffset = Math.max(0, targetIndex - Math.floor(state.termHeight / 2))

  return clearSelections({
    ...state,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    jumpStack: [...state.jumpStack, state.cursorIndex],
    jumpForwardStack: [],
  })
}

export function parseCaseFlags(query: string): { pattern: string; ignoreCase: boolean; searchAll: boolean } {
  let ignoreCase: boolean | null = null
  let searchAll = false
  let searchPart = query

  for (let i = query.length - 1; i >= 0; i--) {
    if (query[i] === '/' && (i === 0 || query[i - 1] !== '\\')) {
      const flagPart = query.slice(i + 1)
      if (flagPart === '!') {
        searchAll = true
        searchPart = query.slice(0, i)
      }
      break
    }
  }

  searchPart = searchPart.replace(/\\\//g, '/')

  searchPart = searchPart.replace(/\\c/g, () => {
    ignoreCase = true
    return ''
  })
  searchPart = searchPart.replace(/\\C/g, () => {
    ignoreCase = false
    return ''
  })

  if (ignoreCase === null) {
    ignoreCase = searchPart === searchPart.toLowerCase()
  }

  return { pattern: searchPart, ignoreCase, searchAll }
}

function matchesText(text: string, pattern: string, ignoreCase: boolean): boolean {
  if (ignoreCase) {
    return text.toLowerCase().includes(pattern.toLowerCase())
  }
  return text.includes(pattern)
}

function computeListMatches(
  commits: Commit[],
  pattern: string,
  ignoreCase: boolean,
  branchTips: Map<string, string[]>,
): number[] {
  const result: number[] = []

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    if (commit === undefined) continue

    if (matchesText(commit.shortSha, pattern, ignoreCase)) { result.push(i); continue }
    if (matchesText(commit.fullSha, pattern, ignoreCase)) { result.push(i); continue }
    if (matchesText(commit.message, pattern, ignoreCase)) { result.push(i); continue }

    const branches = branchTips.get(commit.shortSha)
    if (branches !== undefined) {
      for (let bi = 0; bi < branches.length; bi++) {
        const branch = branches[bi]
        if (branch !== undefined && matchesText(branch, pattern, ignoreCase)) {
          result.push(i)
          break
        }
      }
    }
  }

  return result
}

function computeExpandedMatches(
  commit: Commit,
  pattern: string,
  ignoreCase: boolean,
): ExpandedMatch[] {
  const result: ExpandedMatch[] = []

  if (matchesText(commit.message, pattern, ignoreCase)) {
    result.push({ type: 'subject' })
  }

  if (commit.body !== null) {
    const bodyLines = commit.body.split('\n')
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i]
      if (line !== undefined && matchesText(line, pattern, ignoreCase)) {
        result.push({ type: 'body', line: i })
      }
    }
  }

  if (commit.files !== null) {
    for (let i = 0; i < commit.files.length; i++) {
      const file = commit.files[i]
      if (file !== undefined && matchesText(file.path, pattern, ignoreCase)) {
        result.push({ type: 'file', index: i })
      }
    }
  }

  return result
}

function searchStart(state: UiState, direction: 'forward' | 'backward'): UiState {
  const scope: SearchScope = state.expandedIndex !== null ? 'expanded' : 'list'

  return {
    ...state,
    search: {
      ...emptySearch(),
      scope,
      inputMode: true,
      direction,
    },
  }
}

function searchInput(state: UiState, char: string | null): UiState {
  let newPrompt = state.search.prompt

  if (char === null) {
    newPrompt = newPrompt.slice(0, -1)
  } else {
    newPrompt += char
  }

  if (newPrompt === '') {
    return { ...state, search: { ...state.search, prompt: '', listMatches: [], expandedMatches: [] } }
  }

  const { pattern, ignoreCase } = parseCaseFlags(newPrompt)

  if (state.search.scope === 'list') {
    const listMatches = computeListMatches(state.commits, pattern, ignoreCase, state.branchTips)
    return { ...state, search: { ...state.search, prompt: newPrompt, listMatches } }
  }

  if (state.expandedIndex !== null) {
    const commit = state.commits[state.expandedIndex]
    if (commit !== undefined) {
      const expandedMatches = computeExpandedMatches(commit, pattern, ignoreCase)
      return { ...state, search: { ...state.search, prompt: newPrompt, expandedMatches } }
    }
  }

  return { ...state, search: { ...state.search, prompt: newPrompt } }
}

function searchConfirm(state: UiState): UiState {
  const s = state.search

  if (s.prompt === '') {
    return { ...state, search: { ...emptySearch() } }
  }

  const { searchAll } = parseCaseFlags(s.prompt)
  const query = s.prompt

  if (s.scope === 'list' && searchAll && state.hasMore) {
    return {
      ...state,
      search: {
        ...s,
        query,
        inputMode: false,
        highlightsVisible: true,
        loadingAll: true,
      },
    }
  }

  const { pattern, ignoreCase } = parseCaseFlags(s.prompt)

  if (s.scope === 'list') {
    const matches = s.listMatches
    if (matches.length > 0) {
      const activeIndex = resolveListActiveIndex(matches, state.cursorIndex, s.direction)
      const targetIndex = matches[activeIndex]

      if (targetIndex !== undefined) {
        const newOffset = targetIndex < state.scrollOffset || targetIndex >= state.scrollOffset + state.termHeight
          ? targetIndex
          : state.scrollOffset

        return {
          ...state,
          cursorIndex: targetIndex,
          scrollOffset: newOffset,
          expandedIndex: null,
          search: { ...s, query, inputMode: false, activeIndex, highlightsVisible: true },
          jumpStack: [...state.jumpStack, state.cursorIndex],
          jumpForwardStack: [],
        }
      }
    }

    return { ...state, search: { ...s, query, inputMode: false, highlightsVisible: true, activeIndex: -1 } }
  }

  const matches = s.expandedMatches
  if (matches.length > 0) {
    const activeIndex = resolveExpandedStartIndex(matches, state.fileCursorIndex, s.direction)

    return {
      ...state,
      search: { ...s, query, inputMode: false, activeIndex, highlightsVisible: true },
      fileCursorIndex: applyExpandedMatchFileCursor(matches, activeIndex, state.fileCursorIndex),
    }
  }

  return { ...state, search: { ...s, query, inputMode: false, activeIndex: -1, highlightsVisible: true } }
}

function searchCancel(state: UiState): UiState {
  if (state.search.query === null) {
    return { ...state, search: { ...emptySearch() } }
  }

  return { ...state, search: { ...state.search, inputMode: false, prompt: '' } }
}

function exitFileCursorIfSubjectMatch(
  state: UiState,
  matches: number[],
  goingUp: boolean,
): UiState | null {
  if (!goingUp) return null
  if (state.expandedIndex === null || state.fileCursorIndex === null) return null

  const matchIdx = matches.indexOf(state.expandedIndex)
  if (matchIdx === -1) return null

  return {
    ...state,
    fileCursorIndex: null,
    search: { ...state.search, listMatches: matches, activeIndex: matchIdx, highlightsVisible: true },
  }
}

function searchNext(state: UiState): UiState {
  const s = state.search
  if (s.query === null || s.inputMode) return state

  const { pattern, ignoreCase } = parseCaseFlags(s.query)

  if (s.scope === 'list') {
    const matches = s.listMatches.length > 0 ? s.listMatches : computeListMatches(state.commits, pattern, ignoreCase, state.branchTips)
    if (matches.length === 0) return state

    const goingUp = s.direction === 'backward'
    const landed = exitFileCursorIfSubjectMatch(state, matches, goingUp)
    if (landed !== null) return landed

    const activeIndex = resolveListActiveIndex(matches, state.cursorIndex, s.direction)
    const targetIndex = matches[activeIndex]

    if (targetIndex === undefined) return state

    const newOffset = targetIndex < state.scrollOffset || targetIndex >= state.scrollOffset + state.termHeight
      ? targetIndex
      : state.scrollOffset

    return {
      ...state,
      cursorIndex: targetIndex,
      scrollOffset: newOffset,
      expandedIndex: null,
      fileCursorIndex: null,
      search: { ...s, listMatches: matches, activeIndex, highlightsVisible: true },
      jumpStack: [...state.jumpStack, state.cursorIndex],
      jumpForwardStack: [],
    }
  }

  if (s.scope === 'expanded') {
    const matches = s.expandedMatches
    if (matches.length === 0) return state

    const nextIndex = resolveExpandedNextIndex(matches, s.activeIndex, s.direction)
    return {
      ...state,
      search: { ...s, activeIndex: nextIndex, highlightsVisible: true },
      fileCursorIndex: applyExpandedMatchFileCursor(matches, nextIndex, state.fileCursorIndex),
    }
  }

  return state
}

function searchPrev(state: UiState): UiState {
  const s = state.search
  if (s.query === null || s.inputMode) return state

  const { pattern, ignoreCase } = parseCaseFlags(s.query)
  const reverseDir = s.direction === 'forward' ? 'backward' : 'forward'

  if (s.scope === 'list') {
    const matches = s.listMatches.length > 0 ? s.listMatches : computeListMatches(state.commits, pattern, ignoreCase, state.branchTips)
    if (matches.length === 0) return state

    const goingUp = reverseDir === 'backward'
    const landed = exitFileCursorIfSubjectMatch(state, matches, goingUp)
    if (landed !== null) return landed

    const activeIndex = resolveListActiveIndex(matches, state.cursorIndex, reverseDir)
    const targetIndex = matches[activeIndex]

    if (targetIndex === undefined) return state

    const newOffset = targetIndex < state.scrollOffset || targetIndex >= state.scrollOffset + state.termHeight
      ? targetIndex
      : state.scrollOffset

    return {
      ...state,
      cursorIndex: targetIndex,
      scrollOffset: newOffset,
      expandedIndex: null,
      fileCursorIndex: null,
      search: { ...s, listMatches: matches, activeIndex, highlightsVisible: true },
      jumpStack: [...state.jumpStack, state.cursorIndex],
      jumpForwardStack: [],
    }
  }

  if (s.scope === 'expanded') {
    const matches = s.expandedMatches
    if (matches.length === 0) return state

    const prevIndex = resolveExpandedNextIndex(matches, s.activeIndex, reverseDir)
    return {
      ...state,
      search: { ...s, activeIndex: prevIndex, highlightsVisible: true },
      fileCursorIndex: applyExpandedMatchFileCursor(matches, prevIndex, state.fileCursorIndex),
    }
  }

  return state
}

function searchClearHighlights(state: UiState): UiState {
  if (state.search.query === null) return state

  return {
    ...state,
    search: { ...state.search, highlightsVisible: false },
  }
}

function searchLoadComplete(state: UiState): UiState {
  const s = state.search

  if (s.query === null) return state

  const { pattern, ignoreCase } = parseCaseFlags(s.query)
  const matches = computeListMatches(state.commits, pattern, ignoreCase, state.branchTips)

  if (matches.length > 0) {
    const activeIndex = resolveListActiveIndex(matches, state.cursorIndex, s.direction)
    const targetIndex = matches[activeIndex]

    if (targetIndex !== undefined) {
      const newOffset = targetIndex < state.scrollOffset || targetIndex >= state.scrollOffset + state.termHeight
        ? targetIndex
        : state.scrollOffset

      return {
        ...state,
        cursorIndex: targetIndex,
        scrollOffset: newOffset,
        expandedIndex: null,
        search: { ...s, listMatches: matches, activeIndex, highlightsVisible: true, loadingAll: false },
        jumpStack: [...state.jumpStack, state.cursorIndex],
        jumpForwardStack: [],
      }
    }
  }

  return {
    ...state,
    search: { ...s, listMatches: matches, activeIndex: -1, highlightsVisible: true, loadingAll: false },
  }
}

function resolveListActiveIndex(
  matches: number[],
  cursorIndex: number,
  direction: 'forward' | 'backward',
): number {
  if (direction === 'forward') {
    for (let i = 0; i < matches.length; i++) {
      const mi = matches[i]
      if (mi !== undefined && mi > cursorIndex) return i
    }
    return 0
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const mi = matches[i]
    if (mi !== undefined && mi < cursorIndex) return i
  }
  return matches.length - 1
}

function resolveExpandedStartIndex(
  matches: ExpandedMatch[],
  fileCursorIndex: number | null,
  direction: 'forward' | 'backward',
): number {
  if (fileCursorIndex !== null) {
    if (direction === 'forward') {
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i]
        if (m !== undefined && isExpandedMatchAfterIndex(m, fileCursorIndex)) return i
      }
      return 0
    }

    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i]
      if (m !== undefined && isExpandedMatchBeforeIndex(m, fileCursorIndex)) return i
    }
    return matches.length - 1
  }

  return 0
}

function resolveExpandedNextIndex(
  matches: ExpandedMatch[],
  currentActive: number,
  direction: 'forward' | 'backward',
): number {
  if (direction === 'forward') {
    const next = currentActive + 1
    return next >= matches.length ? 0 : next
  }

  const prev = currentActive - 1
  return prev < 0 ? matches.length - 1 : prev
}

function isExpandedMatchBeforeIndex(match: ExpandedMatch, fileCursorIndex: number): boolean {
  if (match.type === 'subject') return true
  if (match.type === 'body') return true
  if (match.type === 'file') return match.index < fileCursorIndex
  return false
}

function isExpandedMatchAfterIndex(match: ExpandedMatch, fileCursorIndex: number): boolean {
  if (match.type === 'file') return match.index > fileCursorIndex
  return false
}

function applyExpandedMatchFileCursor(
  matches: ExpandedMatch[],
  activeIndex: number,
  currentFileCursor: number | null,
): number | null {
  const match = matches[activeIndex]
  if (match === undefined) return currentFileCursor
  if (match.type === 'file') return match.index
  return null
}

function jumpToBranchNext(state: UiState): UiState {
  for (let i = state.cursorIndex + 1; i < state.commits.length; i++) {
    const commit = state.commits[i]
    if (commit !== undefined && state.branchTips.has(commit.shortSha)) {
      return applyJump(state, i)
    }
  }
  return state
}

function jumpToBranchPrev(state: UiState): UiState {
  for (let i = state.cursorIndex - 1; i >= 0; i--) {
    const commit = state.commits[i]
    if (commit !== undefined && state.branchTips.has(commit.shortSha)) {
      return applyJump(state, i)
    }
  }
  return state
}

function jumpToMaster(state: UiState): UiState {
  let targetSha: string | null = null

  for (const [sha, branches] of state.branchTips) {
    if (branches.includes('master') || branches.includes('main')) {
      targetSha = sha
      break
    }
  }

  if (targetSha === null) return state

  const targetIndex = state.commits.findIndex((c) => c.shortSha === targetSha)
  if (targetIndex === -1 || targetIndex === state.cursorIndex) return state

  return applyJump(state, targetIndex)
}

function applyJump(state: UiState, targetIndex: number): UiState {
  const newOffset = Math.max(0, targetIndex - Math.floor(state.termHeight / 2))

  return clearSelections({
    ...state,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    jumpStack: [...state.jumpStack, state.cursorIndex],
    jumpForwardStack: [],
  })
}
