'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import {
  GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult
} from 'firebase/auth'
import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const { user } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'google'|'email'|'phone'>('email')

  // E-mail
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Phone
  const [phone, setPhone] = useState('')        // +55DDDNUMERO
  const [code, setCode]   = useState('')
  const [cr, setCr]       = useState<ConfirmationResult | null>(null)
  const recaptcha = useRef<RecaptchaVerifier | null>(null)

  useEffect(() => {
    if (user) { router.replace('/dashboard') }
  }, [user, router])

  useEffect(() => {
    if (!recaptcha.current) {
      const el = document.getElementById('recaptcha-container') as HTMLDivElement | null
      if (!el) return
      // facilita DEV: evita challenge real
      // @ts-ignore
      if (process.env.NODE_ENV !== 'production') auth.settings.appVerificationDisabledForTesting = true

      recaptcha.current = new RecaptchaVerifier(auth, el, { size: 'invisible' })
      recaptcha.current.render().catch(console.error)
    }
  }, [])

  async function loginGoogle() {
    setErr(null); setLoading(true)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
      router.replace('/dashboard')
    } catch (e:any) { setErr(e.message) } finally { setLoading(false) }
  }

  async function loginEmail(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true)
    try {
      if (isRegister) await createUserWithEmailAndPassword(auth, email, pass)
      else await signInWithEmailAndPassword(auth, email, pass)
      router.replace('/dashboard')
    } catch (e:any) { setErr(e.message) } finally { setLoading(false) }
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true)
    try {
      const result = await signInWithPhoneNumber(auth, phone, recaptcha.current!)
      setCr(result)
    } catch (e:any) { setErr(e.message) } finally { setLoading(false) }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true)
    try {
      await cr!.confirm(code)
      router.replace('/dashboard')
    } catch (e:any) { setErr(e.message) } finally { setLoading(false) }
  }

  if (user) return null

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="glass w-full max-w-md rounded-xl2 border border-white/15 ring-1 ring-white/10 shadow-glass p-6">
        <div className="flex gap-2 mb-4">
          <button className={`px-3 py-2 rounded ${tab==='email'?'bg-white/15':''}`} onClick={()=>setTab('email')}>E-mail</button>
          <button className={`px-3 py-2 rounded ${tab==='phone'?'bg-white/15':''}`} onClick={()=>setTab('phone')}>Telefone</button>
          <button className={`ml-auto px-3 py-2 rounded ${tab==='google'?'bg-white/15':''}`} onClick={()=>setTab('google')}>Google</button>
        </div>

        {tab==='email' && (
          <form onSubmit={loginEmail} className="space-y-3">
            <input className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2" placeholder="seu@email.com"
              value={email} onChange={e=>setEmail(e.target.value)} />
            <input type="password" className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2" placeholder="Senha"
              value={pass} onChange={e=>setPass(e.target.value)} />
            {err && <p className="text-amber-300 text-sm">{err}</p>}
            <div className="flex items-center justify-between">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={isRegister} onChange={e=>setIsRegister(e.target.checked)} />
                Criar conta
              </label>
              <button disabled={loading} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white">
                {loading ? 'Aguarde…' : (isRegister ? 'Cadastrar' : 'Entrar')}
              </button>
            </div>
          </form>
        )}

        {tab==='phone' && (
          <div className="space-y-3">
            {!cr ? (
              <form onSubmit={sendCode} className="space-y-3">
                <input className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2" placeholder="+55DDDNUMERO"
                  value={phone} onChange={e=>setPhone(e.target.value)} />
                {err && <p className="text-amber-300 text-sm">{err}</p>}
                <button disabled={loading} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white">
                  {loading ? 'Enviando…' : 'Enviar código'}
                </button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="space-y-3">
                <input className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2" placeholder="Código SMS"
                  value={code} onChange={e=>setCode(e.target.value)} />
                {err && <p className="text-amber-300 text-sm">{err}</p>}
                <button disabled={loading} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white">
                  {loading ? 'Verificando…' : 'Confirmar'}
                </button>
              </form>
            )}
            <div id="recaptcha-container" />
          </div>
        )}

        {tab==='google' && (
          <button onClick={loginGoogle} disabled={loading} className="w-full px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white">
            {loading ? 'Aguarde…' : 'Entrar com Google'}
          </button>
        )}
      </div>
    </div>
  )
}