import type { UiState } from './state.js'
import { formatBranches, parseCaseFlags } from './state.js'
import type { Commit, FileStat } from './git.js'

type HighlightInfo = { pattern: string; ignoreCase: boolean }

const SPINNER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let spinnerFrame = 0

export function tickSpinner(): void {
  spinnerFrame = (spinnerFrame + 1) % SPINNER_CHARS.length
}

const hasActiveBar = (state: UiState): boolean =>
  state.search.inputMode || state.search.loadingAll || state.pendingMarkJump !== null || (state.search.query !== null && state.search.highlightsVisible)

export function render(state: UiState): string {
  const lines: string[] = []

  const reserved = hasActiveBar(state) ? 1 : 0
  const effectiveHeight = state.termHeight - reserved
  const maxLineNum = state.scrollOffset + effectiveHeight
  const numWidth = Math.max(3, String(maxLineNum).length)
  const shaWidth = 7
  const branchWidth = state.branchColWidth

  const indent = ' '.repeat(2 * numWidth + shaWidth + branchWidth + 11)

  let commitIndex = state.scrollOffset
  let displayLine = 0

  while (displayLine < effectiveHeight && commitIndex < state.commits.length) {
    const commit = state.commits[commitIndex]
    if (commit === undefined) {
      commitIndex++
      continue
    }

    if (commitIndex === state.expandedIndex) {
      const expandedLines = renderExpandedCommit(
        state,
        commit,
        commitIndex,
        numWidth,
        shaWidth,
        branchWidth,
        indent,
        state.termWidth,
      )

      if (displayLine + expandedLines.length > effectiveHeight) {
        break
      }

      for (let j = 0; j < expandedLines.length; j++) {
        lines.push(expandedLines[j] ?? '')
        displayLine++
      }
    } else {
      const line = renderFoldedCommit(
        state,
        commit,
        commitIndex,
        numWidth,
        shaWidth,
        branchWidth,
        state.termWidth,
      )
      lines.push(line)
      displayLine++
    }

    commitIndex++
  }

  if (hasActiveBar(state)) {
    if (state.pendingMarkJump !== null) {
      const spinner = SPINNER_CHARS[spinnerFrame]
      const progress = `${spinner} Finding master... ${state.commits.length}/${state.totalCommits}`
      lines.push(`\x1b[7m${progress.padEnd(state.termWidth)}\x1b[0m`)
    } else if (state.search.loadingAll) {
      const spinner = SPINNER_CHARS[spinnerFrame]
      const label = state.search.searchBody ? 'Searching all commits (with body)...'
        : state.search.searchFiles ? 'Searching all commits (with files)...'
        : 'Searching all commits...'
      const progress = `${spinner} ${label} ${state.commits.length}/${state.totalCommits}`
      lines.push(`\x1b[7m${progress.padEnd(state.termWidth)}\x1b[0m`)
    } else if (state.search.inputMode) {
      const prefix = state.search.direction === 'forward' ? '/' : '?'
      const promptLine = state.search.flagError
        ? `${prefix}${state.search.prompt}  \x1b[31m${state.search.flagError}\x1b[0m`
        : `${prefix}${state.search.prompt}`
      lines.push(`\x1b[7m${promptLine.padEnd(state.termWidth)}\x1b[0m`)
    } else if (state.search.query !== null && state.search.highlightsVisible) {
      const matches = state.search.scope === 'list' ? state.search.listMatches : state.search.expandedMatches
      if (matches.length > 0 && state.search.activeIndex >= 0) {
        const counter = `match ${state.search.activeIndex + 1} of ${matches.length}`
        lines.push(truncate(counter, state.termWidth))
      } else if (matches.length === 0) {
        lines.push(truncate('No matches', state.termWidth))
      } else {
        lines.push('')
      }
    }
  }

  return '\x1b[2J\x1b[H' + lines.join('\r\n')
}

