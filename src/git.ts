import { spawn } from 'node:child_process'

export type FileStat = {
  path: string
  status: string
  added: number | null
  deleted: number | null
}

export type Commit = {
  shortSha: string
  fullSha: string
  author: string
  date: string
  message: string
  body: string | null
  files: FileStat[]
  numstatLoaded: boolean
}

function spawnGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`git ${args.join(' ')} failed: ${stderr}`))
      }
    })

    child.on('error', reject)
  })
}

const NAME_STATUS_RE = /^([ACDMRTX]\d*)\t(.+)$/

function extractNameStatusLines(text: string): { statusLines: string[]; rest: string } {
  const lines = text.split('\n')
  const statusLines: string[] = []

  let i = 0

  if (lines[0] === '') {
    i++
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line !== undefined && NAME_STATUS_RE.test(line)) {
      statusLines.push(line)
      i++
    } else {
      break
    }
  }

  const rest = lines.slice(i).join('\n')
  return { statusLines, rest }
}

function parseNameStatusLines(lines: string[]): FileStat[] {
  const files: FileStat[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    const match = NAME_STATUS_RE.exec(line)
    if (match === null) continue

    const status = match[1] ?? ''
    const pathPart = match[2] ?? ''

    let path: string
    if (status.startsWith('R') || status.startsWith('C')) {
      const tabIdx = pathPart.indexOf('\t')
      path = tabIdx !== -1 ? pathPart.slice(tabIdx + 1) : pathPart
    } else {
      path = pathPart
    }

    files.push({ path, status, added: null, deleted: null })
  }

  return files
}

function resolveRenamePath(path: string): string {
  const braceRename = path.match(/\{.* => (.+)\}/)
  if (braceRename !== null) {
    const prefix = path.slice(0, braceRename.index ?? 0)
    const suffix = path.slice((braceRename.index ?? 0) + braceRename[0].length)
    return prefix + braceRename[1]! + suffix
  }

  if (path.includes(' => ')) {
    const arrowIdx = path.lastIndexOf(' => ')
    return path.slice(arrowIdx + 4)
  }

  return path
}

export async function getAllCommits(pathspecs?: string[]): Promise<Commit[]> {
  const args = [
    'log',
    '--format=format:%h%x1f%H%x1f%an%x1f%ad%x1f%s%x1f%b%x00',
    '--name-status',
    '--date=short',
  ]

  if (pathspecs !== undefined && pathspecs.length > 0) {
    args.push('--', ...pathspecs)
  }

  const output = await spawnGit(args)

  const commits: Commit[] = []
  const chunks = output.split('\x00')

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    if (chunk === undefined || chunk === '') {
      continue
    }

    const { statusLines, rest } = extractNameStatusLines(chunk)

    if (commits.length > 0 && statusLines.length > 0) {
      const prev = commits[commits.length - 1]!
      const files = parseNameStatusLines(statusLines)
      files.sort((a, b) => a.path.localeCompare(b.path))
      commits[commits.length - 1] = { ...prev, files }
    }

    const cleaned = rest.startsWith('\n') ? rest.slice(1) : rest
    const parts = cleaned.split('\x1f')
    if (parts.length < 5) {
      continue
    }

    const rawBody = parts.length > 5 ? parts.slice(5).join('\x1f').trimEnd() : ''
    const body = rawBody.length > 0 ? rawBody : null

    commits.push({
      shortSha: parts[0] ?? '',
      fullSha: parts[1] ?? '',
      author: parts[2] ?? '',
      date: parts[3] ?? '',
      message: parts[4] ?? '',
      body,
      files: [],
      numstatLoaded: false,
    })
  }

  return commits
}

export async function getCommitNumstat(sha: string): Promise<Map<string, { added: number; deleted: number }>> {
  const output = await spawnGit(['diff-tree', '--numstat', '-r', '--root', sha])

  const result = new Map<string, { added: number; deleted: number }>()

  const lines = output.trim().split('\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined || line === '') continue

    const tabIdx1 = line.indexOf('\t')
    if (tabIdx1 === -1) continue
    const tabIdx2 = line.indexOf('\t', tabIdx1 + 1)
    if (tabIdx2 === -1) continue

    const added = parseInt(line.slice(0, tabIdx1), 10)
    const deleted = parseInt(line.slice(tabIdx1 + 1, tabIdx2), 10)
    const rawPath = line.slice(tabIdx2 + 1)
    const path = resolveRenamePath(rawPath)

    if (isNaN(added) || isNaN(deleted)) continue

    result.set(path, { added, deleted })
  }

  return result
}

export async function getUnpushedShas(): Promise<Set<string>> {
  const unpushed = new Set<string>()

  try {
    const output = await spawnGit(['log', '--format=%h', '@{upstream}..HEAD'])
    const lines = output.trim().split('\n')
    for (let i = 0; i < lines.length; i++) {
      const sha = lines[i]
      if (sha !== undefined && sha !== '') {
        unpushed.add(sha)
      }
    }
  } catch {
    // No upstream branch — return empty set
  }

  return unpushed
}

export async function getBranchTips(): Promise<Map<string, string[]>> {
  const branchTips = new Map<string, string[]>()

  try {
    const output = await spawnGit(['for-each-ref', '--format=%(objectname:short) %(refname:short)', 'refs/heads'])

    const lines = output.trim().split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line === undefined || line === '') {
        continue
      }

      const spaceIdx = line.indexOf(' ')
      if (spaceIdx === -1) {
        continue
      }

      const sha = line.slice(0, spaceIdx)
      const branch = line.slice(spaceIdx + 1)

      const existing = branchTips.get(sha)
      if (existing !== undefined) {
        existing.push(branch)
      } else {
        branchTips.set(sha, [branch])
      }
    }
  } catch {
    // No branches or no repo — return empty map
  }

  return branchTips
}
