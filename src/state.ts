import type { Commit } from './git.js'

export function wordWrap(text: string, maxLen: number): string[] {
  if (text.length === 0) return ['']
  if (text.length <= maxLen) return [text]

  const lines: string[] = []
  let currentLine = ''
  let i = 0
  const len = text.length

  while (i < len) {
    while (i < len && text[i] === ' ') i++
    if (i >= len) break

    const wordStart = i
    while (i < len && text[i] !== ' ') i++
    const word = text.slice(wordStart, i)

    if (currentLine.length === 0) {
      currentLine = word
    } else if (currentLine.length + 1 + word.length <= maxLen) {
      currentLine += ' ' + word
    } else {
      lines.push(currentLine)
      currentLine = word
    }
  }

  if (currentLine.length > 0 || lines.length === 0) {
    lines.push(currentLine)
  }

  return lines
}

function getMaxMsgLen(state: UiState): number {
  const maxLineNum = state.scrollOffset + state.termHeight
  const numWidth = Math.max(3, String(maxLineNum).length)
  const shaWidth = 7
  const overhead = 2 * numWidth + shaWidth + state.branchColWidth + 12
  return state.termWidth - overhead
}

function commitDisplayHeight(
  commits: Commit[],
  index: number,
  maxMsgLen: number,
  branchTips: Map<string, string[]>,
  branchWidth: number,
): number {
  const commit = commits[index]
  if (commit === undefined) return 1

  const branchNames = branchTips.get(commit.shortSha)
  const branchLines = branchNames !== undefined && branchNames.length > 0
    ? wrapBranches(branchNames, branchWidth)
    : ['']

  const subjectLines = maxMsgLen > 0 ? wordWrap(commit.message, maxMsgLen).length : 1

  return branchLines.length + subjectLines - 1
}

function clampScrollOffset(state: UiState, cursorIndex: number): number {
  if (cursorIndex < state.scrollOffset) return cursorIndex

  const maxMsgLen = getMaxMsgLen(state)
  const { commits, termHeight, scrollOffset, branchTips, branchColWidth } = state

  let displayLines = 0
  for (let i = scrollOffset; i <= cursorIndex && i < commits.length; i++) {
    displayLines += commitDisplayHeight(commits, i, maxMsgLen, branchTips, branchColWidth)
  }

  if (displayLines <= termHeight) return scrollOffset

  let newOffset = scrollOffset
  let totalLines = displayLines
  while (newOffset < cursorIndex) {
    totalLines -= commitDisplayHeight(commits, newOffset, maxMsgLen, branchTips, branchColWidth)
    newOffset++
    if (totalLines <= termHeight) break
  }

  return newOffset
}

function scrollToTarget(state: UiState, targetIndex: number): number {
  if (targetIndex < state.scrollOffset) return targetIndex

  const maxMsgLen = getMaxMsgLen(state)
  const { commits, termHeight, scrollOffset, branchTips, branchColWidth } = state

  let displayLines = 0
  for (let i = scrollOffset; i <= targetIndex && i < commits.length; i++) {
    displayLines += commitDisplayHeight(commits, i, maxMsgLen, branchTips, branchColWidth)
  }

  if (displayLines <= termHeight) return scrollOffset

  return targetIndex
}

function pageDownNewOffset(state: UiState): number {
  const maxMsgLen = getMaxMsgLen(state)
  const { commits, termHeight, scrollOffset, branchTips, branchColWidth } = state

  let displayLines = 0
  let offset = scrollOffset

  while (offset < commits.length) {
    displayLines += commitDisplayHeight(commits, offset, maxMsgLen, branchTips, branchColWidth)
    offset++
    if (displayLines >= termHeight - 2) break
  }

  return Math.min(offset, Math.max(0, commits.length - 1))
}

function pageUpNewOffset(state: UiState): number {
  const maxMsgLen = getMaxMsgLen(state)
  const { commits, termHeight, scrollOffset, branchTips, branchColWidth } = state

  let displayLines = 0
  let offset = scrollOffset

  while (offset > 0) {
    offset--
    displayLines += commitDisplayHeight(commits, offset, maxMsgLen, branchTips, branchColWidth)
    if (displayLines >= termHeight - 2) break
  }

  return Math.max(0, offset)
}

function jumpCenterOffset(state: UiState, targetIndex: number): number {
  const maxMsgLen = getMaxMsgLen(state)
  const { commits, termHeight, branchTips, branchColWidth } = state
  const halfHeight = Math.floor(termHeight / 2)

  let displayLines = commitDisplayHeight(commits, targetIndex, maxMsgLen, branchTips, branchColWidth)
  let offset = targetIndex

  while (offset > 0 && displayLines < halfHeight) {
    offset--
    displayLines += commitDisplayHeight(commits, offset, maxMsgLen, branchTips, branchColWidth)
  }

  return offset
}

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
  searchBody: boolean
  bodyMatchIndices: Set<number>
  searchFiles: boolean
  fileMatchIndices: Set<number>
  flagError: string | null
  savedScope: SearchScope | null
  searchFrom: ExpandedMatch | null
  originScope: SearchScope | null
  savedOriginScope: SearchScope | null
  expandedMatchCounts: Map<number, number>
  totalMatchCount: number
}