function highlight(text: string, info: HighlightInfo | null): string {
  if (info === null || info.pattern === '') return text

  const searchIn = info.ignoreCase ? text.toLowerCase() : text
  const searchFor = info.ignoreCase ? info.pattern.toLowerCase() : info.pattern
  let result = ''
  let pos = 0

  while (true) {
    const idx = searchIn.indexOf(searchFor, pos)
    if (idx === -1) {
      result += text.slice(pos)
      break
    }

    result += text.slice(pos, idx)
    result += `\x1b[7m${text.slice(idx, idx + info.pattern.length)}\x1b[0m`
    pos = idx + info.pattern.length
  }

  return result
}

function highlightReversed(text: string, info: HighlightInfo | null): string {
  if (info === null || info.pattern === '') return text

  const searchIn = info.ignoreCase ? text.toLowerCase() : text
  const searchFor = info.ignoreCase ? info.pattern.toLowerCase() : info.pattern
  let result = ''
  let pos = 0

  while (true) {
    const idx = searchIn.indexOf(searchFor, pos)
    if (idx === -1) {
      result += text.slice(pos)
      break
    }

    result += text.slice(pos, idx)
    result += `\x1b[27m${text.slice(idx, idx + info.pattern.length)}\x1b[7m`
    pos = idx + info.pattern.length
  }

  return result
}

function renderFoldedCommit(
  state: UiState,
  commit: Pick<Commit, 'shortSha' | 'message'>,
  index: number,
  numWidth: number,
  shaWidth: number,
  branchWidth: number,
  termWidth: number,
): string {
  const lineNum = index + 1
  const relNum = index === state.cursorIndex ? lineNum : Math.abs(index - state.cursorIndex)
  const relStr = String(relNum).padStart(numWidth)
  const numStr = String(lineNum).padStart(numWidth)
  const sha = commit.shortSha.padEnd(shaWidth)

  const branches = formatBranches(state.branchTips.get(commit.shortSha))
  const branchStr = branches.padEnd(branchWidth)

  const activeNonSubjectMatch = state.search.scope === 'expanded'
    && state.search.highlightsVisible
    && state.search.activeIndex >= 0
    && state.search.expandedMatches[state.search.activeIndex]?.type !== 'subject'
    && state.fileCursorIndex === null

  const activeFileMatch = state.search.scope === 'expanded'
    && state.search.highlightsVisible
    && state.search.expandedMatches[state.search.activeIndex]?.type === 'file'

  const isCursorLine = state.fileCursorIndex === null && index === state.cursorIndex && !activeNonSubjectMatch && !activeFileMatch

  const dot = state.unpushedShas.has(commit.shortSha)
    ? (isCursorLine ? '⬆' : '\x1b[32m⬆\x1b[0m')
    : ' '

  const bodyInd = state.search.highlightsVisible
    && state.search.query !== null
    && (state.search.bodyMatchIndices.has(index) || state.search.fileMatchIndices.has(index))
    ? (isCursorLine ? '▼' : '\x1b[33m▼\x1b[0m')
    : ' '

  const overhead = 2 * numWidth + shaWidth + branchWidth + 11
  const maxMsgLen = termWidth - overhead
  const message = maxMsgLen > 0 ? truncate(commit.message, maxMsgLen) : ''

  const lineNumPrefix = `${bodyInd} ${relStr} ${dot} ${numStr}  `
  const headerPrefix = `${sha}  ${branchStr}  `

  let highlightInfo: HighlightInfo | null = null
  let highlightScope: 'list' | 'expanded' | null = null

  if (state.search.highlightsVisible && state.search.query !== null) {
    if (state.search.scope === 'list') {
      highlightInfo = parseCaseFlags(state.search.query)
      highlightScope = 'list'
    } else if (state.search.scope === 'expanded') {
      if (index === state.expandedIndex) {
        highlightInfo = parseCaseFlags(state.search.query)
        highlightScope = 'expanded'
      } else if ((state.search.searchBody || state.search.searchFiles) && state.search.listMatches.length > 0) {
        highlightInfo = parseCaseFlags(state.search.query)
        highlightScope = 'list'
      }
    }
  }

  const prefixPart = lineNumPrefix

  if (isCursorLine) {
    const msgHighlighted = highlightReversed(message, highlightInfo)
    if (highlightScope === 'expanded') {
      const lineHighlighted = prefixPart + headerPrefix + msgHighlighted
      return `\x1b[7m${lineHighlighted.padEnd(termWidth)}\x1b[0m`
    }
    const contentHighlighted = highlightReversed(headerPrefix + message, highlightInfo)
    const lineHighlighted = prefixPart + contentHighlighted
    return `\x1b[7m${lineHighlighted.padEnd(termWidth)}\x1b[0m`
  }

  if (highlightScope === 'expanded') {
    return prefixPart + headerPrefix + highlight(message, highlightInfo)
  }
  return prefixPart + highlight(headerPrefix + message, highlightInfo)
}

