/**
 * Copy every file under backend/uploads to Cloudflare R2 (public or private
 * bucket by folder). Stored `/uploads/...` URLs keep working: the server
 * redirects to R2 once the local copy is gone.
 *
 *   pnpm storage:migrate-r2                 # copy, keep local files
 *   pnpm storage:migrate-r2 --delete-local  # copy, then delete local copies
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  UPLOAD_ROOT,
  isPrivateUploadKey,
  isR2Enabled,
  putObject,
  uploadKeyFromPath,
} from '../shared/storage.js'

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

async function main() {
  if (!isR2Enabled()) {
    console.error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_URL.',
    )
    process.exit(1)
  }
  if (!fs.existsSync(UPLOAD_ROOT)) {
    console.log('No uploads folder, nothing to migrate.')
    return
  }

  const deleteLocal = process.argv.includes('--delete-local')
  const counts = { uploaded: 0, failed: 0, publicFiles: 0, privateFiles: 0 }

  for (const full of walk(UPLOAD_ROOT)) {
    const key = uploadKeyFromPath(full)
    if (!key) continue
    try {
      const contentType =
        CONTENT_TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream'
      await putObject(key, fs.readFileSync(full), contentType)
      counts.uploaded += 1
      counts[isPrivateUploadKey(key) ? 'privateFiles' : 'publicFiles'] += 1
      if (deleteLocal) fs.rmSync(full, { force: true })
    } catch (err) {
      counts.failed += 1
      console.error(`FAILED ${key}: ${err.message}`)
    }
  }

  console.log(
    `Uploaded ${counts.uploaded} files (${counts.publicFiles} public, ${counts.privateFiles} private), ${counts.failed} failed.`,
  )
  if (!deleteLocal) {
    console.log('Local copies kept. Re-run with --delete-local once R2 links are verified.')
  }
  if (counts.failed) process.exitCode = 1
}

main()
