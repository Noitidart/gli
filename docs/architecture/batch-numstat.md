# Batch numstat loading

## Problem

When a commit is expanded, file stats (added/removed lines per file) are loaded
lazily via a separate `getCommitDetail()` call. This causes a "Loading..." spinner.

## Solution

Include `--numstat` in the batch `getCommitsWithBody()` git log call so file
stats are pre-loaded alongside commit metadata and body text.

## Output structure

The git log format is:

```
--format=format:%h%x1f%H%x1f%an%x1f%ad%x1f%s%x1f%b%x00
```

With `--numstat`, the numstat lines appear after the `\x00` record separator:

```
<fields separated by \x1f>\n
\x00
<numstat lines: added\tremoved\tpath>\n
<next record...>
```

After splitting on `\x00`, each chunk contains:

```
<\x1f-separated fields>\n<numstat lines>\n
```

The body text (from `%b`) is multi-line. Numstat lines are separated from the
body by appearing after all body content. They match the pattern
`\d+\t\d+\t<path>` or `-\t-\t<path>` (binary files).

## Merge commits and root commits

`git log --numstat` (without `-m`) outputs **no numstat lines** for merge
commits and root commits. This is consistent with the existing `getCommitDetail()`
which uses `diff-tree --numstat -r` (also without `-m`) and also returns empty
output for these cases.

The individual commits brought in by a merge **do** appear in the log with their
own numstat lines (since gli runs without `--first-parent`). No information is
lost — only the merge commit itself shows an empty file list, which matches
current behavior.

We deliberately do **not** use `-m` because it produces duplicate entries (one
diff per parent) which would corrupt parsing.

## Fallback

`getCommitDetail()` in main.ts remains as a fallback for edge cases where
`files` is still `null` after the batch load.