export type UiState = {
  commits: Commit[]
  cursorIndex: number
  scrollOffset: number
  expandedIndex: number | null
  termHeight: number
  termWidth: number
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
  | { type: 'numstat-loaded'; index: number; numstat: Map<string, { added: number; deleted: number }> }
  | { type: 'set-mark'; letter: string }
  | { type: 'jump-to-mark'; letter: string }
  | { type: 'jump-previous' }
  | { type: 'jump-back' }
  | { type: 'jump-forward' }
  | { type: 'jump-to-branch-next' }
  | { type: 'jump-to-branch-prev' }
  | { type: 'search-start'; direction: 'forward' | 'backward' }
  | { type: 'search-input'; char: string | null }
  | { type: 'search-confirm' }
  | { type: 'search-cancel' }
  | { type: 'search-next' }
  | { type: 'search-prev' }
  | { type: 'search-clear-highlights' }

export function createInitialState(
  commits: Commit[],
  termHeight: number,
  termWidth: number,
  branchTips: Map<string, string[]>,
  unpushedShas: Set<string>,
): UiState {
  const branchColWidth = computeBranchColWidth(branchTips, commits)

  return {
    commits,
    cursorIndex: 0,
    scrollOffset: 0,
    expandedIndex: null,
    termHeight: termHeight - 1,
    termWidth,
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
    searchBody: false,
    bodyMatchIndices: new Set(),
    searchFiles: false,
    fileMatchIndices: new Set(),
    flagError: null,
    savedScope: null,
    searchFrom: null,
    originScope: null,
    savedOriginScope: null,
    expandedMatchCounts: new Map(),
    totalMatchCount: 0,
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
    case 'numstat-loaded':
      return numstatLoaded(state, action.index, action.numstat)
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
  }
}

function isInNonNavigable(state: UiState): boolean {
  const s = state.search
  if (s.scope !== 'expanded' || !s.highlightsVisible || s.query === null) return false
  if (state.fileCursorIndex !== null) return false
  const match = s.expandedMatches[s.activeIndex]
  return match?.type === 'body'
}

function isInFileMatch(state: UiState): boolean {
  const s = state.search
  if (s.scope !== 'expanded' || !s.highlightsVisible || s.query === null) return false
  if (state.fileCursorIndex === null) return false
  const match = s.expandedMatches[s.activeIndex]
  return match?.type === 'file'
}

function moveDown(state: UiState): UiState {
  if (isInNonNavigable(state)) {
    const expandedCommit = state.commits[state.expandedIndex!]
    const files = expandedCommit?.files
    if (files != null && files.length > 0) {
      return {
        ...state,
        fileCursorIndex: 0,
        search: { ...state.search, activeIndex: state.search.activeIndex + 1 },
      }
    }

    return moveDown({ ...state, expandedIndex: null, search: preserveListSearch(state.search) })
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
  const newOffset = clampScrollOffset(state, newCursor)

  return {
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: null,
    search: preserveListSearch(state.search),
  }
}

function moveUp(state: UiState): UiState {
  if (isInNonNavigable(state)) {
    return clearSelections({
      ...state,
      fileCursorIndex: null,
      search: { ...state.search, activeIndex: -1 },
    })
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
  const newOffset = clampScrollOffset(state, newCursor)

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

  const maxIndex = state.commits.length - 1
  const newOffset = pageDownNewOffset(state)
  const newCursor = newOffset >= maxIndex ? maxIndex : Math.min(newOffset, maxIndex)

  const keepExpanded = state.expandedIndex === newCursor

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: keepExpanded ? state.expandedIndex : null,
    search: preserveListSearch(state.search),
  })
}

function pageUp(state: UiState): UiState {
  if (state.fileCursorIndex !== null) {
    return pageUp(clearSelections({ ...state, fileCursorIndex: null }))
  }

  const newOffset = pageUpNewOffset(state)
  const newCursor = newOffset
  const keepExpanded = state.expandedIndex === newCursor

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: keepExpanded ? state.expandedIndex : null,
    search: preserveListSearch(state.search),
  })
}

function jumpTop(state: UiState): UiState {
  if (state.cursorIndex === 0 && state.fileCursorIndex === null) return state

  const keepExpanded = state.expandedIndex === 0

  return clearSelections({
    ...state,
    cursorIndex: 0,
    scrollOffset: 0,
    expandedIndex: keepExpanded ? state.expandedIndex : null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    ...withJump(state),
  })
}

function jumpBottom(state: UiState): UiState {
  const newCursor = state.commits.length - 1
  if (state.cursorIndex === newCursor && state.fileCursorIndex === null) {
    return state
  }

  const newOffset = Math.max(0, newCursor - state.termHeight + 1)
  const keepExpanded = state.expandedIndex === newCursor

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: keepExpanded ? state.expandedIndex : null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    ...withJump(state),
  })
}

function jumpLine(state: UiState, line: number): UiState {
  const newCursor = Math.max(0, Math.min(line - 1, state.commits.length - 1))
  if (state.cursorIndex === newCursor && state.fileCursorIndex === null) {
    return state
  }

  const newOffset = Math.max(0, newCursor - Math.floor(state.termHeight / 2))
  const keepExpanded = state.expandedIndex === newCursor

  return clearSelections({
    ...state,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
    expandedIndex: keepExpanded ? state.expandedIndex : null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    ...withJump(state),
  })
}

function restoreBodySearchExpanded(state: UiState, commitIndex: number): UiState {
  const s = state.search
  if (!s.searchBody || !s.highlightsVisible || s.query === null) return state
  if (!s.bodyMatchIndices.has(commitIndex)) return state

  const commit = state.commits[commitIndex]
  if (commit === undefined) return state

  const { pattern, ignoreCase } = parseCaseFlags(s.query)
  const expandedMatches = computeExpandedMatches(commit, pattern, ignoreCase, false)
  if (expandedMatches.length === 0) return state

  return {
    ...state,
    search: {
      ...s,
      scope: 'expanded',
      expandedMatches,
      activeIndex: -1,
    },
  }
}

