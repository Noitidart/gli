import {
  enterRawMode,
  enterAltScreen,
  hideCursor,
  restoreTerminal,
  getTermSize,
} from './terminal.js'

import {
  BYTE_CTRL_B,
  BYTE_CTRL_C,
  BYTE_CTRL_F,
  BYTE_ESCAPE,
  BYTE_G,
  BYTE_g,
  BYTE_j,
  BYTE_k,
  BYTE_q,
  isDigit,
  digitValue,
} from './keys.js'

import { getCommits, getTotalCount } from './git.js'
import { createInitialState, reduce, type Action } from './state.js'
import { render } from './render.js'

async function main() {
  enterRawMode()
  enterAltScreen()
  hideCursor()

  const size = getTermSize()

  const totalCommits = await getTotalCount()
  const initialCommits = await getCommits(0, 200)
  const hasMore = initialCommits.length >= 200

  let state = createInitialState(initialCommits, totalCommits, hasMore, size.height, size.width)
  let isLoadingMore = false

  process.stdout.write(render(state))

  let digitBuffer = ''
  let pendingG = false
  let gTimer: ReturnType<typeof setTimeout> | null = null

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

    if (byte === BYTE_G) {
      if (digitBuffer.length > 0) {
        const line = parseInt(digitBuffer, 10)
        digitBuffer = ''
        return { type: 'jump-line', line }
      }
      return { type: 'jump-bottom' }
    }

    digitBuffer = ''

    switch (byte) {
      case BYTE_j:
        return { type: 'move-down' }
      case BYTE_k:
        return { type: 'move-up' }
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
      default:
        return null
    }
  }

  process.stdin.on('data', (data: Buffer) => {
    if (data[0] === BYTE_ESCAPE && data.length > 1) {
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

      state = reduce(state, action)
      process.stdout.write(render(state))
    }

    if (state.cursorIndex >= state.commits.length - 1 && state.hasMore && !isLoadingMore) {
      isLoadingMore = true

      setImmediate(async () => {
        try {
          const newCommits = await getCommits(state.commits.length, 200)
          state = reduce(state, {
            type: 'commits-loaded',
            commits: newCommits,
            total: state.totalCommits,
            hasMore: newCommits.length >= 200,
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
