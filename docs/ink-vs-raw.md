# Ink vs Raw Terminal: Rewrite Decision

## What Ink Gives You

### Search Input
Currently `main.ts:628-688` is ~60 lines manually handling printable chars, backspace, escape, enter for a text prompt. `ink-text-input` does this in one component.

### Spinner
`render.ts:7-12` and `main.ts:645-648` hand-roll a spinner with `setInterval` + frame counter. `ink-spinner` does this.

### Layout Math
`render.ts:19-23` manually computes `numWidth`, `shaWidth`, `branchWidth`, `indent`, `overhead`, `maxMsgLen`, `maxFileLen` to align columns. Ink's `<Box>` + Flexbox handles column alignment.

### Terminal Lifecycle
`terminal.ts` is 47 lines managing alt screen, raw mode, cursor show/hide, cleanup on exit. Ink handles this.

### Resize Handling
`main.ts:890-894` manually listens for resize and updates state. Ink re-renders automatically on resize.

### Truncation/Padding
`render.ts:354-358` and scattered `padEnd(termWidth)` calls. Ink's `<Text wrap="truncate">` handles this.

## What Ink Does NOT Help With

- **Byte-level vim input parsing** — ink's `useInput` doesn't handle `gg`, `3j`, `za` sequences. You'd still parse raw stdin manually.
- **State machine** — the reducer stays manual.
- **Git data layer** — `git.ts` is clean already.

## Testability: Component Trees vs Escape Code Soup

This is the biggest practical benefit of ink for a rewrite.

### Testing Raw ANSI Output

The current `render()` function returns a string like:

```
\x1b[7m ⬆\x1b[0m   1  2  abc1234  <main>       fix: handle edge case in parser\x1b[0m
\x1b[7mLoading more commits...\x1b[0m
```

To test "does the expanded commit show the author?", you write:

```typescript
const state = makeState({ expandedIndex: 0 })
const output = render(state)
expect(output).toContain('Author: John Doe')
```

This is fragile. It breaks if:

- You change color codes (e.g. swap `\x1b[7m` for a different style)
- You change padding or column widths
- You reorder how fields are rendered
- The terminal width changes the truncation

You're testing a serialized string, not the structure of what's displayed. The test doesn't know *where* the author appears, just that the substring exists somewhere in a wall of escape codes.

### Testing Ink Component Trees

With ink, rendering produces a component tree, not a string. You can test structure:

```typescript
const { lastFrame } = render(<App state={state} />)

// ink-testing-library gives you the final output
expect(lastFrame()).toContain('Author: John Doe')
```

But the real win is testing individual components in isolation:

```typescript
// Test the commit row component
render(<CommitRow commit={commit} isActive={true} />)

// Test the file list component
render(<FileList files={files} cursorIndex={2} />)

// Test the search bar component
render(<SearchBar query="fix" direction="forward" />)
```

Each component is a pure function of its props. You test:

- "given these props, does it render the SHA?"
- "given `isActive={true}`, does it apply the right style?"
- "given a search match, does it highlight the right substring?"

You never deal with escape codes in tests. Ink handles the mapping from style props (`bold`, `backgroundColor`, `wrap`) to ANSI codes internally. Your tests assert on the *what*, not the *how*.

### Practical Example

Current test for "cursor line should be reverse-video":

```typescript
const output = render(state)
const lines = output.split('\r\n')
const cursorLine = lines[state.cursorIndex]
expect(cursorLine).toMatch(/\x1b\[7m/)       // has reverse video
expect(cursorLine).not.toMatch(/\x1b\[0m.*\x1b\[7m/) // no un-reverse in middle? good luck
```

Ink equivalent:

```typescript
const { lastFrame } = render(<CommitRow commit={commit} isActive={true} />)
// ink-testing-library strips ANSI codes by default
expect(lastFrame()).toMatchSnapshot()
```

Or with `ink-testing-library`'s structured output, you can assert the active row has a specific `backgroundColor` prop without caring about the escape code.

### Why This Matters for gli

gli has ~30 distinct visual states:

- Folded commit, active vs inactive
- Expanded commit with author/date/body/files
- File cursor active vs inactive
- Search highlights active vs cleared
- Match on subject vs body vs file
- Loading spinner states
- Search input mode
- Unpushed indicator

Testing transitions between these states with raw ANSI strings means writing assertions against `toContain` and regex on escape-code-laden strings. It's doable but fragile and low-signal. Component-level tests give you precise, refactor-safe assertions on each visual piece independently.

## The Tradeoff

- Save ~150-200 lines of terminal/rendering boilerplate
- Gain testability on the view layer
- Add ~30 npm dependencies
- Lose some rendering control (ink's reconciliation adds a thin layer between you and stdout)

## Recommendation

Given a rewrite is happening regardless, ink is the better choice. The rendering boilerplate is the most tedious part to rewrite, the testability gain is real, and the two hardest parts (input parser, state machine) stay manual either way.
