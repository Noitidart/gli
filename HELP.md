# gli

interactive git log viewer

## Usage

```
gli [-- <pathspec>...]
```

## Cursor Contexts

`j`, `k`, `h`, `l` change meaning based on cursor position.

| Key | Folded list | Expanded subject | Non-navigable (author, date, body) | File list |
|-----|-------------|-----------------|---------------|-----------|
| `j` | Next commit | Collapse + next commit | First file (or next commit if no files) | Next file |
| `k` | Prev commit | Collapse + prev commit | Subject | Prev file |
| `h` | Nothing | Fold | Subject | Exit to subject (2nd press folds) |
| `l` | Expand + cursor to 1st file | Enter file cursor | First file | Skip to next commit |

All support count prefix (`3j`, `5k`).

**Edge behavior:**
- `j` at file list bottom: move to next commit (which collapses the current commit)
- `k` at file list top: exit to subject

**Non-navigable areas** are when a search match lands on a non-navigable line — author, date, or body — between subject and file list. The cursor sits on that line (reverse-video). Normally, cursor cannot get into here with navigation keys. Only `n`/`N` can navigate to these matches. However once in here, navigating immediately leaves the area. For example `2j` goes to 2nd file (or next commit if fewer files), `2k` goes 2 steps up (subject then prev commit).

## Scrolling

| Key | Action |
|-----|--------|
| `Ctrl+F` | Page down |
| `Ctrl+B` | Page up |
| `gg` | Jump to first commit |
| `G` | Jump to last commit |
| `{N}G` | Jump to line N (1-indexed) |

## Expand / Fold

| Key | Action |
|-----|--------|
| `zo` | Expand commit (show author, date, body, file list) |
| `zc` | Collapse expanded commit |
| `za` | Toggle expand/collapse |

### Collapse behavior

When a commit collapses (via `zc`, `h`, `j`/`k` past it, scrolling past it, etc.), any expanded search scoped to that commit is cleared. A list-level search (including `/b`, `/f`) is preserved. File selections (Space marks) are always cleared on collapse.

## Inspect

| Key | Action |
|-----|--------|
| `i` | Open `git show --ext-diff` for the commit (uses difftastic) |

What `i` shows depends on cursor position:

| Context | Diff scope | |
|---------|-----------|-|
| Folded / expanded subject | Full commit diff | |
| File cursor, cursor on unmarked file | Current file only | |
| File cursor, cursor on marked file | All marked files | (See File Selection Below) |

### File Selection

Only available inside an expanded commit's file list to show changes (i) for selected files:

| Key | Action |
|-----|--------|
| `Space` | Toggle selection mark on current file |
| `u` | Undo last mark toggle |
| `Ctrl+R` | Redo last undone mark toggle |

Selections are cleared on collapse.

## Yank

| Key | Action |
|-----|--------|
| `y` | Copy current commit's short SHA to clipboard and exit |
| `{N}y` | Copy SHA of commit at line N to clipboard and exit |

## Search

| Key | Action |
|-----|--------|
| `/` | Start forward search |
| `?` | Start backward search |
| `n` | Next match |
| `N` | Previous match |
| `Ctrl+L` | Clear highlights (query kept; `n`/`N` restores them) |
| `Escape` | Cancel search input / cancel background loading |

### Scope

Search scope is determined when you press `/` or `?`:

