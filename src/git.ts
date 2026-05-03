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

export async function getTotalCount(): Promise<number> {
  try {
    const output = await spawnGit(['rev-list', '--count', 'HEAD'])
    return parseInt(output.trim(), 10)
  } catch {
    return 0
  }
}

export async function getCommits(skip: number, maxCount: number): Promise<Commit[]> {
  const output = await spawnGit([
    'log',
    '--format=format:%h%x1f%H%x1f%an%x1f%ad%x1f%s%x00',
    '--date=short',
    `--skip=${skip}`,
    `--max-count=${maxCount}`,
  ])

  const commits: Commit[] = []
  const chunks = output.split('\x00')

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    if (chunk === undefined || chunk === '') {
      continue
    }

    const cleaned = chunk.startsWith('\n') ? chunk.slice(1) : chunk
    const fields = cleaned.split('\x1f')
    if (fields.length < 5) {
      continue
    }

    commits.push({
      shortSha: fields[0] ?? '',
      fullSha: fields[1] ?? '',
      author: fields[2] ?? '',
      date: fields[3] ?? '',
      message: fields[4] ?? '',
      body: null,
      files: null,
    })
  }

  return commits
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
