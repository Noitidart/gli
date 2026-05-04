# Status Bar

The bottom row of the terminal is always reserved as a status bar, like vim's command line. It is not part of the scroll area, line numbering, or commit list.

## Layout

```
┌─────────────────────────────────┐
│  Commit list / expanded view    │  ← content area (scrollOffset + termHeight - 1)
│  ...                            │
│  ...                            │
│  Current commit (cursor)        │
├─────────────────────────────────┤
│  Status bar                     │  ← always reserved, never scrolls
└─────────────────────────────────┘
```

The content area uses `termHeight - 1` lines. The status bar is always the last row.

## What it shows

| State | Content |
|-------|---------|
| Idle | Blank |
| Search input | `/query` or `?query` in reverse-video |
| Search confirmed | `match N of M` or `No matches` |
| Loading all (`/!`) | Spinner + progress: `⠋ Searching all commits... 200/1500` |
| Pending mark jump (`'m`) | Spinner + progress: `⠋ Finding master... 300/1500` |
| Loading more commits | Spinner + indicator (pending fix #8) |

## Why always reserved

In vim, the command line is always at the bottom — the content area never shifts. gli follows the same principle:

- **No layout jumps**: entering/leaving search doesn't resize the content area
- **Predictable scrolling**: scroll offset and visible lines are always `termHeight - 1`
- **Consistent UX**: the bottom row is always the place to look for status

Previously the status bar was only shown conditionally (`hasActiveBar`), causing the content area to grow/shrink by one line. This created visual instability.
