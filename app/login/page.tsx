import { Suspense } from 'react'
import LoginPageClient from './login-page-client'

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="text-lg font-semibold text-white">Loading...</div>
            <p className="mt-2 text-sm text-slate-400">Please wait a moment.</p>
          </div>
        </main>
      }
    >
      <LoginPageClient />
    </Suspense>
  )
}