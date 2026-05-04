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

## Body Search Flag (`/b`)

The `b` flag extends list search to include commit bodies. It is independent of the `!` (search all) flag and combines with it freely.

### Flag Combinations

| Input | Scope | Body | Commits searched |
|-------|-------|------|-----------------|
| `/foo` | list | no | loaded only |
| `/foo/b` | list | **yes** | loaded only (bodies must already be loaded) |
| `/foo/!` | list | no | all (loads remaining commits) |
| `/foo/!b` or `/foo/b!` | list | **yes** | all (loads remaining commits with bodies) |

### How it works

**List search with body** (`/b` flag): `computeListMatches` also searches each commit's `body` field. Commits where `body` is `null` (not yet lazy-loaded) are skipped. When `searchBody` is true, `bodyMatchIndices` tracks which matching commits have the match in their body (as opposed to subject/SHA/branch only).

**Search all with body** (`/!b`): The batch loading loop uses `getCommitsWithBody` instead of `getCommits`. This uses format `%h%x1f%H%x1f%an%x1f%ad%x1f%s%x1f%b%x00` to include `%b` (body) in the same `git log` call. Bodies are parsed and stored on commit objects as they load. No extra git calls — same batch count, just more data per call.

### Body Match Indicator

When a commit has a body match, a yellow `▼` appears in a new column at the far left of the folded subject line. This column sits before the relative number column.

Format (new column in brackets):
```
[▼] {relStr} {dot} {numStr}  {sha}  {branchStr}  {message}
```

- Yellow `▼` (`\x1b[33m▼\x1b[0m`) when the commit has a body match
- Space otherwise

The overhead calculation adds 2 to account for the indicator and its trailing space.

### Body Match Navigation

Body matches follow the same "don't skip the current commit" pattern as the list-search-while-expanded rules (see below). `n`/`N` never skip a body match on the current commit when it makes sense to stop on it.

#### Auto-expand on landing

When `n`/`N` navigates to a commit that has a body match:

1. **Auto-expand** the commit
2. **Compute expanded matches** for that commit (subject, body, files)
3. **Navigate to the first relevant match**:
   - If the subject also matches → land on subject line first; next `n` moves into body matches
   - If only body matches → land directly on the first body match line
4. Continue through all body matches within the expanded commit
5. **Auto-fold** when all matches in this commit are exhausted and `n`/`N` moves to the next commit

#### Re-expand when folded on body match

If the user folds a body-expanded commit (via `h`) and then presses `n`/`N`, the commit re-expands to its body match instead of jumping to the next commit. This is because the current commit still has an unvisited body match — same principle as the list-search-while-expanded rule: don't skip what's under the cursor.

The next `n`/`N` after re-expanding continues through the expanded matches. When all are exhausted, the commit folds and moves to the next matching commit.

#### Expanded match cycle (fold-and-continue)

When navigating expanded matches within an auto-expanded commit, pressing `n`/`N` checks whether the next match would wrap around:

- **Would wrap** → auto-fold the current commit and resume list search from the next matching commit
- **Would not wrap** → move to the next expanded match (body line, subject, or file)

The wrap check is guarded by `activeIndex >= 0`. When `activeIndex` is -1 (cursor on subject, no expanded match active), the wrap check is skipped — `n`/`N` always resolves the next expanded match rather than prematurely folding.

#### No-man's land

Body lines sit between the subject and file list — an area with no real cursor position. When the active match lands on a body line, only that body line shows the cursor highlight. The subject's normal cursor highlight is suppressed to avoid two highlighted lines.

From this state:
- `k` moves the cursor to the subject (navigates the search match to the subject)
- `j` moves the cursor to the first file in the list
- `l` moves to the first file (same as `j`)
- `h` folds/collapses

Once the cursor leaves the body line (via `j` or `k`), the body match drops from full reverse-video to partial inline highlight. Only one cursor line exists at any time.

#### Example

```
User types: /fix/b
Matches: commit 3 (body), commit 7 (subject), commit 12 (body + subject)

n → Jump to commit 3, auto-expand, cursor on body match line
n → Next body match in commit 3 (or fold + jump to commit 7 if only one)
n → Auto-fold commit 3, jump to commit 7, expand, land on subject (no body match here)
n → Auto-fold commit 7, jump to commit 12, expand, land on subject
n → Move to body match in commit 12
n → Auto-fold commit 12, wrap to commit 3...

After h (fold) on commit 3:
n → Re-expand commit 3, cursor on body match line (doesn't skip to commit 7)
```

## Case Sensitivity

Smart case by default: all-lowercase queries are case-insensitive; any uppercase letter makes it case-sensitive. Override with `\c` (force insensitive) or `\C` (force sensitive) anywhere in the query.

## Restarting Search (pressing `/` or `?` while search is active)

When the user presses `/` or `?` while a search is already active, the new search starts without disrupting the current view. The old highlights and cursor position remain stable while typing the new query.

### How it works

Three fields on `SearchState` support this:

