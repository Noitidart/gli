import { spawn } from 'node:child_process'

export type FileStat = {
  path: string
  added: number
  deleted: number
}

export type Commit = {
  shortSha: string
  fullSha: string
  author: string
  date: string
  message: string
  body: string | null
  files: FileStat[] | null
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

export async function getTotalCount(pathspecs?: string[]): Promise<number> {
  try {
    const args = ['rev-list', '--count', 'HEAD']
    if (pathspecs !== undefined && pathspecs.length > 0) {
      args.push('--', ...pathspecs)
    }
    const output = await spawnGit(args)
    return parseInt(output.trim(), 10)
  } catch {
    return 0
  }
}

const NUMSTAT_RE = /^(\d+|-)\t(\d+|-)\t(.+)$/

function extractNumstatFromChunk(text: string): { numstatLines: string[]; rest: string } {
  const lines = text.split('\n')
  const numstatLines: string[] = []

  let i = 0

  if (lines[0] === '') {
    i++
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line !== undefined && NUMSTAT_RE.test(line)) {
      numstatLines.push(line)
      i++
    } else {
      break
    }
  }

  const rest = lines.slice(i).join('\n')
  return { numstatLines, rest }
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

function parseNumstatLines(lines: string[]): FileStat[] {
  const files: FileStat[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    const match = NUMSTAT_RE.exec(line)
    if (match === null) continue

    const added = parseInt(match[1] ?? '', 10)
    const deleted = parseInt(match[2] ?? '', 10)

    if (isNaN(added) || isNaN(deleted)) continue

    const path = resolveRenamePath(match[3] ?? '')

    files.push({ path, added, deleted })
  }

  return files
}

export async function getCommitsWithBody(skip: number, maxCount: number, pathspecs?: string[]): Promise<Commit[]> {
  const args = [
    'log',
    '--format=format:%h%x1f%H%x1f%an%x1f%ad%x1f%s%x1f%b%x00',
    '--numstat',
    '--date=short',
    `--skip=${skip}`,
    `--max-count=${maxCount}`,
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

    const { numstatLines, rest } = extractNumstatFromChunk(chunk)

    if (commits.length > 0 && numstatLines.length > 0) {
      const prev = commits[commits.length - 1]!
      commits[commits.length - 1] = { ...prev, files: parseNumstatLines(numstatLines) }
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
    })
  }

  return commits
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

export async function getCommitDetail(sha: string): Promise<{ body: string; files: FileStat[] }> {
  const [bodyOutput, statsOutput] = await Promise.all([
    spawnGit(['log', '-1', '--format=%b', sha]),
    spawnGit(['diff-tree', '--numstat', '-r', sha]),
  ])

  const files: FileStat[] = []

  const lines = statsOutput.trim().split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined || line === '') {
      continue
    }

    const parts = line.split('\t')
    if (parts.length < 3) {
      continue
    }

    const added = parseInt(parts[0] ?? '', 10)
    const deleted = parseInt(parts[1] ?? '', 10)
    const path = parts[2] ?? ''

    if (isNaN(added) || isNaN(deleted)) {
      continue
    }

    files.push({ path, added, deleted })
  }

  return { body: bodyOutput.trimEnd(), files }
}