function restoreFileSearchExpanded(state: UiState, commitIndex: number): UiState {
  const s = state.search
  if (!s.searchFiles || !s.highlightsVisible || s.query === null) return state
  if (!s.fileMatchIndices.has(commitIndex)) return state

  const commit = state.commits[commitIndex]
  if (commit === undefined) return state

  const { pattern, ignoreCase } = parseCaseFlags(s.query)
  const expandedMatches = computeExpandedMatches(commit, pattern, ignoreCase, true)
  if (expandedMatches.length === 0) return state

  return {
    ...state,
    search: {
      ...s,
      scope: 'expanded',
      expandedMatches,
      activeIndex: -1,
    },
  }
}

function expand(state: UiState): UiState {
  const base: UiState = {
    ...clearSelections(state),
    expandedIndex: state.cursorIndex,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
  }

  return restoreFileSearchExpanded(restoreBodySearchExpanded(base, state.cursorIndex), state.cursorIndex)
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
  const base: UiState = {
    ...clearSelections(state),
    expandedIndex: state.cursorIndex,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
  }

  return restoreFileSearchExpanded(restoreBodySearchExpanded(base, state.cursorIndex), state.cursorIndex)
}

function resize(state: UiState, height: number, width: number): UiState {
  const effectiveHeight = height - 1
  const updated = { ...state, termHeight: effectiveHeight, termWidth: width }
  const newOffset = clampScrollOffset(updated, state.cursorIndex)

  return {
    ...updated,
    scrollOffset: newOffset,
  }
}

function enterFileCursor(state: UiState): UiState {
  if (isInNonNavigable(state)) {
    const expandedCommit = state.commits[state.expandedIndex!]
    const files = expandedCommit?.files
    if (files != null && files.length > 0) {
      return { ...state, fileCursorIndex: 0 }
    }
    return state
  }

  if (state.expandedIndex === state.cursorIndex) {
    if (state.fileCursorIndex !== null) {
      return state
    }

    const expandedCommit = state.commits[state.expandedIndex]
    const files = expandedCommit?.files

    if (files != null && files.length > 0) {
      return { ...state, fileCursorIndex: 0 }
    }

    return state
  }

  const commitToExpand = state.commits[state.cursorIndex]
  const alreadyLoaded = commitToExpand !== undefined && commitToExpand.files.length > 0

  const base: UiState = {
    ...state,
    expandedIndex: state.cursorIndex,
    fileCursorIndex: alreadyLoaded ? 0 : null,
    search: preserveListSearch(state.search),
  }

  return restoreFileSearchExpanded(restoreBodySearchExpanded(base, state.cursorIndex), state.cursorIndex)
}

function exitFileCursor(state: UiState): UiState {
  if (state.fileCursorIndex !== null) {
    const s = state.search
    const hasExpandedSearch = s.scope === 'expanded' && s.highlightsVisible

    if (hasExpandedSearch) {
      const hasNonFile = s.expandedMatches.some(m => m.type !== 'file')
      if (hasNonFile) {
        const subjectIdx = s.expandedMatches.findIndex(m => m.type === 'subject')
        return clearSelections({
          ...state,
          fileCursorIndex: null,
          search: { ...s, activeIndex: subjectIdx !== -1 ? subjectIdx : -1 },
        })
      }
      return clearSelections({
        ...state,
        fileCursorIndex: null,
        search: { ...s, activeIndex: -1 },
      })
    }

    return clearSelections({ ...state, fileCursorIndex: null })
  }

  if (state.expandedIndex !== null) {
    const s = state.search
    const hasExpandedSearch = s.scope === 'expanded' && s.highlightsVisible && s.activeIndex >= 0
    if (hasExpandedSearch) {
      const subjectIdx = s.expandedMatches.findIndex(m => m.type === 'subject')
      const onSubject = subjectIdx >= 0 && s.activeIndex === subjectIdx
      if (!onSubject) {
        return clearSelections({
          ...state,
          search: { ...s, activeIndex: subjectIdx >= 0 ? subjectIdx : -1 },
        })
      }
    }

    return clearSelections({
      ...state,
      expandedIndex: null,
      search: s.scope === 'expanded' && s.listMatches.length === 0
        ? clearSearch()
        : preserveListSearch(state.search),
    })
  }
  return state
}

function numstatLoaded(
  state: UiState,
  index: number,
  numstat: Map<string, { added: number; deleted: number }>,
): UiState {
  const commits = state.commits.map((commit, i) => {
    if (i !== index) {
      return commit
    }

    const updatedFiles = commit.files.map((f) => {
      const stat = numstat.get(f.path)
      if (stat !== undefined) {
        return { ...f, added: stat.added, deleted: stat.deleted }
      }
      return f
    })

    return { ...commit, files: updatedFiles, numstatLoaded: true }
  })

  return { ...state, commits }
}

export function formatBranches(branches: string[] | undefined): string {
  if (branches === undefined || branches.length === 0) {
    return ''
  }
  return `<${branches.join(', ')}>`
}

