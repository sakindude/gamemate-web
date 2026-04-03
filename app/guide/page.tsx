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
            Book a GameMate by duration, start together when ready, and complete the
            session safely on-platform.
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <MiniTip
            title="Duration Based"
            description="Choose a GameMate and select how long you want the session to last."
          />
          <MiniTip
            title="Two-Sided Start"
            description='The timer starts only when both sides press "Start Session".'
          />
          <MiniTip
            title="Protected Payment"
            description="Payment is held for safety and is only released after the session flow is completed."
          />
        </div>

        <div className="space-y-6">
          <GuideCard step="1" title="Find a GameMate">
            <p>
              Go to the Explore page and browse online GameMates by game, language,
              communication style, country, and price.
            </p>
            <p>
              Open profiles to learn more before booking. Check their bio, supported
              games, hourly rate, and other profile details.
            </p>
          </GuideCard>

          <GuideCard step="2" title="Choose a Session Duration">
            <p>
              Instead of selecting a date or time slot, you choose how long you want the
              session to be.
            </p>
            <p>
              Example durations may include 1 hour, 2 hours, or 3 hours depending on the
              GameMate’s settings.
            </p>
          </GuideCard>

          <GuideCard step="3" title="Pay and Send the Request">
            <p>
              Once you choose the duration, the total price is calculated from the
              GameMate’s hourly rate.
            </p>
            <p>
              Payment is taken at checkout, but it is not released to the GameMate right
              away. It stays protected on-platform until the session is completed or
              reviewed.
            </p>
          </GuideCard>

          <GuideCard step="4" title="Wait for Accept or Reject">
            <p>
              The GameMate can accept or reject your request.
            </p>
            <p>
              If the request is rejected, the payment does not continue into a normal
              session flow. If it is accepted, the session becomes ready and you can use
              chat to coordinate.
            </p>
          </GuideCard>

          <GuideCard step="5" title="Chat and Get Ready">
            <p>
              After acceptance, both sides can talk through the platform chat to decide
              how they want to connect and play.
            </p>
            <p>
              This is where you confirm details like the game, voice method, or anything
              else needed before starting.
            </p>
          </GuideCard>

          <GuideCard step="6" title="Start the Session Together">
            <p>
              The session officially begins only when both sides press{' '}
              <span className="font-semibold text-slate-200">Start Session</span>.
            </p>
            <p>
              In the new system, Start Session is important because it starts the actual
              countdown timer for the purchased duration.
            </p>
          </GuideCard>

          <GuideCard step="7" title="Play While the Countdown Runs">
            <p>
              Once both sides start, the countdown begins and the session becomes active.
            </p>
            <p>
              The remaining time is the official session time purchased through the
              platform.
            </p>
          </GuideCard>

          <GuideCard step="8" title="Extend the Session if Both Sides Agree">
            <p>
              If you want more time, the buyer can request an extension.
            </p>
            <p>
              The buyer confirms the extra payment, and the GameMate must accept the
              extension before the timer is increased.
            </p>
          </GuideCard>

          <GuideCard step="9" title="End the Session">
            <p>
              When the time finishes, the platform can notify both sides that the session
              duration has ended.
            </p>
            <p>
              If both sides want to stop earlier, an end request flow can be used instead
              of forcing the session to run forever.
            </p>
          </GuideCard>

          <GuideCard step="10" title="Complete or Report a Problem">
            <p>
              After the session, both sides should confirm completion through the
              platform.
            </p>
            <p>
              If something went wrong, use the problem reporting flow instead of trying to
              solve payment or dispute issues outside the platform.
            </p>
          </GuideCard>

          <InfoCard title="Important Terms">
            <div className="grid gap-4 md:grid-cols-2">
              <MiniTip
                title="Duration"
                description="The amount of time purchased for a session, such as 1 hour or 2 hours."
              />
              <MiniTip
                title="Start Session"
                description="The action both sides use to officially begin the paid countdown timer."
              />
              <MiniTip
                title="Payout hold"
                description="Payment is temporarily held for safety and is not released instantly to the GameMate."
              />
              <MiniTip
                title="Extension"
                description="Extra session time requested by the buyer, paid for on-platform, and accepted by the GameMate."
              />
            </div>
          </InfoCard>

          <InfoCard title="Tips for Buyers">
            <ul className="list-disc space-y-2 pl-5">
              <li>Read profiles carefully before choosing a GameMate.</li>
              <li>Choose the duration you actually want before paying.</li>
              <li>Use chat to coordinate before pressing Start Session.</li>
              <li>Only start when both sides are genuinely ready to begin.</li>
              <li>Use the report system if there is a serious issue.</li>
            </ul>
          </InfoCard>

          <InfoCard title="Tips for GameMates">
            <ul className="list-disc space-y-2 pl-5">
              <li>Keep your profile accurate and up to date.</li>
              <li>Only stay online when you are genuinely available.</li>
              <li>Review requests before accepting them.</li>
              <li>Start the session only when you are ready to begin the paid timer.</li>
              <li>Do not move payments or session handling off-platform.</li>
            </ul>
          </InfoCard>

          <InfoCard title="Safety Reminder">
            <p>
              GameMate is safest when the full flow stays on-platform: request, payment,
              start, duration handling, completion, and issue reporting.
            </p>
            <p className="text-slate-400">
              If you move payment or session settlement outside the platform, protection
              becomes weaker and support may be limited.
            </p>
          </InfoCard>
        </div>
      </section>
    </main>
  )
}