function renderExpandedCommit(
  state: UiState,
  commit: Commit,
  index: number,
  numWidth: number,
  shaWidth: number,
  branchWidth: number,
  indent: string,
  termWidth: number,
): string[] {
  const lines: string[] = []

  lines.push(renderFoldedCommit(state, commit, index, numWidth, shaWidth, branchWidth, termWidth))

  lines.push(truncate(`${indent}Author: ${commit.author}    ${commit.date}`, termWidth))

  lines.push('')

  const expandedHighlight: HighlightInfo | null = state.search.scope === 'expanded'
    && state.search.highlightsVisible
    && state.search.query !== null
    ? parseCaseFlags(state.search.query)
    : null

  lines.push('')

  if (commit.body === null) {
    lines.push(`${indent}Loading...`)
  } else if (commit.body.length > 0) {
    const bodyLines = commit.body.split('\n')
    const maxBodyLen = termWidth - indent.length

    for (let i = 0; i < bodyLines.length; i++) {
      const bodyLine = bodyLines[i] ?? ''

      if (expandedHighlight !== null) {
        const activeMatch = state.search.expandedMatches[state.search.activeIndex]
        const isActiveBodyLine = activeMatch?.type === 'body' && activeMatch.line === i
          && state.fileCursorIndex === null

        if (isActiveBodyLine) {
          const truncated = maxBodyLen > 0 ? truncate(bodyLine, maxBodyLen) : ''
          const highlighted = highlightReversed(truncated, expandedHighlight)
          const fullLine = maxBodyLen > 0 ? `${indent}${highlighted}` : indent
          lines.push(`\x1b[7m${fullLine.padEnd(termWidth)}\x1b[0m`)
        } else {
          const truncated = maxBodyLen > 0 ? truncate(bodyLine, maxBodyLen) : ''
          const highlighted = highlight(truncated, expandedHighlight)
          lines.push(maxBodyLen > 0 ? `${indent}${highlighted}` : indent)
        }
      } else {
        if (maxBodyLen > 0) {
          lines.push(`${indent}${truncate(bodyLine, maxBodyLen)}`)
        } else {
          lines.push(indent)
        }
      }
    }
  }

  lines.push('')

  if (commit.files === null) {
    lines.push(`${indent}Loading...`)
  } else if (commit.files.length > 0) {
    const maxFileLen = termWidth - indent.length

    for (let i = 0; i < commit.files.length; i++) {
      const file = commit.files[i]
      if (file === undefined) {
        continue
      }
      const dot = state.selectedFiles.has(i) ? '\x1b[32m●\x1b[0m' : ' '
      const filePrefix = `${dot} `
      const fileStats = `  +${file.added} -${file.deleted}`
      const filePath = file.path

      if (state.fileCursorIndex === i) {
        const highlightedPath = highlightReversed(filePath, expandedHighlight)
        const content = maxFileLen > 0 ? truncate(`${filePrefix}${highlightedPath}${fileStats}`, maxFileLen) : ''
        const rendered = maxFileLen > 0 ? `${indent}${content}` : indent
        lines.push(`\x1b[7m${rendered.padEnd(termWidth)}\x1b[0m`)
      } else {
        const highlightedPath = expandedHighlight !== null && maxFileLen > 0
          ? highlight(filePath, expandedHighlight)
          : filePath
        const content = maxFileLen > 0 ? truncate(`${filePrefix}${highlightedPath}${fileStats}`, maxFileLen) : ''
        const rendered = maxFileLen > 0 ? `${indent}${content}` : indent
        lines.push(rendered)
      }
    }
  }

  return lines
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) {
    return str
  }
  return str.slice(0, maxLen - 3) + '...'
}
