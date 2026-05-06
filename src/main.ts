#!/usr/bin/env node

import {
  enterAltScreen,
  enterRawMode,
  exitAltScreen,
  getTermSize,
  hideCursor,
  restoreTerminal,
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
import { copyToClipboard } from './clipboard.js'
import { getAllCommits, getBranchTips, getCommitNumstat, getUnpushedShas } from './git.js'
import { render } from './render.js'
import { createInitialState, reduce, type Action } from './state.js'

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

const HELP = `
gli - interactive git log viewer

USAGE
  gli [-- <pathspec>...]

CURSOR CONTEXTS

  j, k, h, l change meaning based on cursor position.

  Key   Folded list              Expanded subject          Non-navigable (*)        File list
  ----  -----------------------  -----------------------  ----------------------   -----------------------
  j     Next commit              Collapse + next commit    First file (or next      Next file
                                                           commit if no files)
  k     Prev commit              Collapse + prev commit    Subject                  Prev file
  h     Nothing                  Fold                      Subject                  Exit to subject
                                                                                    (2nd press folds)
  l     Expand + cursor          Enter file cursor         First file               Nothing
        to 1st file

  All support count prefix (3j, 5k).

  Edge behavior:
    j at file list bottom  -> move to next commit (collapses current)
    k at file list top     -> exit to subject

  (*) Non-navigable areas are when a search match lands on a non-navigable
      line (author, date, or body) between subject and file list. The cursor
      sits on that line (reverse-video). Normally, cursor cannot get here
      with navigation keys. Only n/N can navigate to these matches. Once
      here, navigating immediately leaves. For example 2j goes to 2nd file
      (or next commit if fewer files), 2k goes 2 steps up.

SCROLLING
  Ctrl+F     Page down
  Ctrl+B     Page up
  gg         Jump to first commit
  G          Jump to last commit
  {N}G       Jump to line N (1-indexed)

EXPAND / FOLD
  zo         Expand commit (show author, date, body, file list)
  zc         Collapse expanded commit
  za         Toggle expand/collapse

  Collapse behavior:
    When a commit collapses, any expanded search scoped to that commit is
    cleared. A list-level search (including /b, /f) is preserved. File
    selections (Space marks) are always cleared on collapse.

INSPECT
  i          Open git show --ext-diff for the commit (uses difftastic)

  What i shows depends on cursor position:
    Folded / expanded subject          -> full commit diff
    File cursor, cursor on marked file -> all marked files
    File cursor, unmarked file         -> current file only

  File Selection (inside expanded commit's file list):
    Space      Toggle selection mark on current file
    u          Undo last mark toggle
    Ctrl+R     Redo last undone mark toggle

    Selections are cleared on collapse.

YANK
  y          Copy current commit's short SHA to clipboard and exit
  {N}y       Copy SHA of commit at line N to clipboard and exit

SEARCH
  /          Start forward search
  ?          Start backward search
  n          Next match
  N          Previous match
  Ctrl+L     Clear highlights (query kept; n/N restores them)
   Escape     Cancel search input

  SCOPE
    Search scope is determined when you press / or ?:

    List scope (no commit expanded):
      Searches subjects, SHAs, and branch names across all loaded commits.
      Persists through expand, collapse, jumps, scrolling, and inspect.
      Only cleared by Ctrl+L or submitting a new search.
        /b  -- also search body text
        /f  -- search file paths only (no subject/SHA/branch)

    Expanded scope (commit already expanded):
      Searches all fields within the expanded commit. n/N wraps within.
      Cleared when collapsing or navigating away. Starting a search while
      expanded clears any active list search.
        /b  -- no effect (body already included)
        /f  -- narrows to files only
        Matches in non-navigable areas (author, date, body) are only
        accessible via n/N.

  RESTARTING SEARCH
    Pressing / or ? while a search is active begins a new search prompt.
    The old query, highlights, and cursor position remain visible while
    you type, and only clear when you submit with Enter.
      Enter   -> confirms the new search, replacing old matches.
                 First match resolves from current position, regardless
                 of scope.
      Escape  -> closes the prompt.

  NAVIGATION RULES
    n/N find the next/previous match relative to the current position.
    If the current line is itself a match, search lands on it rather than
    skipping to the next. Matching is line-wise -- even if a line has
    multiple matched words, it counts as one match position.

    With body/file matches from list scope (/b & /f flags): matching
    commits auto-expand and the cursor lands on the match line.
    Subject-only matches do not auto-expand.

    When a commit has matches in both the subject and body (or files),
    n auto-expands on the subject line so you can peek into the deeper
    matches. Going the other direction, N from a body/file match lands
    on the subject without auto-folding -- the commit stays expanded.

    If you fold a commit that still has unvisited body/file matches,
    n/N re-expands it instead of skipping.

  FLAGS  (append after a delimiter: / # _ @ , ; -)
    /b   Include commit body text (list scope only)
    /f   Search file paths only (no subject/SHA/branch)

    b and f cannot be combined.

  CASE SENSITIVITY
    Smart case (default): all-lowercase = case-insensitive; any
    uppercase = case-sensitive. Override with \\c (force insensitive)
    or \\C (force sensitive) anywhere in the query.

MARKS
  m{a-z}     Set mark at current commit (not mm)
  '{a-z}     Jump to mark
  'm         Jump to master/main branch tip
  ''         Jump to previous position

JUMP STACK
  Ctrl+O     Jump back (like vim's Ctrl-O)
  Tab        Jump forward (like vim's Tab)

  gg, G, {N}G, searches, marks, and branch navigation push to the
  stack. j/k and Ctrl+F/Ctrl+B do not.

BRANCH NAVIGATION
  ]b         Jump to next commit with a branch tip
  [b         Jump to previous commit with a branch tip

QUIT
  q / Escape   Quit gli (restores terminal)
  Ctrl+C       Force quit

  During inspect (i), gli suspends and git show runs in the foreground
  with a pager. q or Ctrl+C there quits the pager, returning to gli.
  Neither exits gli directly.

VISUAL INDICATORS
  ⬆ (green)        Unpushed commit
  ▼ (yellow)        Commit has a body/file search match
  ● (green, files)  File is selected (marked with Space)

  One line is always active (reverse-video). When a search is active,
  matching text on non-active lines gets an inline highlight. When a
  match becomes active, the entire line goes reverse-video.

  The bottom row is always reserved as a status bar (like vim's command
  line). It is not part of the scroll area or line numbering. It shows
  the search prompt, match count, or loading indicator. Blank when idle.

LINE NUMBERS
  Lines show relative number (distance from cursor) and absolute number,
  matching vim's relativenumber + number.

PATHSPECS
  Arguments after -- are passed as git pathspecs to filter commits.
  Example: gli -- src/main.ts
`

async function main() {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    console.log(HELP)
    process.exit(0)
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('gli requires a terminal')
    process.exit(1)
  }

  enterRawMode()
  enterAltScreen()
  hideCursor()

  const size = getTermSize()
  const pathspecs = parsePathspecs(process.argv)

  process.stdout.write(render(createInitialState([], size.height, size.width, new Map(), new Set())))

  const [commits, branchTips, unpushedShas] = await Promise.all([
    getAllCommits(pathspecs),
    getBranchTips(),
    getUnpushedShas(),
  ])

  let state = createInitialState(commits, size.height, size.width, branchTips, unpushedShas)

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

          if (state.fileCursorIndex !== null) {
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

      if ((action.type === 'expand' || action.type === 'toggle-expand' || action.type === 'enter-file-cursor' || action.type === 'search-next' || action.type === 'search-prev') && state.expandedIndex !== null) {
        const expandedCommit = state.commits[state.expandedIndex]

        if (expandedCommit !== undefined && !expandedCommit.numstatLoaded) {
          const fetchIndex = state.expandedIndex
          const wasEnterFileCursor = action.type === 'enter-file-cursor'

          getCommitNumstat(expandedCommit.fullSha).then((numstat) => {
            state = reduce(state, {
              type: 'numstat-loaded',
              index: fetchIndex,
              numstat,
            })

            if (wasEnterFileCursor && state.expandedIndex === fetchIndex) {
              state = { ...state, fileCursorIndex: 0 }
            }

            process.stdout.write(render(state))
          })
        }
      }
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
