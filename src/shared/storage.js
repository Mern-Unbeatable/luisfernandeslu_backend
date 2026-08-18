import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Disk root for multer + generated PDFs. Served at `/uploads`. */
export const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads')

export default { UPLOAD_ROOT }