- **List scope** (no commit expanded): searches subjects, SHAs, and branch names across all loaded commits. Persists through expand, collapse, jumps, scrolling, and inspect. Only cleared by `Ctrl+L` or submitting a new search (opening prompt and typing doesn't clear it).
  - `/b` — also search body text
  - `/f` — search file paths only (no subject/SHA/branch)

- **Expanded scope** (commit already expanded): searches subject, body text, and file paths within the expanded commit. `n`/`N` wraps within. Cleared when collapsing or navigating away. Starting a search while expanded clears any active list search.
  - `/b` has no effect as body already included.
  - `/f` works as normal, narrows to files only.
  - Matches in non-navigable areas (body, etc) are only accessible via `n`/`N` and navigating navigates to navigable areas only following same rules.

### Restarting search

Pressing `/` or `?` while a search is active begins a new search prompt. The old query, highlights, and cursor position remain visible while you type, and only clear when you submit the search with (Enter).

- **Enter** → confirms the new search, replacing old matches. First match resolves from current position, regardless of scope.
- **Escape** → closes the prompt. 

### Navigation rules

`n`/`N` find the next/previous match relative to the current position. If the current line is itself a match, search lands on it rather than skipping to the next. Matching is line-wise — even if a line has multiple matched words, it counts as one match position. Hitting `n` again moves to the next line.

With body/file matches from list scope (`/b` & `/f` flags): matching commits auto-expand and the cursor lands on the match line. Subject-only matches do not auto-expand.

When a commit has matches in both the subject and body (or files), `n` auto-expands on the subject line so you can peek into the deeper matches. Going the other direction, `N` from a body/file match lands on the subject without auto-folding — the commit stays expanded.

If you fold a commit that still has unvisited body/file matches, `n`/`N` re-expands it instead of skipping.

### Flags

Append after a delimiter (`/`, `#`, `_`, `@`, `,`, `;`, `-`):

| Flag | Meaning |
|------|---------|
| `/!` | Search ALL commits (loads progressively; `Escape` to cancel) |
| `/b` | Include commit body text (list scope only — expanded scope already searches body) |
| `/f` | Search file paths only (no subject/SHA/branch) |

Flags can be combined with `!` in any order (`/!b` or `/b!`). `b` and `f` cannot be combined.

### Case sensitivity

Smart case by default: all-lowercase = case-insensitive; any uppercase = case-sensitive. Override with `\c` (force insensitive) or `\C` (force sensitive) anywhere in the query.

## Marks

| Key | Action |
|-----|--------|
| `m{a-z}` | Set mark at current commit (not `mm`) |
| `'{a-z}` | Jump to mark |
| `'m` | Jump to master/main branch tip (loads if needed) |
| `''` | Jump to previous position |

## Jump Stack

| Key | Action |
|-----|--------|
| `Ctrl+O` | Jump back (like vim's `Ctrl-O`) |
| `Tab` | Jump forward (like vim's `Tab`) |

`gg`, `G`, `{N}G`, searches, marks, and branch navigation push to the stack. `j`/`k` and `Ctrl+F`/`Ctrl+B` do not.

## Branch Navigation

| Key | Action |
|-----|--------|
| `]b` | Jump to next commit with a branch tip |
| `[b` | Jump to previous commit with a branch tip |

## Quit

| Key | Action |
|-----|--------|
| `q` / `Escape` | Quit gli (restores terminal) |
| `Ctrl+C` | Force quit during background loading |

During inspect (`i`), gli suspends and `git show` runs in the foreground with a pager. `q` or `Ctrl+C` there quits the pager, returning to gli. Neither exits gli directly.

## Visual Indicators

| Symbol | Meaning |
|--------|---------|
| `⬆` (green) | Unpushed commit |
| `▼` (yellow) | Commit has a body/file search match |
| `●` (green, in file list) | File is selected (marked with `Space`) |

One line is always active (reverse-video: white background, black text). When a search is active, non-matching text on the active line stays reverse-video. Matching text on non-active lines gets an inline highlight (black text, white background). When a match becomes active, the entire line goes reverse-video.

The bottom row is always reserved as a status bar (like vim's command line). It is not part of the scroll area or line numbering. It shows the search prompt, match count, or loading indicator. Blank when idle.

## Line Numbers

Lines show relative number (distance from cursor) and absolute number, matching vim's `relativenumber` + `number`.

## Pathspecs

Arguments after `--` are passed as git pathspecs to filter commits. If you want to see the unrelated commits around the commits related to these files, then don't use pathspec but use the `/f` flag.

```
gli -- src/main.ts
```

## Progressive Loading

100 commits load initially. When navigation needs to go past the last loaded commit, more are fetched — a loading indicator appears in the status bar. Press `Escape` to cancel. Navigation then resumes from the first newly loaded commit (does not continue the full count). The `!` search flag loads all remaining commits — once loaded, they stay in memory.
