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

After splitting on `\x00`, the numstat lines for commit N appear at the **start**
of chunk N+1 (not in the same chunk as the commit fields). Each chunk is scanned
top-down for numstat lines before parsing the commit fields that follow.

The body text (from `%b`) is multi-line. They match the pattern
`\d+\t\d+\t<path>` or `-\t-\t<path>` (binary files).

## Merge commits

`git log --numstat` (without `-m`) outputs **no numstat lines** for merge
commits. We deliberately do **not** use `-m` because it produces duplicate
entries (one diff per parent) which would corrupt parsing.

The individual commits brought in by a merge **do** appear in the log with their
own numstat lines (since gli runs without `--first-parent`). No information is
lost — the user can expand those individual commits to see their file stats.

This is different from GitHub, which diffs the merge commit against its first
parent. GitHub's view is useful but adds complexity; the current approach covers
all information via the individual commits.

## Root commits

`git log --numstat` also outputs no numstat lines for root commits. Unlike merge
commits, there are no "other commits in the log" to look at — the root commit is
the only way to see what was initially created.

After batch parsing, `getCommitsWithBody()` detects commits with empty file lists
and runs `diff-tree --numstat -r --root <sha>` for each in parallel. Root commits
return results; merge commits return empty. This populates root commit files
without affecting the main git log command.

## Fallback

`getCommitDetail()` in main.ts remains as a fallback for edge cases where
`files` is still `null` after the batch load.
