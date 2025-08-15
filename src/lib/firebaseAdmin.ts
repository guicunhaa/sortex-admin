// src/lib/firebaseAdmin.ts
import * as admin from 'firebase-admin'

type SA = {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  auth_provider_x509_cert_url: string
  client_x509_cert_url: string
  universe_domain?: string
}

function fromJsonBase64(): SA | null {
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64
  if (!b64 || !b64.trim()) return null
  try {
    const json = Buffer.from(b64.trim(), 'base64').toString('utf8')
    const obj = JSON.parse(json) as SA
    // sanity check mínimo
    if (!obj.project_id || !obj.client_email || !obj.private_key) return null
    return obj
  } catch (e) {
    console.error('[firebaseAdmin] GAC_BASE64 inválido:', (e as Error).message)
    return null
  }
}

function fromPieces(): SA | null {
  // fallback: monta objeto com vars que já temos
  const project_id =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const client_email =
    process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL

  // private key pode vir nos 3 formatos; usamos a que existir
  const pkb64 = process.env.FIREBASE_PRIVATE_KEY_BASE64
  let private_key =
    (pkb64 && Buffer.from(pkb64, 'base64').toString('utf8')) ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.FIREBASE_PRIVATE_KEY ||
    ''

  if (!project_id || !client_email || !private_key) return null

  // normaliza PEM
  private_key = private_key
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
  if (!private_key.endsWith('\n')) private_key += '\n'

  return {
    type: 'service_account',
    project_id,
    private_key_id: 'local-env',
    private_key,
    client_email,
    client_id: 'local-env',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(
      client_email
    )}`,
  }
}

const sa = fromJsonBase64() || fromPieces()

if (!admin.apps.length) {
  if (!sa) {
    console.error('[firebaseAdmin] Credenciais ausentes ou inválidas (JSON/PEM).')
    throw new Error('firebase_admin_invalid_env')
  }
  try {
    admin.initializeApp({
      credential: admin.credential.cert(sa as any),
      projectId: sa.project_id,
    })
  } catch (e) {
    console.error('[firebaseAdmin] credential.cert falhou:', e)
    throw e
  }
}

export const adminApp = admin.apps.length ? admin.app() : undefined
export const adminAuth = admin.apps.length ? admin.auth() : (undefined as any)
export const adminDb = admin.apps.length ? admin.firestore() : (undefined as any)

export default admin