export function wrapBranches(branches: string[], maxWidth: number): string[] {
  if (branches.length === 0) return ['']

  const lines: string[] = []
  let currentLine = ''

  for (const branch of branches) {
    const formatted = `<${branch}>`
    if (currentLine.length === 0) {
      currentLine = formatted
    } else if (currentLine.length + 1 + formatted.length <= maxWidth) {
      currentLine += ' ' + formatted
    } else {
      lines.push(currentLine)
      currentLine = formatted
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines.length > 0 ? lines : ['']
}

function computeBranchColWidth(branchTips: Map<string, string[]>, commits: Commit[]): number {
  let maxWidth = 0
  const shas = new Set(commits.map(c => c.shortSha))

  for (const [sha, branches] of branchTips) {
    if (!shas.has(sha)) continue
    for (const branch of branches) {
      const len = `<${branch}>`.length
      if (len > maxWidth) {
        maxWidth = len
      }
    }
  }

  return Math.max(24, maxWidth)
}

function clearSelections(state: UiState): UiState {
  return { ...state, selectedFiles: new Set(), selectionUndoStack: [], selectionRedoStack: [] }
}

function clearSearch(): SearchState {
  return emptySearch()
}

function preserveListSearch(search: SearchState): SearchState {
  if (search.scope === 'list') return search
  if (search.query !== null) {
    return { ...search, scope: 'list', expandedMatches: [], activeIndex: -1 }
  }
  return clearSearch()
}

function withJump(state: UiState): Partial<UiState> {
  return {
    jumpStack: [...state.jumpStack, state.cursorIndex],
    jumpForwardStack: [],
  }
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
  if (isInNonNavigable(state)) {
    let s = state
    for (let i = 0; i < count; i++) {
      s = direction === 'down' ? moveDown(s) : moveUp(s)
    }
    return s
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
    return clearSelections({
      ...state,
      fileCursorIndex: null,
      search: { ...state.search, activeIndex: -1 },
    })
  }
    }

    return state
  }

  const raw = { ...state, expandedIndex: null }
  const delta = direction === 'down' ? count : -count
  const maxIndex = raw.commits.length - 1
  const newCursor = Math.max(0, Math.min(maxIndex, raw.cursorIndex + delta))

  const newOffset = clampScrollOffset(raw, newCursor)

  return {
    ...raw,
    cursorIndex: newCursor,
    scrollOffset: newOffset,
  }
}

function setMark(state: UiState, letter: string): UiState {
  if (letter === 'm') return state
  if (state.fileCursorIndex !== null) return state

  const commit = state.commits[state.cursorIndex]
  if (commit === undefined) return state

  return {
    ...state,
    marks: { ...state.marks, [letter]: commit.fullSha },
  }
}

function jumpToMark(state: UiState, letter: string): UiState {
  if (letter === 'm') return jumpToMasterMark(state)

  const targetSha = state.marks[letter]
  if (targetSha === undefined) return state

  const targetIndex = state.commits.findIndex((c) => c.fullSha === targetSha)
  if (targetIndex === -1 || targetIndex === state.cursorIndex) return state

  return applyJump(state, targetIndex)
}

function jumpToMasterMark(state: UiState): UiState {
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

function jumpPrevious(state: UiState): UiState {
  if (state.jumpStack.length === 0) return state

  const newStack = [...state.jumpStack]
  const targetIndex = newStack.pop()
  if (targetIndex === undefined || targetIndex === state.cursorIndex) return state

  const newOffset = jumpCenterOffset(state, targetIndex)

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

  const newOffset = jumpCenterOffset(state, targetIndex)

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

  const newOffset = jumpCenterOffset(state, targetIndex)

  return clearSelections({
    ...state,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    ...withJump(state),
  })
}

const FLAG_DELIMITERS = ['/', '#', '_', '@', ',', ';', '-']

function findFlagDelimiter(query: string): { delimiter: string; index: number } | null {
  for (let i = query.length - 1; i >= 0; i--) {
    const ch = query[i]
    if (ch === undefined) continue
    if (FLAG_DELIMITERS.includes(ch) && (i === 0 || query[i - 1] !== '\\')) {
      return { delimiter: ch, index: i }
    }
  }
  return null
}

export function parseCaseFlags(query: string): { pattern: string; ignoreCase: boolean; searchBody: boolean; searchFiles: boolean; flagError: string | null } {
  let ignoreCase: boolean | null = null
  let searchBody = false
  let searchFiles = false
  let flagError: string | null = null
  let searchPart = query

  const validFlags = ['b', 'f']

  const delim = findFlagDelimiter(query)
  if (delim !== null && delim.index > 0) {
    const flagPart = query.slice(delim.index + 1)
    if (validFlags.includes(flagPart)) {
      searchBody = flagPart.includes('b')
      searchFiles = flagPart.includes('f')
      searchPart = query.slice(0, delim.index)
    } else if (/^[!bf]+$/.test(flagPart)) {
      flagError = `Invalid flag combo: /${flagPart}`
      searchPart = query.slice(0, delim.index)
    }
  }

  for (const d of FLAG_DELIMITERS) {
    const escaped = '\\' + d
    searchPart = searchPart.split(escaped).join(d)
  }

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

  return { pattern: searchPart, ignoreCase, searchBody, searchFiles, flagError }
}

function matchesText(text: string, pattern: string, ignoreCase: boolean): boolean {
  if (ignoreCase) {
    return text.toLowerCase().includes(pattern.toLowerCase())
  }
  return text.includes(pattern)
}

type ListMatchResult = { matches: number[]; bodyMatchIndices: Set<number>; fileMatchIndices: Set<number> }

function computeListMatches(
  commits: Commit[],
  pattern: string,
  ignoreCase: boolean,
  branchTips: Map<string, string[]>,
  searchBody: boolean,
  searchFiles: boolean,
): ListMatchResult {
  const result: number[] = []
  const bodyMatchIndices = new Set<number>()
  const fileMatchIndices = new Set<number>()

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    if (commit === undefined) continue

    if (searchFiles) {
      let fileMatch = false
      for (let fi = 0; fi < commit.files.length; fi++) {
        const file = commit.files[fi]
        if (file !== undefined && matchesText(file.path, pattern, ignoreCase)) {
          fileMatch = true
          break
        }
      }

      if (fileMatch) {
        result.push(i)
        fileMatchIndices.add(i)
      }
      continue
    }

    let headerMatch = false

    if (matchesText(commit.shortSha, pattern, ignoreCase)) { headerMatch = true }
    else if (matchesText(commit.fullSha, pattern, ignoreCase)) { headerMatch = true }
    else if (matchesText(commit.message, pattern, ignoreCase)) { headerMatch = true }
    else {
      const branches = branchTips.get(commit.shortSha)
      if (branches !== undefined) {
        for (let bi = 0; bi < branches.length; bi++) {
          const branch = branches[bi]
          if (branch !== undefined && matchesText(branch, pattern, ignoreCase)) {
            headerMatch = true
            break
          }
        }
      }
    }

    let bodyMatch = false
    if (searchBody && commit.body !== null && matchesText(commit.body, pattern, ignoreCase)) {
      bodyMatch = true
    }

    if (headerMatch || bodyMatch) {
      result.push(i)
      if (bodyMatch) {
        bodyMatchIndices.add(i)
      }
    }
  }

  return { matches: result, bodyMatchIndices, fileMatchIndices }
}

