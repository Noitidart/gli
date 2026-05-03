import { spawn } from 'node:child_process'

export function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pbcopy', [], {
      stdio: ['pipe', 'ignore', 'pipe'],
    })

    let stderr = ''

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.stdin.write(text)
    child.stdin.end()

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`pbcopy failed: ${stderr}`))
      }
    })

    child.on('error', reject)
  })
}
