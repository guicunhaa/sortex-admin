// src/lib/groups.ts
import { collection, doc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

// Faixa fixa: 0..70 (71 números) – mantemos constante para evitar drift por ENV
export const MIN_NUMBER = 0
export const MAX_NUMBER = 70
export const GROUP_SIZE = (MAX_NUMBER - MIN_NUMBER + 1) // 71

export function padNumber(n: number): string {
  return String(n).padStart(2, '0') // "00".."70"
}

export function groupDoc(db: Firestore, groupId: string) {
  return doc(db, 'groups', groupId)
}

export function numbersCol(db: Firestore, groupId: string) {
  return collection(doc(db, 'groups', groupId), 'numbers')
}

export function numberDoc(db: Firestore, groupId: string, nId: string) {
  return doc(collection(doc(db, 'groups', groupId), 'numbers'), nId)
}