function computeExpandedMatches(
  commit: Commit,
  pattern: string,
  ignoreCase: boolean,
  searchFiles: boolean,
): ExpandedMatch[] {
  const result: ExpandedMatch[] = []

  if (!searchFiles && matchesText(commit.message, pattern, ignoreCase)) {
    result.push({ type: 'subject' })
  }

  if (!searchFiles && commit.body !== null) {
    const bodyLines = commit.body.split('\n')
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i]
      if (line !== undefined && matchesText(line, pattern, ignoreCase)) {
        result.push({ type: 'body', line: i })
      }
    }
  }

  for (let i = 0; i < commit.files.length; i++) {
    const file = commit.files[i]
    if (file !== undefined && matchesText(file.path, pattern, ignoreCase)) {
      result.push({ type: 'file', index: i })
    }
  }

  return result
}

function computeExpandedMatchTotals(
  commits: Commit[],
  listMatches: number[],
  bodyMatchIndices: Set<number>,
  fileMatchIndices: Set<number>,
  pattern: string,
  ignoreCase: boolean,
): { expandedMatchCounts: Map<number, number>; totalMatchCount: number } {
  const expandedMatchCounts = new Map<number, number>()

  for (const idx of bodyMatchIndices) {
    const commit = commits[idx]
    if (commit !== undefined) {
      expandedMatchCounts.set(idx, computeExpandedMatches(commit, pattern, ignoreCase, false).length)
    }
  }

  for (const idx of fileMatchIndices) {
    const commit = commits[idx]
    if (commit !== undefined) {
      expandedMatchCounts.set(idx, computeExpandedMatches(commit, pattern, ignoreCase, true).length)
    }
  }

  let totalMatchCount = 0
  for (const idx of listMatches) {
    totalMatchCount += expandedMatchCounts.get(idx) ?? 1
  }

  return { expandedMatchCounts, totalMatchCount }
}

