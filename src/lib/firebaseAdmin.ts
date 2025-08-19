// src/lib/firebaseAdmin.ts
import * as admin from 'firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

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

function saFromPieces(): SA | null {
  const project_id = process.env.FIREBASE_ADMIN_PROJECT_ID
  const client_email = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  let private_key = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (!project_id || !client_email || !private_key) return null

  // normaliza quebras de linha e aspas
  private_key = private_key
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
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(client_email)}`,
  }
}

function saFromBase64(): SA | null {
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64
  if (!b64 || !b64.trim()) return null
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8')
    const parsed = JSON.parse(json)
    if (!parsed.private_key || !parsed.client_email) throw new Error('Credencial base64 inválida')
    return parsed
  } catch (e: any) {
    console.error('[firebaseAdmin] GAC_BASE64 inválido:', e?.message)
    return null
  }
}

if (!admin.apps.length) {
  try {
    const fromPieces = saFromPieces()
    const fromB64 = saFromBase64()

    if (fromB64 || fromPieces) {
      admin.initializeApp({
        credential: admin.credential.cert((fromB64 ?? fromPieces)!),
      })
    } else {
      // Fallback: ADC — cobre Workload Identity, GOOGLE_APPLICATION_CREDENTIALS, gcloud auth application-default login
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      })
    }
  } catch (e) {
    console.error('[firebaseAdmin] initializeApp falhou:', e)
    throw e
  }
}

// === Exports padronizados e compatíveis com o projeto ===
export const adminApp = admin.app()
export const adminAuth = admin.auth()
export const adminDb = getFirestore()

// Aliases para compatibilidade com imports já existentes no repo:
export const db = adminDb
export const firestore = adminDb
export const auth = adminAuth
export const Field = FieldValue // útil para serverTimestamp, deletes, etc.

export default admin