- **`savedScope`** — stores the previous search scope (`'list'` or `'expanded'`) before the new search input begins. Used to restore the old search on cancel.
- **`searchFrom`** — stores the current active match position (an `ExpandedMatch`: subject, body line, or file index) when restarting an expanded search. Used to resolve the first match of the new search relative to the user's current position.
- **Preserved state** — `searchStart` spreads the existing search state instead of resetting it, so `query`, `listMatches`, `bodyMatchIndices`, `activeIndex`, etc. all persist.

### Behavior during input

- **Old highlights stay visible** — the render continues using the preserved `query` and `expandedMatches`/`listMatches` while the new prompt is being typed.
- **Cursor does not move** — the old `activeIndex` and `fileCursorIndex` remain unchanged during typing.
- **Expanded scope: prompt-only updates** — for expanded scope, `searchInput` only updates `prompt`. It does not recompute `expandedMatches` or change `activeIndex`. This prevents the active match from jumping around as the partial query changes the match set.
- **List scope: incremental computation** — for list scope, `searchInput` still computes `listMatches` incrementally. This is safe because the list view doesn't render an active match during input mode (just text highlights), so there's no visual jumping.

### On confirm

- **Expanded scope**: `searchConfirm` recomputes `expandedMatches` from the confirmed query (not from the stale matches). It resolves `activeIndex` using `resolveExpandedFromPosition(matches, searchFrom, direction)`, which finds the first match strictly after the saved position. For forward: first match with a higher position rank (subject < body lines < files). For backward: first match with a lower rank. Wraps if no match exists past the position.
- **List scope**: `searchConfirm` resolves from `cursorIndex` using `resolveListActiveIndex` as usual.

### On cancel

- If `savedScope` is set, `searchCancel` recomputes matches from the preserved `query` and restores the original scope. This fully reconstructs the previous search state.
- If no previous search existed (`query === null`), the search is cleared entirely.

### Position ordering for expanded matches

Expanded matches have a natural order: subject → body lines (by line number) → files (by index). The helpers `isMatchAfterPosition` and `isMatchBeforePosition` compare matches using `TYPE_ORDER` ({ subject: 0, body: 1, file: 2 }) and within-type ordering (body line numbers, file indices).

## List Search While Expanded

When a list search is active and the user expands a matching commit, then enters the file list, pressing `N` (going backward/upward) first lands on the expanded commit's subject match before continuing to the previous commit on the next press. This prevents skipping the current commit's visible subject highlight.

Forward navigation (`n`) from the file list with a list search jumps directly to the next matching commit, collapsing the expansion.

The body re-expand rule follows the same pattern: when the cursor is on a folded commit that has a body match, `n`/`N` re-expands it instead of jumping past — because the match under the cursor hasn't been visited yet.

## Expand vs. Navigate

There is a clear separation between opening a commit and navigating to a search match within it.

### Opening does not navigate

`zo`/`za` (expand/toggle-expand) and `l` (enter file cursor) open the commit but **do not jump to matches**. The `restoreBodySearchExpanded` and `restoreFileSearchExpanded` functions set up highlights only — they compute `expandedMatches` and set `scope: 'expanded'`, but always set `activeIndex: -1` and do not move `fileCursorIndex`. The cursor lands where the opening command naturally puts it:
- `zo`/`za` → subject line (`fileCursorIndex: null`)
- `l` → first file in the list (`fileCursorIndex: 0`)

### Only n/N navigates to matches

`n`/`N` use `navigateToBodyMatch`/`navigateToFileMatch`, which auto-expand, compute matches, set `activeIndex` to the matched position, and move `fileCursorIndex` to the matching file. This is the only path that jumps to a specific match.

### h from file-match line

When expanded search is active and the only matches are file-type (e.g., `/f` search with no body/subject matches), pressing `h` from a file-match line goes to the subject line — not to collapse the commit. The commit stays expanded with `fileCursorIndex: null` and `activeIndex: -1`. A second `h` then folds the commit. This matches normal `h` behavior: first press exits the file list, second press folds.

If the expanded matches include body or subject matches, `h` from a file-match line navigates to the subject match instead (same as the existing body-match behavior).

## Search Persistence Through Collapse

`preserveListSearch` keeps any active search (`query !== null`) alive when collapsing or navigating away from an expanded commit. It sets `scope: 'list'` and clears `expandedMatches`/`activeIndex`, but preserves `query`, `listMatches`, `bodyMatchIndices`, `fileMatchIndices`, `searchBody`, and `searchFiles`. If `listMatches` is empty (because the search was started in expanded scope and never computed list matches), they are lazily recomputed by `searchNext`/`searchPrev`/`foldAndContinueSearch` when needed.

## Status Bar

When search is active (input mode or confirmed with highlights visible), a status bar occupies the bottom row of the screen. During input it shows the prompt (`/` or `?` plus typed text) in reverse-video. After confirm it shows match count (`match 3 of 12`) or `No matches`. The content area shrinks by one row to make room.
