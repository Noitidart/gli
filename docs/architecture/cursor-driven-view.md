# Cursor-Driven View

gli has no explicit "open" or "close" concept. The view renders based on cursor position.

## Rule

When the cursor enters an expanded commit's area (subject, body, file list), the view renders that commit expanded. When the cursor leaves, the commit folds.

All navigation (j/k, n/N, marks, jumps, scrolling) just moves the cursor. Expand/fold is a side effect of where the cursor lands.

## Exception: Manual Expand

`zo` and `za` from subject force an expand without moving the cursor into the file list. This is the only manual open — the cursor stays on subject, but the commit opens.

`zc` and `h` force a fold regardless of cursor position. These are manual closes.

## What This Means For Key Behavior

The h/j/k/l table in help is a consequence of this rule:

- `j` from subject → cursor moves to next commit (outside expanded area) → folds
- `k` from subject → cursor moves to prev commit (outside expanded area) → folds
- `l` from folded → cursor moves to first file (inside expanded area) → expands
- `h` from file list → cursor exits to subject → stays expanded (still in area)
- `h` from subject → forces fold (manual close)
