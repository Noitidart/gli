import type { UiState } from './state.js'
import { formatBranches } from './state.js'
import type { Commit, FileStat } from './git.js'

export function render(state: UiState): string {
  const lines: string[] = []
  const maxLineNum = state.scrollOffset + state.termHeight
  const numWidth = Math.max(3, String(maxLineNum).length)
  const shaWidth = 7
  const branchWidth = state.branchColWidth

  const indent = ' '.repeat(numWidth + shaWidth + branchWidth + 8)

  let commitIndex = state.scrollOffset
  let displayLine = 0

  while (displayLine < state.termHeight && commitIndex < state.commits.length) {
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

      if (displayLine + expandedLines.length > state.termHeight) {
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

  return '\x1b[2J\x1b[H' + lines.join('\r\n')
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
  const numStr = String(lineNum).padStart(numWidth)
  const sha = commit.shortSha.padEnd(shaWidth)

  const branches = formatBranches(state.branchTips.get(commit.shortSha))
  const branchStr = branches.padEnd(branchWidth)

  const dot = state.unpushedShas.has(commit.shortSha) ? '\x1b[32m●\x1b[0m' : ' '

  const overhead = numWidth + shaWidth + branchWidth + 8
  const maxMsgLen = termWidth - overhead
  const message = maxMsgLen > 0 ? truncate(commit.message, maxMsgLen) : ''

  const line = `${dot} ${numStr}  ${sha}  ${branchStr}  ${message}`

  if (state.fileCursorIndex === null && index === state.cursorIndex) {
    return `\x1b[7m${line.padEnd(termWidth)}\x1b[0m`
  }
  return line
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

  const authorLine = `${indent}Author: ${commit.author}    ${commit.date}`
  lines.push(truncate(authorLine, termWidth))

  lines.push('')

  if (commit.body === null) {
    lines.push(`${indent}Loading...`)
  } else if (commit.body.length > 0) {
    const bodyLines = commit.body.split('\n')
    const maxBodyLen = termWidth - indent.length

    for (let i = 0; i < bodyLines.length; i++) {
      const bodyLine = bodyLines[i] ?? ''
      if (maxBodyLen > 0) {
        lines.push(`${indent}${truncate(bodyLine, maxBodyLen)}`)
      } else {
        lines.push(indent)
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
      const fileLine = `${file.path}  +${file.added} -${file.deleted}`
      let rendered = maxFileLen > 0 ? `${indent}${truncate(fileLine, maxFileLen)}` : indent

      if (state.fileCursorIndex === i) {
        rendered = `\x1b[7m${rendered.padEnd(termWidth)}\x1b[0m`
      }

      lines.push(rendered)
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
