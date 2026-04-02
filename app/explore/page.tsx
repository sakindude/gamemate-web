import { Suspense } from 'react'
import ExploreClient from './explore-client'

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-white">
          <section className="mx-auto max-w-7xl px-6 py-8">
            <div className="mb-8">
              <h1 className="text-4xl font-bold">Find GameMates</h1>
              <p className="mt-2 text-slate-400">Loading explore page...</p>
            </div>
          </section>
        </main>
      }
    >
      <ExploreClient />
    </Suspense>
  )
}