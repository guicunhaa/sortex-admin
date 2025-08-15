// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// 🔑  pegue esses valores no console do Firebase (print que enviou)
const firebaseConfig = {
  apiKey:            'AIzaSyBbnRq4kovi-j-g52FOc6WqSvLpQ1IT3Cg',      // ← copie
  authDomain:        'sortex-dashboard.firebaseapp.com',
  projectId:         'sortex-dashboard',
  storageBucket:     'sortex-dashboard.appspot.com',
  messagingSenderId: '13099651551',
  appId:             '1:130996561551:web:154762b9032966f486f2fa', // ← copie
}

const app   = !getApps().length ? initializeApp(firebaseConfig) : getApp()
export const db   = getFirestore(app)
export const auth = getAuth(app)

//  garante que ele use localStorage (mantém login após refresh)
setPersistence(auth, browserLocalPersistence)