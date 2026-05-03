import type { UiState } from './state.js'
import { formatBranches } from './state.js'
import type { Commit, FileStat } from './git.js'

const hasActiveBar = (state: UiState): boolean =>
  state.search.inputMode || (state.search.query !== null && state.search.highlightsVisible)

export function render(state: UiState): string {
  const lines: string[] = []

  const reserved = hasActiveBar(state) ? 1 : 0
  const effectiveHeight = state.termHeight - reserved
  const maxLineNum = state.scrollOffset + effectiveHeight
  const numWidth = Math.max(3, String(maxLineNum).length)
  const shaWidth = 7
  const branchWidth = state.branchColWidth

  const indent = ' '.repeat(2 * numWidth + shaWidth + branchWidth + 9)

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
    if (state.search.inputMode) {
      const prefix = state.search.direction === 'forward' ? '/' : '?'
      const promptLine = `${prefix}${state.search.prompt}`
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

function highlight(text: string, query: string | null): string {
  if (query === null || query === '') return text

  const lower = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let result = ''
  let pos = 0

  while (true) {
    const idx = lower.indexOf(lowerQuery, pos)
    if (idx === -1) {
      result += text.slice(pos)
      break
    }

    result += text.slice(pos, idx)
    result += `\x1b[7m${text.slice(idx, idx + query.length)}\x1b[0m`
    pos = idx + query.length
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

  const dot = state.unpushedShas.has(commit.shortSha) ? '\x1b[32m●\x1b[0m' : ' '

  const overhead = 2 * numWidth + shaWidth + branchWidth + 9
  const maxMsgLen = termWidth - overhead
  const message = maxMsgLen > 0 ? truncate(commit.message, maxMsgLen) : ''

  const line = `${relStr} ${dot} ${numStr}  ${sha}  ${branchStr}  ${message}`

  const activeBodyMatch = state.search.scope === 'expanded'
    && state.search.highlightsVisible
    && state.search.expandedMatches[state.search.activeIndex]?.type === 'body'

  if (state.fileCursorIndex === null && index === state.cursorIndex && !activeBodyMatch) {
    return `\x1b[7m${line.padEnd(termWidth)}\x1b[0m`
  }

  let highlightQuery: string | null = null

  if (state.search.highlightsVisible && state.search.query !== null) {
    if (state.search.scope === 'list') {
      highlightQuery = state.search.query
    } else if (state.search.scope === 'expanded' && index === state.expandedIndex) {
      highlightQuery = state.search.query
    }
  }

  return highlight(line, highlightQuery)
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

  const authorLine = truncate(`${indent}Author: ${commit.author}    ${commit.date}`, termWidth)
  lines.push(authorLine)

  lines.push('')

  const expandedHighlight = state.search.scope === 'expanded'
    && state.search.highlightsVisible
    && state.search.query !== null
    ? state.search.query
    : null

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
          const fullLine = maxBodyLen > 0 ? `${indent}${truncate(bodyLine, maxBodyLen)}` : indent
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
      const fileLine = `${dot} ${file.path}  +${file.added} -${file.deleted}`

      if (state.fileCursorIndex === i) {
        let content = maxFileLen > 0 ? truncate(fileLine, maxFileLen) : ''
        if (expandedHighlight !== null && maxFileLen > 0) {
          content = highlight(content, expandedHighlight)
        }
        const rendered = maxFileLen > 0 ? `${indent}${content}` : indent
        lines.push(`\x1b[7m${rendered.padEnd(termWidth)}\x1b[0m`)
      } else {
        let content = maxFileLen > 0 ? truncate(fileLine, maxFileLen) : ''
        if (expandedHighlight !== null && maxFileLen > 0) {
          content = highlight(content, expandedHighlight)
        }
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
