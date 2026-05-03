# Search

## Overview

Vim-style incremental search with two scopes determined by context. Press `/` to search forward, `?` to search backward. Results highlight as you type. Press Enter to confirm, Escape to cancel. `n`/`N` navigate matches. `Ctrl+L` clears highlights (query kept; `n`/`N` restores them).

## Scopes

### List Search

Started when the cursor is on a folded commit. Searches all loaded commits by subject line, SHA (short and full), and branch names. Does not search body text or file paths.

`n`/`N` jump between matching commits. If a commit is expanded when `n`/`N` is pressed, the expansion collapses and the cursor moves to the next match — unless the expanded commit is itself a match and the direction is upward (toward the subject). In that case, if the user is in the file list, the first press exits the file cursor and lands on the subject match; the next press continues to the previous matching commit.

**List search persists through everything** — expanding, collapsing, j/k, jumps, page movements. Only cleared by `Ctrl+L` or starting a new search.

When expanded with a list search active, highlights remain visible on folded commits in view. The expanded commit's subject line also shows the highlight if it matches.

### Expanded Search

Started when a commit is already expanded. Searches the expanded commit's subject line, body text (line by line), and file paths.

`n`/`N` wrap through matches within the expanded commit. The active match gets full-line reverse-video. Other matches get inline highlight on the matching text.

Expanded search is cleared when collapsing or navigating away from the expanded commit.

## Case Sensitivity

Smart case by default: all-lowercase queries are case-insensitive; any uppercase letter makes it case-sensitive. Override with `\c` (force insensitive) or `\C` (force sensitive) anywhere in the query.

## Body Match Navigation (No-Man's Land)

Expanded search can match body lines, which sit between the subject and file list — an area with no real cursor position. When the active match lands on a body line, only that body line shows the cursor highlight. The subject's normal cursor highlight is suppressed to avoid two highlighted lines.

From this state:
- `k` moves the cursor to the subject (navigates the search match to the subject)
- `j` moves the cursor to the first file in the list
- `l` moves to the first file (same as `j`)
- `h` folds/collapses

Once the cursor leaves the body line (via `j` or `k`), the body match drops from full reverse-video to partial inline highlight. Only one cursor line exists at any time.

## List Search While Expanded

When a list search is active and the user expands a matching commit, then enters the file list, pressing `N` (going backward/upward) first lands on the expanded commit's subject match before continuing to the previous commit on the next press. This prevents skipping the current commit's visible subject highlight.

Forward navigation (`n`) from the file list with a list search jumps directly to the next matching commit, collapsing the expansion.

## Status Bar

When search is active (input mode or confirmed with highlights visible), a status bar occupies the bottom row of the screen. During input it shows the prompt (`/` or `?` plus typed text) in reverse-video. After confirm it shows match count (`match 3 of 12`) or `No matches`. The content area shrinks by one row to make room.
