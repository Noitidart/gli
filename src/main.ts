import {
  enterRawMode,
  enterAltScreen,
  exitAltScreen,
  hideCursor,
  restoreTerminal,
  getTermSize,
} from './terminal.js'

import {
  BYTE_a,
  BYTE_b,
  BYTE_BACKSPACE,
  BYTE_c,
  BYTE_CTRL_B,
  BYTE_CTRL_C,
  BYTE_CTRL_F,
  BYTE_CTRL_L,
  BYTE_CTRL_O,
  BYTE_CTRL_R,
  BYTE_ENTER,
  BYTE_ESCAPE,
  BYTE_G,
  BYTE_g,
  BYTE_h,
  BYTE_i,
  BYTE_j,
  BYTE_k,
  BYTE_l,
  BYTE_LEFT_BRACKET,
  BYTE_m,
  BYTE_n,
  BYTE_N,
  BYTE_o,
  BYTE_q,
  BYTE_QUESTION,
  BYTE_QUOTE,
  BYTE_RIGHT_BRACKET,
  BYTE_SLASH,
  BYTE_SPACE,
  BYTE_TAB,
  BYTE_u,
  BYTE_y,
  BYTE_z,
  digitValue,
  isDigit,
  isLowerAlpha,
  isPrintable,
} from './keys.js'

import { spawn } from 'node:child_process'
import { getCommits, getTotalCount, getCommitDetail, getBranchTips, getUnpushedShas } from './git.js'
import { createInitialState, reduce, type Action } from './state.js'
import { render, tickSpinner } from './render.js'
import { copyToClipboard } from './clipboard.js'

