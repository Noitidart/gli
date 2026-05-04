# Code Fixes Needed

Issues found while documenting rules for the help text.

## 1. `moveRel` ignores count in body match

**File:** `src/state.ts`

```typescript
function moveRel(state: UiState, direction: 'down' | 'up', count: number): UiState {
  if (isInBodyMatch(state)) {
    return direction === 'down' ? moveDown(state) : moveUp(state)
  }
```

Count is ignored — always calls `moveDown`/`moveUp` once. Should support count so `3j` from body match moves down 3 times (e.g., skip past 3 body match lines to reach further into the file list or commit list).

## 2. Scrolling always collapses expanded commit

**File:** `src/state.ts` — `pageDown`, `pageUp`, `jumpTop`, `jumpBottom`, `jumpLine`

All five functions unconditionally set `expandedIndex: null`. They should preserve `expandedIndex` if the expanded commit is still in view after the scroll — only collapse if the cursor lands outside it.

## 3. Invalid flag combos silently ignored

**File:** `src/state.ts:931-940`

`validFlags` only includes specific combos like `!b`, `b!`, etc. If the user types an invalid combo like `/foo/bf`, `validFlags.includes(flagPart)` is false, so the flags are silently ignored and "bf" becomes part of the search pattern. Should show an error instead.

## 4. Jump stack pushing is not explicit

**File:** `src/state.ts`

`jumpTop`, `jumpBottom`, `jumpLine`, and `applyJump` all manually spread `jumpStack: [...state.jumpStack, state.cursorIndex]`. `pageDown`/`pageUp` and `moveRel` don't. This vim-correct behavior is implicit — you have to read each function to know what pushes. Should extract a helper like `shouldPushToJumpStack(action)` or `withJump(state)` to make the rule explicit and self-documenting.

## 5. Search resolves past current line instead of checking it first

**File:** `src/state.ts` — `resolveListActiveIndex`

Forward search uses `mi > cursorIndex`, skipping the current commit even if it matches. In vim, `/foo` with the cursor on a matching line stays there — only `n` moves to the next. Should first check if current position is a match and land on it.

## 6. Expanded scope doesn't search author and date

**Files:** `src/state.ts`, `src/render.ts`

`computeExpandedMatches` only searches subject, body, and file paths. Author and date are visible in expanded view but not searchable. Should add `{ type: 'author' }` and `{ type: 'date' }` match types to `ExpandedMatch`, update `TYPE_ORDER` to `{ subject: 0, author: 1, date: 2, body: 3, file: 4 }`, and add matching logic to `computeExpandedMatches`.

These match types follow the same non-navigable area rules as body matches: `n`/`N` lands on the line (reverse-video), `j`/`k`/`h`/`l` move to navigable areas. Rename `isInBodyMatch` to `isInNonNavigable` and include author/date types.

The render needs to highlight the author/date line when matched — same pattern as body match lines (active = reverse-video, non-active = inline highlight). The author/date line is rendered at `render.ts:234` as a single line `${indent}Author: ${commit.author}    ${commit.date}`.

## Unrelated: `/b` match count shows scoped count, not total

When searching with `/b` (list scope with body), the match count displayed in the status bar only reflects matches in the currently expanded commit's scope, not the total across all commits. Since `/b` is a list-scope search that spans all loaded commits, the count should reflect all matches across commits, not just the ones visible in the current expanded view.

## Unrelated: Full SHA matches invisible to user

List scope search matches against both `shortSha` and `fullSha`. The full SHA (40 hex chars) is never displayed but almost always contains common hex digits like `1`, `a`, `e`, etc. Searching for a digit or letter can match a commit's full SHA with no visible indication of why it matched. Should either exclude `fullSha` from matching or show the full SHA match visually.

## 7. `h` from non-navigable area folds instead of going to subject

**File:** `src/state.ts` — `exitFileCursor` (line ~586)

When in a non-navigable area (body/author/date match, `fileCursorIndex === null`), `h` goes straight to fold. It should go to subject first, then fold on second press — same two-step pattern as `h` from file list.

## 8. No visual feedback when loading more commits at bottom

**Files:** `src/state.ts`, `src/main.ts`, `src/render.ts`

When the cursor reaches the last loaded commit, `isLoadingMore` is a local variable in `main.ts` — render can't access it. Should move to `UiState.loadingMore` so the render can show a "Loading..." spinner in the status bar. Also add Escape-to-cancel support, same as `/!` load-all.

## 9. Status bar should always be reserved like vim

**Files:** `src/render.ts`, `src/state.ts`

Currently the bottom row is only reserved when `hasActiveBar()` returns true, causing the content area to shift by one line when entering/leaving search. Should always reserve the bottom row — like vim's command line. The status bar is not part of the scroll area or line numbering. When empty, it renders as blank. This eliminates layout jumps and provides a consistent place for status info (search prompt, match count, loading spinner, etc.).
