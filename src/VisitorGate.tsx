
import { useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from './supabase'

type VisitorGateProps = {
  children: ReactNode
}

type VisitorSession = {
  name: string
  phone: string
}

const SESSION_KEY = 'jewellery_visitor_session'

function getSavedVisitor(): VisitorSession | null {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY)
    return saved ? (JSON.parse(saved) as VisitorSession) : null
  } catch {
    return null
  }
}

export default function VisitorGate({ children }: VisitorGateProps) {
  const [visitor, setVisitor] = useState<VisitorSession | null>(
    getSavedVisitor,
  )
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const cleanName = name.trim()
    const cleanPhone = phone.trim()

    if (cleanName.length < 2) {
      setError('Please enter your name.')
      return
    }

    setSubmitting(true)

    try {
      const { error: visitError } = await supabase.rpc(
        'record_catalogue_visit',
        {
          p_name: cleanName,
          p_phone: cleanPhone,
        },
      )

      if (visitError) {
        setError(visitError.message)
        return
      }

      const visitorSession = {
        name: cleanName,
        phone: cleanPhone,
      }

      // Remember the visitor only for this browser tab session.
      // Reloading the page will not increment the visit count again.
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify(visitorSession),
      )

      setVisitor(visitorSession)
    } catch {
      setError('Could not register your visit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (visitor) {
    return <>{children}</>
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090909] px-4 py-10 text-amber-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-amber-700/40 bg-[#151515] p-8 shadow-xl"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-amber-500">
          Jewellery Catalogue
        </p>

        <h1 className="text-3xl font-semibold">
          Welcome
        </h1>

        <p className="text-sm leading-6 text-gray-400">
          Please enter your details to explore our jewellery collection.
          Your details will be used to record catalogue visits.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <label className="block space-y-2">
          <span className="text-sm text-gray-300">Your name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={100}
            autoComplete="name"
            required
            placeholder="Enter your name"
            className="w-full rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-gray-300">
            Mobile number
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            inputMode="tel"
            maxLength={20}
            required
            placeholder="Enter your 10-digit mobile number"
            className="w-full rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-amber-500 px-4 py-3 font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Registering...' : 'View Jewellery'}
        </button>

        <p className="text-xs leading-5 text-gray-500">
          By continuing, you acknowledge that your name and phone number
          will be stored to maintain catalogue visit history.
        </p>
      </form>
    </main>
  )
}
