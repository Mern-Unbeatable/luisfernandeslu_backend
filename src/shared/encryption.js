import crypto from 'node:crypto'
import { env } from '../config/env.js'

function getSecretKey() {
  const secret = env.jwt.secret || 'construpreco-secret-smtp-encryption-key-32'
  return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encrypt a string using AES-256-GCM.
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptText(plainText) {
  if (!plainText) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * Decrypt a string created by encryptText.
 */
export function decryptText(encryptedText) {
  if (!encryptedText) return ''
  try {
    const parts = String(encryptedText).split(':')
    if (parts.length !== 3) return encryptedText // not encrypted / legacy plain
    const iv = Buffer.from(parts[0], 'base64')
    const authTag = Buffer.from(parts[1], 'base64')
    const encrypted = Buffer.from(parts[2], 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
  } catch (err) {
    console.error('[encryption] Decrypt failed:', err.message)
    return ''
  }
}
