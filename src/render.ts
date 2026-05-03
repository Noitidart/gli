import type { UiState } from './state.js'

export function render(state: UiState): string {
  const lines: string[] = []
  const maxLineNum = state.scrollOffset + state.termHeight
  const numWidth = Math.max(3, String(maxLineNum).length)
  const shaWidth = 7

  for (let i = state.scrollOffset; i < state.commits.length && i < state.scrollOffset + state.termHeight; i++) {
    const commit = state.commits[i]
    if (commit === undefined) {
      continue
    }

    const lineNum = i + 1
    const numStr = String(lineNum).padStart(numWidth)
    const sha = commit.shortSha.padEnd(shaWidth)

    const overhead = numWidth + shaWidth + 4
    const maxMsgLen = state.termWidth - overhead
    const message = maxMsgLen > 0 ? truncate(commit.message, maxMsgLen) : ''

    const line = `${numStr}  ${sha}  ${message}`

    if (i === state.cursorIndex) {
      lines.push(`\x1b[7m${line.padEnd(state.termWidth)}\x1b[0m`)
    } else {
      lines.push(line)
    }
  }

  return '\x1b[2J\x1b[H' + lines.join('\r\n')
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) {
    return str
  }
  return str.slice(0, maxLen - 3) + '...'
}