function parsePathspecs(argv: string[]): string[] | undefined {
  const dashIndex = argv.indexOf('--')
  if (dashIndex === -1) {
    return undefined
  }
  const paths = argv.slice(dashIndex + 1)
  if (paths.length === 0) {
    return undefined
  }
  return paths
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('gli requires a terminal')
    process.exit(1)
  }

  enterRawMode()
  enterAltScreen()
  hideCursor()

  const size = getTermSize()
  const pathspecs = parsePathspecs(process.argv)

  const totalCommits = await getTotalCount(pathspecs)
  const initialCommits = await getCommits(0, 100, pathspecs)
  const hasMore = initialCommits.length >= 100
  const branchTips = await getBranchTips()
  const unpushedShas = await getUnpushedShas()

  let state = createInitialState(initialCommits, totalCommits, hasMore, size.height, size.width, branchTips, unpushedShas)
  let isLoadingMore = false
  let cancelLoadAll = false
  let cancelMarkJump = false
  let spinnerTimer: ReturnType<typeof setInterval> | null = null

  process.stdout.write(render(state))

  let digitBuffer = ''
  let pendingG = false
  let pendingZ = false
  let pendingQuote = false
  let pendingM = false
  let pendingRBracket = false
  let pendingLBracket = false
  let gTimer: ReturnType<typeof setTimeout> | null = null
  let quoteTimer: ReturnType<typeof setTimeout> | null = null
  let mTimer: ReturnType<typeof setTimeout> | null = null
  let rbracketTimer: ReturnType<typeof setTimeout> | null = null
  let lbracketTimer: ReturnType<typeof setTimeout> | null = null

  function parseNextByte(byte: number): Action | null {
    if (pendingG) {
      clearTimeout(gTimer as ReturnType<typeof setTimeout>)
      pendingG = false
      gTimer = null

      if (byte === BYTE_g) {
        digitBuffer = ''
        return { type: 'jump-top' }
      }
    }

    if (pendingZ) {
      pendingZ = false

      switch (byte) {
        case BYTE_o:
          return { type: 'expand' }
        case BYTE_c:
          return { type: 'fold' }
        case BYTE_a:
          return { type: 'toggle-expand' }
        default:
          return null
      }
    }

    if (pendingQuote) {
      clearTimeout(quoteTimer as ReturnType<typeof setTimeout>)
      pendingQuote = false
      quoteTimer = null

      if (byte === BYTE_QUOTE) {
        return { type: 'jump-previous' }
      }

      if (isLowerAlpha(byte)) {
        return { type: 'jump-to-mark', letter: String.fromCharCode(byte) }
      }

      return null
    }

    if (pendingM) {
      clearTimeout(mTimer as ReturnType<typeof setTimeout>)
      pendingM = false
      mTimer = null

      if (isLowerAlpha(byte)) {
        return { type: 'set-mark', letter: String.fromCharCode(byte) }
      }

      return null
    }

    if (pendingRBracket) {
      clearTimeout(rbracketTimer as ReturnType<typeof setTimeout>)
      pendingRBracket = false
      rbracketTimer = null

      if (byte === BYTE_b) {
        return { type: 'jump-to-branch-next' }
      }

      return null
    }

    if (pendingLBracket) {
      clearTimeout(lbracketTimer as ReturnType<typeof setTimeout>)
      pendingLBracket = false
      lbracketTimer = null

      if (byte === BYTE_b) {
        return { type: 'jump-to-branch-prev' }
      }

      return null
    }

    if (isDigit(byte)) {
      digitBuffer += String(digitValue(byte))
      return null
    }

    if (byte === BYTE_g) {
      pendingG = true
      gTimer = setTimeout(() => {
        pendingG = false
      }, 500)
      return null
    }

    if (byte === BYTE_z) {
      pendingZ = true
      digitBuffer = ''

      if (pendingG) {
        clearTimeout(gTimer as ReturnType<typeof setTimeout>)
        pendingG = false
        gTimer = null
      }

      return null
    }

    if (byte === BYTE_QUOTE) {
      pendingQuote = true
      digitBuffer = ''

      quoteTimer = setTimeout(() => {
        pendingQuote = false
      }, 500)

      return null
    }

    if (byte === BYTE_m) {
      pendingM = true
      digitBuffer = ''

      if (pendingG) {
        clearTimeout(gTimer as ReturnType<typeof setTimeout>)
        pendingG = false
        gTimer = null
      }

      mTimer = setTimeout(() => {
        pendingM = false
      }, 500)

      return null
    }

    if (byte === BYTE_RIGHT_BRACKET) {
      pendingRBracket = true
      digitBuffer = ''

      if (pendingG) {
        clearTimeout(gTimer as ReturnType<typeof setTimeout>)
        pendingG = false
        gTimer = null
      }

      rbracketTimer = setTimeout(() => {
        pendingRBracket = false
      }, 500)

      return null
    }

    if (byte === BYTE_LEFT_BRACKET) {
      pendingLBracket = true
      digitBuffer = ''

      if (pendingG) {
        clearTimeout(gTimer as ReturnType<typeof setTimeout>)
        pendingG = false
        gTimer = null
      }

      lbracketTimer = setTimeout(() => {
        pendingLBracket = false
      }, 500)

      return null
    }

    if (byte === BYTE_G) {
      if (digitBuffer.length > 0) {
        const line = parseInt(digitBuffer, 10)
        digitBuffer = ''
        return { type: 'jump-line', line }
      }
      return { type: 'jump-bottom' }
    }

    if (byte === BYTE_y) {
      if (digitBuffer.length > 0) {
        const line = parseInt(digitBuffer, 10)
        digitBuffer = ''
        return { type: 'yank-line', line }
      }
      return { type: 'yank' }
    }

    if (byte === BYTE_j) {
      const count = digitBuffer.length > 0 ? parseInt(digitBuffer, 10) : 1
      digitBuffer = ''
      return { type: 'move-rel', direction: 'down', count }
    }

    if (byte === BYTE_k) {
      const count = digitBuffer.length > 0 ? parseInt(digitBuffer, 10) : 1
      digitBuffer = ''
      return { type: 'move-rel', direction: 'up', count }
    }

    digitBuffer = ''

    if (byte === BYTE_l) {
      return { type: 'enter-file-cursor' }
    }

    if (byte === BYTE_h) {
      return { type: 'exit-file-cursor' }
    }

    if (byte === BYTE_SLASH) {
      return { type: 'search-start', direction: 'forward' }
    }

    if (byte === BYTE_QUESTION) {
      return { type: 'search-start', direction: 'backward' }
    }

    if (byte === BYTE_SPACE) {
      return { type: 'toggle-mark' }
    }

    if (byte === BYTE_u) {
      return { type: 'undo-mark' }
    }

    if (byte === BYTE_n) {
      return { type: 'search-next' }
    }

    if (byte === BYTE_N) {
      return { type: 'search-prev' }
    }

    if (byte === BYTE_CTRL_R) {
      return { type: 'redo-mark' }
    }

    switch (byte) {
      case BYTE_i:
        return { type: 'inspect' }
      case BYTE_CTRL_F:
        return { type: 'page-down' }
      case BYTE_CTRL_B:
        return { type: 'page-up' }
      case BYTE_q:
        return { type: 'quit' }
      case BYTE_ESCAPE:
        return { type: 'quit' }
      case BYTE_CTRL_C:
        return { type: 'hard-quit' }
      case BYTE_CTRL_O:
        return { type: 'jump-back' }
      case BYTE_TAB:
        return { type: 'jump-forward' }
      case BYTE_CTRL_L:
        return { type: 'search-clear-highlights' }
      default:
        return null
    }
  }

  process.stdin.on('data', (data: Buffer) => {
    if (data[0] === BYTE_ESCAPE && data.length > 1) {
      return
    }

    if (state.search.loadingAll) {
      for (let i = 0; i < data.length; i++) {
        const byte = data[i]
        if (byte === undefined) continue

        if (byte === BYTE_ESCAPE) {
          cancelLoadAll = true
          return
        }

        if (byte === BYTE_CTRL_C) {
          if (spinnerTimer !== null) clearInterval(spinnerTimer)
          restoreTerminal()
          process.exit(0)
        }
      }
      return
    }

    if (state.pendingMarkJump !== null) {
      for (let i = 0; i < data.length; i++) {
        const byte = data[i]
        if (byte === undefined) continue

        if (byte === BYTE_ESCAPE) {
          cancelMarkJump = true
          return
        }

        if (byte === BYTE_CTRL_C) {
          if (spinnerTimer !== null) clearInterval(spinnerTimer)
          restoreTerminal()
          process.exit(0)
        }
      }
      return
    }

    if (state.search.inputMode) {
      for (let i = 0; i < data.length; i++) {
        const byte = data[i]
        if (byte === undefined) continue

        if (byte === BYTE_ESCAPE) {
          state = reduce(state, { type: 'search-cancel' })
          process.stdout.write(render(state))
          return
        }

        if (byte === BYTE_ENTER) {
          state = reduce(state, { type: 'search-confirm' })
          process.stdout.write(render(state))

          if (state.search.loadingAll) {
            cancelLoadAll = false
            spinnerTimer = setInterval(() => {
              tickSpinner()
              process.stdout.write(render(state))
            }, 80)

            setImmediate(async () => {
              try {
                while (state.hasMore && !cancelLoadAll) {
                  const newCommits = await getCommits(state.commits.length, 200, pathspecs)
                  state = reduce(state, {
                    type: 'commits-loaded',
                    commits: newCommits,
                    total: state.totalCommits,
                    hasMore: newCommits.length >= 200,
                  })
                  process.stdout.write(render(state))
                }
              } catch {
                // stop on error
              }

              if (spinnerTimer !== null) clearInterval(spinnerTimer)
              spinnerTimer = null
              state = reduce(state, { type: 'search-load-complete' })
              process.stdout.write(render(state))
            })
          }

          return
        }

        if (byte === BYTE_BACKSPACE) {
          state = reduce(state, { type: 'search-input', char: null })
          process.stdout.write(render(state))
          continue
        }

        if (isPrintable(byte)) {
          state = reduce(state, { type: 'search-input', char: String.fromCharCode(byte) })
          process.stdout.write(render(state))
        }
      }

      return
    }

    for (let i = 0; i < data.length; i++) {
      const byte = data[i]
      if (byte === undefined) {
        continue
      }

      const action = parseNextByte(byte)
      if (action === null) {
        continue
      }

      if (action.type === 'quit' || action.type === 'hard-quit') {
        restoreTerminal()
        process.exit(0)
      }

      if (action.type === 'yank' || action.type === 'yank-line') {
        const commitIndex = action.type === 'yank-line'
          ? Math.min(action.line - 1, state.commits.length - 1)
          : state.cursorIndex
        const commit = state.commits[commitIndex]

        if (commit !== undefined) {
          copyToClipboard(commit.shortSha).catch(() => {})
        }

        restoreTerminal()
        process.exit(0)
      }

      if (action.type === 'inspect') {
        const commit = state.commits[state.cursorIndex]

        if (commit !== undefined) {
          process.stdin.pause()
          exitAltScreen()

          const args = [
            '-c', 'diff.external=difft',
            'show', '--ext-diff',
            commit.fullSha,
          ]

          if (state.fileCursorIndex !== null && commit.files !== null) {
            const cursorFileIsMarked = state.selectedFiles.has(state.fileCursorIndex)

            if (state.selectedFiles.size > 0 && cursorFileIsMarked) {
              args.push('--')

              const sortedIndices = [...state.selectedFiles].sort((a, b) => a - b)
              for (let fi = 0; fi < sortedIndices.length; fi++) {
                const fileIndex = sortedIndices[fi]
                if (fileIndex === undefined) {
                  continue
                }
                const file = commit.files[fileIndex]
                if (file !== undefined) {
                  args.push(file.path)
                }
              }
            } else {
              const file = commit.files[state.fileCursorIndex]
              if (file !== undefined) {
                args.push('--', file.path)
              }
            }
          }

          const childEnv = { ...process.env } as Record<string, string>
          const currentLess = childEnv['LESS'] ?? '-R'
          childEnv['LESS'] = currentLess.replace(/-F\b|--quit-if-one-screen\b/g, '').trim().replace(/\s+/, ' ')

          const child = spawn('git', args, {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: childEnv,
          })

          child.on('close', () => {
            enterRawMode()
            enterAltScreen()
            hideCursor()
            process.stdin.resume()
            process.stdout.write(render(state))
          })
        }

        return
      }

      state = reduce(state, action)
      process.stdout.write(render(state))

      if ((action.type === 'expand' || action.type === 'toggle-expand' || action.type === 'enter-file-cursor') && state.expandedIndex !== null) {
        const expandedCommit = state.commits[state.expandedIndex]

        if (expandedCommit !== undefined && (expandedCommit.body === null || expandedCommit.files === null)) {
          const fetchIndex = state.expandedIndex
          const wasEnterFileCursor = action.type === 'enter-file-cursor'

          getCommitDetail(expandedCommit.fullSha).then((detail) => {
            state = reduce(state, {
              type: 'detail-loaded',
              index: fetchIndex,
              body: detail.body,
              files: detail.files,
            })

            if (wasEnterFileCursor && state.expandedIndex === fetchIndex) {
              state = { ...state, fileCursorIndex: 0 }
            }

            process.stdout.write(render(state))
          })
        }
      }

      if (state.pendingMarkJump !== null) {
        const targetSha = state.pendingMarkJump
        cancelMarkJump = false

        spinnerTimer = setInterval(() => {
          tickSpinner()
          process.stdout.write(render(state))
        }, 80)

        setImmediate(async () => {
          try {
            while (state.hasMore && !cancelMarkJump) {
              const newCommits = await getCommits(state.commits.length, 100, pathspecs)
              state = reduce(state, {
                type: 'commits-loaded',
                commits: newCommits,
                total: state.totalCommits,
                hasMore: newCommits.length >= 100,
              })

              if (state.commits.some((c) => c.shortSha === targetSha)) {
                state = reduce(state, { type: 'resolve-pending-mark-jump' })
                break
              }

              process.stdout.write(render(state))
            }
          } catch {
            // stop on error
          }

          if (spinnerTimer !== null) clearInterval(spinnerTimer)
          spinnerTimer = null

          if (state.pendingMarkJump !== null) {
            state = reduce(state, { type: 'cancel-pending-mark-jump' })
          }

          process.stdout.write(render(state))
        })

        return
      }
    }

    if (state.cursorIndex >= state.commits.length - 1 && state.hasMore && !isLoadingMore && !state.search.loadingAll && state.pendingMarkJump === null) {
      isLoadingMore = true

      setImmediate(async () => {
        try {
          const newCommits = await getCommits(state.commits.length, 100, pathspecs)
          state = reduce(state, {
            type: 'commits-loaded',
            commits: newCommits,
            total: state.totalCommits,
            hasMore: newCommits.length >= 100,
          })
        } catch {
          // Failed to load more — silently stop paginating
        } finally {
          isLoadingMore = false
        }
        process.stdout.write(render(state))
      })
    }
  })

  process.stdout.on('resize', () => {
    const newSize = getTermSize()
    state = reduce(state, { type: 'resize', height: newSize.height, width: newSize.width })
    process.stdout.write(render(state))
  })

  process.on('SIGINT', () => {
    restoreTerminal()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    restoreTerminal()
    process.exit(0)
  })
}

main().catch((err) => {
  restoreTerminal()
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
