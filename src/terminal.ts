let isRawMode = false
let isAltScreen = false

export function enterRawMode(): void {
  process.stdin.setRawMode(true)
  isRawMode = true
}

export function enterAltScreen(): void {
  process.stdout.write('\x1b[?1049h')
  isAltScreen = true
}

export function exitAltScreen(): void {
  process.stdout.write('\x1b[?1049l')
  isAltScreen = false
}

export function hideCursor(): void {
  process.stdout.write('\x1b[?25l')
}

export function showCursor(): void {
  process.stdout.write('\x1b[?25h')
}

export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H')
}

export function restoreTerminal(): void {
  if (isAltScreen) {
    exitAltScreen()
  }
  if (isRawMode) {
    process.stdin.setRawMode(false)
    isRawMode = false
  }
  showCursor()
}

export function getTermSize(): { height: number; width: number } {
  return {
    height: process.stdout.rows,
    width: process.stdout.columns,
  }
}
