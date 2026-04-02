'use client'

import TopNav from '@/components/TopNav'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type RulesView = 'overview' | 'buyer' | 'gamemate'

type RuleCardProps = {
  title: string
  children: React.ReactNode
}

type QuickTermProps = {
  term: string
  description: string
}

function RuleCard({ title, children }: RuleCardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      <div className="space-y-3 text-sm leading-6 text-slate-300">{children}</div>
    </div>
  )
}

function QuickTerm({ term, description }: QuickTermProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="text-sm font-semibold text-slate-200">{term}</div>
      <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  )
}

function ViewButton({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? 'border-indigo-500 bg-indigo-600/15 shadow-[0_0_0_1px_rgba(99,102,241,0.18)]'
          : 'border-slate-800 bg-slate-900 hover:bg-slate-800'
      }`}
    >
      <div className="text-base font-bold text-white">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{subtitle}</div>
    </button>
  )
}

export default function RulesPage() {
  const [userEmail, setUserEmail] = useState('')
  const [view, setView] = useState<RulesView>('overview')
  const router = useRouter()

  useLayoutEffect(() => {
    document.title = 'Rules | GameMate'
  }, [])

  useEffect(() => {
    document.title = 'Rules | GameMate'

    const titleTimer = window.setTimeout(() => {
      document.title = 'Rules | GameMate'
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

  const pageTitle = useMemo(() => {
    switch (view) {
      case 'buyer':
        return 'Buyer Rules'
      case 'gamemate':
        return 'GameMate Rules'
      default:
        return 'Trust & Safety'
    }
  }, [view])

  const pageSubtitle = useMemo(() => {
    switch (view) {
      case 'buyer':
        return 'Everything buyers should know before booking and during a session.'
      case 'gamemate':
        return 'Everything GameMates should know about availability, behavior, and platform rules.'
      default:
        return 'A simple overview of how GameMate stays fair, safe, and clear for both sides.'
    }
  }, [view])

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav userEmail={userEmail} />

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">{pageTitle}</h1>
          <p className="mt-2 text-slate-400">{pageSubtitle}</p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <ViewButton
            active={view === 'overview'}
            title="Overview"
            subtitle="Quick summary of how the platform works"
            onClick={() => setView('overview')}
          />
          <ViewButton
            active={view === 'buyer'}
            title="Buyer"
            subtitle="Rules for people booking a GameMate"
            onClick={() => setView('buyer')}
          />
          <ViewButton
            active={view === 'gamemate'}
            title="GameMate"
            subtitle="Rules for people offering sessions"
            onClick={() => setView('gamemate')}
          />
        </div>

        {view === 'overview' && (
          <div className="space-y-6">
            <RuleCard title="How GameMate Works">
              <p>1. Choose a GameMate and create a booking.</p>
              <p>
                2. At the scheduled time, both sides press{' '}
                <span className="font-semibold text-slate-200">Start Session</span>.
              </p>
              <p>3. The session becomes active once both sides are ready.</p>
              <p>4. When the session is over, it can be completed or an issue can be reported.</p>
            </RuleCard>

            <RuleCard title="Important Terms">
              <div className="grid gap-4 md:grid-cols-2">
                <QuickTerm
                  term="No-show"
                  description="A no-show means one side does not join within the allowed time window. On GameMate, this is normally 10 minutes."
                />
                <QuickTerm
                  term="Dispute"
                  description="A dispute is a formal issue report. It is used when something went wrong, such as no-show, late arrival, profile mismatch, or bad behavior."
                />
                <QuickTerm
                  term="Payout hold"
                  description="This means payment is temporarily held for safety and is not sent out instantly."
                />
                <QuickTerm
                  term="Profile mismatch"
                  description="This means the person, behavior, or identity presented during the session does not reasonably match the profile."
                />
              </div>
            </RuleCard>

            <RuleCard title="Core Platform Rules">
              <ul className="list-disc space-y-2 pl-5">
                <li>Both sides must join on time and behave respectfully.</li>
                <li>Payments must stay on the platform.</li>
                <li>Profiles must be truthful and not misleading.</li>
                <li>Serious abuse, fraud, harassment, or repeated rule breaking may lead to restrictions or bans.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Payments & Protection">
              <p>Payments are held temporarily for safety.</p>
              <p>If the session is completed normally and no issue is reported, the payout is released after the hold period.</p>
              <p>If a dispute is opened, the payout stays on hold until the case is resolved.</p>
            </RuleCard>

            <RuleCard title="If Something Goes Wrong">
              <p>You can report issues such as:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>No-show (someone did not join)</li>
                <li>Late arrival</li>
                <li>Different person than profile</li>
                <li>Bad behavior or harassment</li>
                <li>Technical problems that made the session impossible</li>
              </ul>
              <p className="text-slate-400">
                Issues should be reported within 24 hours after the session.
              </p>
            </RuleCard>
          </div>
        )}

        {view === 'buyer' && (
          <div className="space-y-6">
            <RuleCard title="Before Booking">
              <ul className="list-disc space-y-2 pl-5">
                <li>Make sure you understand the GameMate’s profile, language, game list, and communication style.</li>
                <li>Bookings should only be made if you genuinely plan to attend.</li>
                <li>Do not attempt to move payment outside the platform.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Joining the Session">
              <p>
                At the scheduled time, you should press <span className="font-semibold text-slate-200">Start Session</span>.
              </p>
              <p>
                If you do not join within the no-show window <span className="text-slate-400">(normally 10 minutes)</span>, the session may be treated as a buyer no-show.
              </p>
            </RuleCard>

            <RuleCard title="Buyer No-Show">
              <p>
                A buyer no-show means the buyer does not join in time.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Buyer no-show may result in no refund.</li>
                <li>Repeated no-shows may lead to warnings or account restrictions.</li>
              </ul>
            </RuleCard>

            <RuleCard title="What You Can Report">
              <p>You should use the issue reporting system if:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>The GameMate did not show up</li>
                <li>The GameMate was seriously late</li>
                <li>The person seemed significantly different from the profile</li>
                <li>You experienced harassment, abusive behavior, or serious misconduct</li>
              </ul>
            </RuleCard>

            <RuleCard title="Refund Expectations">
              <p>
                Not every bad feeling or mismatch automatically means a refund.
              </p>
              <p>
                Refund decisions depend on the situation, timing, and available evidence.
              </p>
              <p className="text-slate-400">
                Example: “I changed my mind” is not the same as “the GameMate never arrived.”
              </p>
            </RuleCard>

            <RuleCard title="Buyer Behavior Rules">
              <ul className="list-disc space-y-2 pl-5">
                <li>Be respectful in chat and during sessions.</li>
                <li>Do not harass, threaten, or troll the GameMate.</li>
                <li>Do not pressure anyone into off-platform contact or payment.</li>
                <li>False reports may also lead to penalties.</li>
              </ul>
            </RuleCard>
          </div>
        )}

        {view === 'gamemate' && (
          <div className="space-y-6">
            <RuleCard title="Profile Accuracy">
              <p>
                Your profile should represent you honestly.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Your displayed identity should not be misleading.</li>
                <li>Your listed games, languages, and communication methods should be accurate.</li>
                <li>You should not present yourself as a different person than the one actually joining.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Availability & Starting On Time">
              <p>
                If you make yourself available and accept bookings, you are expected to be there on time.
              </p>
              <p>
                At the scheduled time, press <span className="font-semibold text-slate-200">Start Session</span> promptly.
              </p>
            </RuleCard>

            <RuleCard title="Seller No-Show">
              <p>
                A seller no-show means the GameMate does not join in time.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Seller no-show may result in a full refund to the buyer.</li>
                <li>Seller no-show may also lead to strikes or account limits.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Professional Conduct">
              <ul className="list-disc space-y-2 pl-5">
                <li>Be respectful and professional.</li>
                <li>Do not harass, insult, manipulate, or intentionally waste the buyer’s time.</li>
                <li>Do not use misleading behavior that creates a major mismatch with your profile.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Platform Payment Rule">
              <p>
                You must not try to move bookings or payments outside the platform.
              </p>
              <p className="text-slate-400">
                Off-platform payment attempts may lead to warnings, strikes, restrictions, or bans.
              </p>
            </RuleCard>

            <RuleCard title="Disputes & Reviews">
              <p>
                If a buyer reports a serious issue, the session may be reviewed.
              </p>
              <p>
                Payout may stay on hold while the issue is reviewed.
              </p>
              <p className="text-slate-400">
                Repeated issues, repeated no-shows, or repeated profile mismatch complaints may affect your account.
              </p>
            </RuleCard>
          </div>
        )}
      </section>
    </main>
  )
}