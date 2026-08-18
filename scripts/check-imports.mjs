/**
 * Import-loads every module file so syntax errors, bad import paths and
 * removed-but-still-referenced helpers surface without booting the server.
 *
 * Run with tsx, since the generated Prisma client is resolved by it:
 *   npx tsx scripts/check-imports.mjs
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(process.cwd(), 'src')
const SKIP = new Set(['generated', 'data', 'scripts'])

async function collect(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await collect(full, files)
    else if (entry.name.endsWith('.js')) files.push(full)
  }
  return files
}

const files = (await collect(ROOT)).sort()
const failures = []

for (const file of files) {
  try {
    await import(pathToFileURL(file).href)
  } catch (err) {
    failures.push({ file: path.relative(process.cwd(), file), message: err.message })
  }
}

console.log(`Checked ${files.length} files.`)

if (failures.length) {
  console.error(`\n${failures.length} file(s) failed to load:\n`)
  for (const { file, message } of failures) {
    console.error(`  ${file}\n    ${message.split('\n')[0]}`)
  }
  process.exit(1)
}

console.log('All modules load cleanly.')
process.exit(0)
