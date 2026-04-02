'use client'

import TopNav from '@/components/TopNav'
import { useEffect, useLayoutEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

function GuideCard({
  step,
  title,
  children,
}: {
  step: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
          {step}
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
      </div>

      <div className="space-y-3 text-sm leading-6 text-slate-300">{children}</div>
    </div>
  )
}

function InfoCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-xl font-bold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-6 text-slate-300">{children}</div>
    </div>
  )
}

function MiniTip({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  )
}

export default function GuidePage() {
  const [userEmail, setUserEmail] = useState('')
  const router = useRouter()

  useLayoutEffect(() => {
    document.title = 'Guide | GameMate'
  }, [])

  useEffect(() => {
    document.title = 'Guide | GameMate'

    const titleTimer = window.setTimeout(() => {
      document.title = 'Guide | GameMate'
    }, 50)

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        router.push('/login')
        return
      }

      setUserEmail(session.user.email || '')
    }

    void load()

    return () => {
      window.clearTimeout(titleTimer)
    }
  }, [router])

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav userEmail={userEmail} />

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">How GameMate Works</h1>
          <p className="mt-2 text-slate-400">
            A quick guide to booking, starting, completing, and safely using GameMate.
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <MiniTip
            title="Booking"
            description="Choose a GameMate, pick a time, and confirm your session."
          />
          <MiniTip
            title="Start Session"
            description='At the scheduled time, both sides press "Start Session" to begin.'
          />
          <MiniTip
            title="Need help?"
            description="If something goes wrong, report the issue instead of handling it off-platform."
          />
        </div>

        <div className="space-y-6">
          <GuideCard step="1" title="Find a GameMate">
            <p>
              Go to the Explore page and browse available GameMates by game, language,
              communication style, country, and price.
            </p>
            <p>
              Open profiles to learn more before booking. Check their bio, supported
              games, languages, and other profile details.
            </p>
          </GuideCard>

          <GuideCard step="2" title="Book a Session">
            <p>
              Once you find the right GameMate, select a suitable time and create a
              booking.
            </p>
            <p>
              Your booking reserves the time slot and starts the session process inside
              the platform.
            </p>
          </GuideCard>

          <GuideCard step="3" title="Join on Time">
            <p>
              At the scheduled time, both the buyer and the GameMate should be ready.
            </p>
            <p>
              To officially begin, both sides must press{' '}
              <span className="font-semibold text-slate-200">Start Session</span>.
            </p>
            <p className="text-slate-400">
              If one side does not join in time, it may become a no-show.
            </p>
          </GuideCard>

          <GuideCard step="4" title="Enjoy the Session">
            <p>
              After both sides start the session, the booking becomes active and you can
              play, chat, or spend time together according to the booking.
            </p>
            <p>
              Keep communication respectful and use the platform as intended.
            </p>
          </GuideCard>

          <GuideCard step="5" title="Complete the Session">
            <p>
              When the session is over, complete it through the platform.
            </p>
            <p>
              This helps keep payment flow, logs, and support actions clear for both
              sides.
            </p>
          </GuideCard>

          <GuideCard step="6" title="Report Problems if Needed">
            <p>
              If something serious goes wrong, use the issue reporting system instead of
              trying to solve payment or dispute problems outside the platform.
            </p>
            <p>You can report issues such as:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>No-show (someone did not join)</li>
              <li>Late arrival</li>
              <li>Profile mismatch</li>
              <li>Harassment or bad behavior</li>
              <li>Technical issues that prevented the session</li>
            </ul>
          </GuideCard>

          <InfoCard title="Important Terms">
            <div className="grid gap-4 md:grid-cols-2">
              <MiniTip title="No-show" description="A no-show means one side did not join within the allowed time window." />
              <MiniTip title="Dispute" description="A dispute is a formal issue report reviewed by the platform." />
              <MiniTip title="Payout hold" description="Payments may be temporarily held before being released for safety." />
              <MiniTip title="Profile mismatch" description="This means the person or service experience did not reasonably match the profile." />
            </div>
          </InfoCard>

          <InfoCard title="Tips for Buyers">
            <ul className="list-disc space-y-2 pl-5">
              <li>Read profiles carefully before booking.</li>
              <li>Be on time and press Start Session when the session begins.</li>
              <li>Keep payments on-platform for protection.</li>
              <li>Use the report system if there is a serious issue.</li>
            </ul>
          </InfoCard>

          <InfoCard title="Tips for GameMates">
            <ul className="list-disc space-y-2 pl-5">
              <li>Keep your profile accurate and up to date.</li>
              <li>Only open availability when you can truly attend.</li>
              <li>Join on time and behave professionally.</li>
              <li>Do not move payments or bookings off-platform.</li>
            </ul>
          </InfoCard>

          <InfoCard title="Safety Reminder">
            <p>
              GameMate is safest when everything stays on-platform: booking, session
              flow, payments, and issue reporting.
            </p>
            <p className="text-slate-400">
              If you move outside the platform, protection becomes weaker and support may
              be limited.
            </p>
          </InfoCard>
        </div>
      </section>
    </main>
  )
}