function searchStart(state: UiState, direction: 'forward' | 'backward'): UiState {
  const scope: SearchScope = state.expandedIndex !== null ? 'expanded' : 'list'

  const s = state.search
  let searchFrom: ExpandedMatch | null = null
  if (s.scope === 'expanded' && s.activeIndex >= 0) {
    searchFrom = s.expandedMatches[s.activeIndex] ?? null
  }

  return {
    ...state,
    search: {
      ...s,
      savedScope: s.scope,
      savedOriginScope: s.originScope,
      originScope: scope,
      searchFrom,
      scope,
      inputMode: true,
      direction,
      prompt: '',
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
    return { ...state, search: { ...state.search, prompt: '', listMatches: [], expandedMatches: [], bodyMatchIndices: new Set(), fileMatchIndices: new Set(), flagError: null, expandedMatchCounts: new Map(), totalMatchCount: 0 } }
  }

  const { pattern, ignoreCase, searchBody, searchFiles, flagError } = parseCaseFlags(newPrompt)

  if (state.search.scope === 'list') {
    const { matches: listMatches, bodyMatchIndices, fileMatchIndices } = computeListMatches(state.commits, pattern, ignoreCase, state.branchTips, searchBody, searchFiles)
    return { ...state, search: { ...state.search, prompt: newPrompt, searchBody, searchFiles, flagError, listMatches, bodyMatchIndices, fileMatchIndices } }
  }

  if (state.expandedIndex !== null) {
    return { ...state, search: { ...state.search, prompt: newPrompt, flagError } }
  }

  return { ...state, search: { ...state.search, prompt: newPrompt, flagError } }
}

function navigateToBodyMatch(
  state: UiState,
  targetIndex: number,
  s: SearchState,
  query: string,
  searchBody: boolean,
  pattern: string,
  ignoreCase: boolean,
  direction?: 'forward' | 'backward',
): UiState {
  const commit = state.commits[targetIndex]
  if (commit === undefined) return state

  const newOffset = scrollToTarget(state, targetIndex)

  const expandedMatches = computeExpandedMatches(commit, pattern, ignoreCase, false)
  const activeIndex = resolveExpandedStartIndex(expandedMatches, null, direction ?? s.direction)

  return {
    ...state,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    expandedIndex: targetIndex,
    fileCursorIndex: applyExpandedMatchFileCursor(expandedMatches, activeIndex, null),
    search: {
      ...state.search,
      query,
      searchBody,
      scope: 'expanded',
      expandedMatches,
      activeIndex,
      inputMode: false,
      highlightsVisible: true,
    },
    ...withJump(state),
  }
}

function navigateToFileMatch(
  state: UiState,
  targetIndex: number,
  s: SearchState,
  query: string,
  searchFiles: boolean,
  pattern: string,
  ignoreCase: boolean,
  direction?: 'forward' | 'backward',
): UiState {
  const commit = state.commits[targetIndex]
  if (commit === undefined) return state

  const newOffset = scrollToTarget(state, targetIndex)

  const expandedMatches = computeExpandedMatches(commit, pattern, ignoreCase, searchFiles)
  const activeIndex = resolveExpandedStartIndex(expandedMatches, null, direction ?? s.direction)

  return {
    ...state,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    expandedIndex: targetIndex,
    fileCursorIndex: applyExpandedMatchFileCursor(expandedMatches, activeIndex, null),
    search: {
      ...state.search,
      query,
      searchFiles,
      scope: 'expanded',
      expandedMatches,
      activeIndex,
      inputMode: false,
      highlightsVisible: true,
    },
    ...withJump(state),
  }
}

function searchConfirm(state: UiState): UiState {
  const s = state.search

  if (s.prompt === '') {
    return { ...state, search: { ...emptySearch() } }
  }

  const { searchBody, searchFiles, flagError } = parseCaseFlags(s.prompt)
  if (flagError) {
    return { ...state, search: { ...s, flagError } }
  }
  const query = s.prompt

  const { pattern, ignoreCase } = parseCaseFlags(query)

  if (s.scope === 'list') {
    const matches = s.listMatches
    if (matches.length > 0) {
      const currentMatchIdx = matches.indexOf(state.cursorIndex)
      const activeIndex = currentMatchIdx >= 0 ? currentMatchIdx : resolveListActiveIndex(matches, state.cursorIndex, s.direction)
      const targetIndex = matches[activeIndex]

      const totals = (searchBody || searchFiles)
        ? computeExpandedMatchTotals(state.commits, matches, s.bodyMatchIndices, s.fileMatchIndices, pattern, ignoreCase)
        : { expandedMatchCounts: new Map<number, number>(), totalMatchCount: matches.length }

      if (targetIndex !== undefined) {
        if (searchBody && s.bodyMatchIndices.has(targetIndex)) {
          return navigateToBodyMatch(
            { ...state, search: { ...s, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
            targetIndex, s, query, searchBody, pattern, ignoreCase,
          )
        }

        if (searchFiles && s.fileMatchIndices.has(targetIndex)) {
          return navigateToFileMatch(
            { ...state, search: { ...s, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
            targetIndex, s, query, searchFiles, pattern, ignoreCase,
          )
        }

        const newOffset = targetIndex < state.scrollOffset || targetIndex >= state.scrollOffset + state.termHeight
          ? targetIndex
          : state.scrollOffset

        return {
          ...state,
          cursorIndex: targetIndex,
          scrollOffset: newOffset,
          expandedIndex: null,
          search: { ...s, query, searchBody, searchFiles, inputMode: false, activeIndex, highlightsVisible: true, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount },
          ...withJump(state),
        }
      }
    }

    return { ...state, search: { ...s, query, searchBody, searchFiles, inputMode: false, highlightsVisible: true, activeIndex: -1 } }
  }

  const commit = state.expandedIndex !== null ? state.commits[state.expandedIndex] : undefined
  const matches = commit !== undefined ? computeExpandedMatches(commit, pattern, ignoreCase, searchFiles) : []
  if (matches.length > 0) {
    const activeIndex = resolveExpandedFromPosition(matches, s.searchFrom, s.direction)

    return {
      ...state,
      search: { ...s, query, searchBody, searchFiles, inputMode: false, activeIndex, highlightsVisible: true, expandedMatches: matches, searchFrom: null },
      fileCursorIndex: applyExpandedMatchFileCursor(matches, activeIndex, state.fileCursorIndex),
    }
  }

  return { ...state, search: { ...s, query, searchBody, searchFiles, inputMode: false, activeIndex: -1, highlightsVisible: true, expandedMatches: matches, searchFrom: null } }
}

function searchCancel(state: UiState): UiState {
  if (state.search.query === null) {
    return { ...state, search: { ...emptySearch() } }
  }

  const s = state.search
  if (s.savedScope !== null) {
    const targetScope = s.savedScope
    const { pattern, ignoreCase, searchBody, searchFiles } = parseCaseFlags(s.query!)

    if (targetScope === 'list') {
      const { matches: listMatches, bodyMatchIndices, fileMatchIndices } = computeListMatches(state.commits, pattern, ignoreCase, state.branchTips, searchBody, searchFiles)
      const activeIndex = listMatches.length > 0
        ? resolveListActiveIndex(listMatches, state.cursorIndex, s.direction)
        : -1

      const originScope = s.savedOriginScope ?? 'list'
      const totals = (searchBody || searchFiles)
        ? computeExpandedMatchTotals(state.commits, listMatches, bodyMatchIndices, fileMatchIndices, pattern, ignoreCase)
        : { expandedMatchCounts: new Map<number, number>(), totalMatchCount: listMatches.length }

      return {
        ...state,
        search: {
          ...s,
          savedScope: null,
          savedOriginScope: null,
          originScope,
          searchFrom: null,
          scope: 'list',
          listMatches,
          bodyMatchIndices,
          fileMatchIndices,
          expandedMatches: [],
          activeIndex,
          inputMode: false,
          prompt: '',
          expandedMatchCounts: totals.expandedMatchCounts,
          totalMatchCount: totals.totalMatchCount,
        },
      }
    }

    if (state.expandedIndex !== null) {
      const commit = state.commits[state.expandedIndex]
      if (commit !== undefined) {
        const expandedMatches = computeExpandedMatches(commit, pattern, ignoreCase, searchFiles)
        const activeIndex = expandedMatches.length > 0
          ? resolveExpandedStartIndex(expandedMatches, state.fileCursorIndex, s.direction)
          : -1

        return {
          ...state,
          search: {
            ...s,
            savedScope: null,
            savedOriginScope: null,
            originScope: s.savedOriginScope ?? 'expanded',
            searchFrom: null,
            scope: 'expanded',
            expandedMatches,
            activeIndex,
            inputMode: false,
            prompt: '',
          },
          fileCursorIndex: applyExpandedMatchFileCursor(expandedMatches, activeIndex, state.fileCursorIndex),
        }
      }
    }
  }

  return { ...state, search: { ...state.search, searchFrom: null, inputMode: false, prompt: '' } }
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

function foldAndContinueSearch(
  state: UiState,
  s: SearchState,
  pattern: string,
  ignoreCase: boolean,
  direction: 'forward' | 'backward',
): UiState {
  const foldedState: UiState = {
    ...state,
    expandedIndex: null,
    fileCursorIndex: null,
    search: { ...s, scope: 'list' },
  }

  const needsRecompute = s.listMatches.length === 0
  const listResult = !needsRecompute
    ? { matches: s.listMatches, bodyMatchIndices: s.bodyMatchIndices, fileMatchIndices: s.fileMatchIndices }
    : computeListMatches(foldedState.commits, pattern, ignoreCase, foldedState.branchTips, s.searchBody, s.searchFiles)

  if (listResult.matches.length === 0) return foldedState

  const totals = needsRecompute && (s.searchBody || s.searchFiles)
    ? computeExpandedMatchTotals(foldedState.commits, listResult.matches, listResult.bodyMatchIndices, listResult.fileMatchIndices, pattern, ignoreCase)
    : { expandedMatchCounts: s.expandedMatchCounts, totalMatchCount: s.totalMatchCount }

  const activeIndex = resolveListActiveIndex(listResult.matches, foldedState.cursorIndex, direction)
  const targetIndex = listResult.matches[activeIndex]
  if (targetIndex === undefined) return foldedState

  if (s.searchBody && listResult.bodyMatchIndices.has(targetIndex)) {
    return navigateToBodyMatch(
      { ...foldedState, search: { ...foldedState.search, listMatches: listResult.matches, bodyMatchIndices: listResult.bodyMatchIndices, fileMatchIndices: listResult.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
      targetIndex, { ...s, scope: 'list' }, s.query!, s.searchBody, pattern, ignoreCase, direction,
    )
  }

  if (s.searchFiles && listResult.fileMatchIndices.has(targetIndex)) {
    return navigateToFileMatch(
      { ...foldedState, search: { ...foldedState.search, listMatches: listResult.matches, bodyMatchIndices: listResult.bodyMatchIndices, fileMatchIndices: listResult.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
      targetIndex, { ...s, scope: 'list' }, s.query!, s.searchFiles, pattern, ignoreCase, direction,
    )
  }

  const newOffset = targetIndex < foldedState.scrollOffset || targetIndex >= foldedState.scrollOffset + foldedState.termHeight
    ? targetIndex
    : foldedState.scrollOffset

  return {
    ...foldedState,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    search: { ...foldedState.search, listMatches: listResult.matches, bodyMatchIndices: listResult.bodyMatchIndices, fileMatchIndices: listResult.fileMatchIndices, activeIndex, highlightsVisible: true, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount },
    jumpStack: [...foldedState.jumpStack, foldedState.cursorIndex],
    jumpForwardStack: [],
  }
}

function searchNext(state: UiState): UiState {
  const s = state.search
  if (s.query === null || s.inputMode) return state

  const { pattern, ignoreCase } = parseCaseFlags(s.query)

  if (s.scope === 'list') {
    const needsRecompute = s.listMatches.length === 0
    const result = !needsRecompute
      ? { matches: s.listMatches, bodyMatchIndices: s.bodyMatchIndices, fileMatchIndices: s.fileMatchIndices }
      : computeListMatches(state.commits, pattern, ignoreCase, state.branchTips, s.searchBody, s.searchFiles)
    if (result.matches.length === 0) return state

    const totals = needsRecompute && (s.searchBody || s.searchFiles)
      ? computeExpandedMatchTotals(state.commits, result.matches, result.bodyMatchIndices, result.fileMatchIndices, pattern, ignoreCase)
      : { expandedMatchCounts: s.expandedMatchCounts, totalMatchCount: s.totalMatchCount }

    const goingUp = s.direction === 'backward'
    const landed = exitFileCursorIfSubjectMatch(state, result.matches, goingUp)
    if (landed !== null) return landed

    if (s.searchBody && state.expandedIndex === null && result.bodyMatchIndices.has(state.cursorIndex)) {
      return navigateToBodyMatch(
        { ...state, search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
        state.cursorIndex, s, s.query, s.searchBody, pattern, ignoreCase,
      )
    }

    if (s.searchFiles && state.expandedIndex === null && result.fileMatchIndices.has(state.cursorIndex)) {
      return navigateToFileMatch(
        { ...state, search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
        state.cursorIndex, s, s.query, s.searchFiles, pattern, ignoreCase,
      )
    }

    const activeIndex = resolveListActiveIndex(result.matches, state.cursorIndex, s.direction)
    const targetIndex = result.matches[activeIndex]

    if (targetIndex !== undefined) {
      if (s.searchBody && result.bodyMatchIndices.has(targetIndex)) {
        return navigateToBodyMatch(
          { ...state, search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
          targetIndex, s, s.query, s.searchBody, pattern, ignoreCase,
        )
      }

      if (s.searchFiles && result.fileMatchIndices.has(targetIndex)) {
        return navigateToFileMatch(
          { ...state, search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
          targetIndex, s, s.query, s.searchFiles, pattern, ignoreCase,
        )
      }
    }

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
      search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, activeIndex, highlightsVisible: true, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount },
      ...withJump(state),
    }
  }

  if (s.scope === 'expanded') {
    const matches = s.expandedMatches
    if (matches.length === 0) return state

    const isAutoExpanded = (s.searchBody || s.searchFiles) && s.listMatches.length > 0

    if (isAutoExpanded && s.activeIndex >= -1) {
      const wouldWrap = s.direction === 'forward'
        ? s.activeIndex + 1 >= matches.length
        : s.activeIndex - 1 < 0

      if (wouldWrap) {
        return foldAndContinueSearch(state, s, pattern, ignoreCase, s.direction)
      }
    }

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
    const needsRecompute = s.listMatches.length === 0
    const result = !needsRecompute
      ? { matches: s.listMatches, bodyMatchIndices: s.bodyMatchIndices, fileMatchIndices: s.fileMatchIndices }
      : computeListMatches(state.commits, pattern, ignoreCase, state.branchTips, s.searchBody, s.searchFiles)
    if (result.matches.length === 0) return state

    const totals = needsRecompute && (s.searchBody || s.searchFiles)
      ? computeExpandedMatchTotals(state.commits, result.matches, result.bodyMatchIndices, result.fileMatchIndices, pattern, ignoreCase)
      : { expandedMatchCounts: s.expandedMatchCounts, totalMatchCount: s.totalMatchCount }

    const goingUp = reverseDir === 'backward'
    const landed = exitFileCursorIfSubjectMatch(state, result.matches, goingUp)
    if (landed !== null) return landed

    if (s.searchBody && state.expandedIndex === null && result.bodyMatchIndices.has(state.cursorIndex)) {
      return navigateToBodyMatch(
        { ...state, search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
        state.cursorIndex, s, s.query, s.searchBody, pattern, ignoreCase, reverseDir,
      )
    }

    if (s.searchFiles && state.expandedIndex === null && result.fileMatchIndices.has(state.cursorIndex)) {
      return navigateToFileMatch(
        { ...state, search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
        state.cursorIndex, s, s.query, s.searchFiles, pattern, ignoreCase, reverseDir,
      )
    }

    const activeIndex = resolveListActiveIndex(result.matches, state.cursorIndex, reverseDir)
    const targetIndex = result.matches[activeIndex]

    if (targetIndex !== undefined) {
      if (s.searchBody && result.bodyMatchIndices.has(targetIndex)) {
        return navigateToBodyMatch(
          { ...state, search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
          targetIndex, s, s.query, s.searchBody, pattern, ignoreCase, reverseDir,
        )
      }

      if (s.searchFiles && result.fileMatchIndices.has(targetIndex)) {
        return navigateToFileMatch(
          { ...state, search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount } },
          targetIndex, s, s.query, s.searchFiles, pattern, ignoreCase, reverseDir,
        )
      }
    }

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
      search: { ...s, listMatches: result.matches, bodyMatchIndices: result.bodyMatchIndices, fileMatchIndices: result.fileMatchIndices, activeIndex, highlightsVisible: true, expandedMatchCounts: totals.expandedMatchCounts, totalMatchCount: totals.totalMatchCount },
      ...withJump(state),
    }
  }

  if (s.scope === 'expanded') {
    const matches = s.expandedMatches
    if (matches.length === 0) return state

    const isAutoExpanded = (s.searchBody || s.searchFiles) && s.listMatches.length > 0

    if (isAutoExpanded && s.activeIndex >= -1) {
      const wouldWrap = reverseDir === 'forward'
        ? s.activeIndex + 1 >= matches.length
        : s.activeIndex - 1 < 0

      if (wouldWrap) {
        return foldAndContinueSearch(state, s, pattern, ignoreCase, reverseDir)
      }
    }

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

  return direction === 'forward' ? 0 : matches.length - 1
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
  if (match.type === 'file') return match.index < fileCursorIndex
  return true
}

function isExpandedMatchAfterIndex(match: ExpandedMatch, fileCursorIndex: number): boolean {
  if (match.type === 'file') return match.index > fileCursorIndex
  return false
}

function resolveExpandedFromPosition(
  matches: ExpandedMatch[],
  position: ExpandedMatch | null,
  direction: 'forward' | 'backward',
): number {
  if (position === null || matches.length === 0) return 0

  if (direction === 'forward') {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]
      if (m !== undefined && isMatchAfterPosition(m, position)) return i
    }
    return 0
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    if (m !== undefined && isMatchBeforePosition(m, position)) return i
  }
  return matches.length - 1
}

const TYPE_ORDER: Record<ExpandedMatch['type'], number> = { subject: 0, body: 1, file: 2 }

function isMatchAfterPosition(match: ExpandedMatch, pos: ExpandedMatch): boolean {
  if (match.type === 'body' && pos.type === 'body') return match.line > pos.line
  if (match.type === 'file' && pos.type === 'file') return match.index > pos.index
  return TYPE_ORDER[match.type] > TYPE_ORDER[pos.type]
}

function isMatchBeforePosition(match: ExpandedMatch, pos: ExpandedMatch): boolean {
  if (match.type === 'body' && pos.type === 'body') return match.line < pos.line
  if (match.type === 'file' && pos.type === 'file') return match.index < pos.index
  return TYPE_ORDER[match.type] < TYPE_ORDER[pos.type]
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

function applyJump(state: UiState, targetIndex: number): UiState {
  const newOffset = jumpCenterOffset(state, targetIndex)

  return clearSelections({
    ...state,
    cursorIndex: targetIndex,
    scrollOffset: newOffset,
    expandedIndex: null,
    fileCursorIndex: null,
    search: preserveListSearch(state.search),
    ...withJump(state),
  })
}
