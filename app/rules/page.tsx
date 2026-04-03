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
        return 'Everything buyers should know about requests, paid time, and session completion.'
      case 'gamemate':
        return 'Everything GameMates should know about profile accuracy, online presence, and session conduct.'
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
            <RuleCard title="How the New Session System Works">
              <p>1. Choose a GameMate and select a session duration.</p>
              <p>2. Payment is collected first and held for safety.</p>
              <p>3. The GameMate can accept or reject the request.</p>
              <p>4. After acceptance, both sides can coordinate in chat.</p>
              <p>
                5. The official timer starts only when both sides press{' '}
                <span className="font-semibold text-slate-200">Start Session</span>.
              </p>
              <p>6. The session can be completed, extended, ended early, or reported if something goes wrong.</p>
            </RuleCard>

            <RuleCard title="Important Terms">
              <div className="grid gap-4 md:grid-cols-2">
                <QuickTerm
                  term="Duration"
                  description="The amount of paid time purchased for the session, such as 1 hour, 2 hours, or 3 hours."
                />
                <QuickTerm
                  term="Start Session"
                  description="The action both sides use to begin the official session timer. In the new system, this has a real function."
                />
                <QuickTerm
                  term="Payout hold"
                  description="Payment is held temporarily for safety and is not sent instantly to the GameMate."
                />
                <QuickTerm
                  term="Dispute"
                  description="A formal issue report used when something serious went wrong, such as no-show, bad behavior, or a major mismatch."
                />
              </div>
            </RuleCard>

            <RuleCard title="Core Platform Rules">
              <ul className="list-disc space-y-2 pl-5">
                <li>Payments must stay on the platform.</li>
                <li>Profiles must be truthful and not misleading.</li>
                <li>The paid timer only begins when both sides start the session.</li>
                <li>Session changes such as extension or early ending must follow the platform flow.</li>
                <li>Serious abuse, fraud, harassment, or repeated rule breaking may lead to restrictions or bans.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Payments & Protection">
              <p>Payment is collected before the session but not released immediately.</p>
              <p>
                If the session completes normally and no serious issue is reported, payout
                can be released after the normal review / hold flow.
              </p>
              <p>
                If a dispute is opened, payout stays on hold until the case is resolved.
              </p>
            </RuleCard>

            <RuleCard title="If Something Goes Wrong">
              <p>You can report issues such as:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>The other side did not show up</li>
                <li>The session could not be started properly</li>
                <li>The person was significantly different from the profile</li>
                <li>Bad behavior, harassment, or major misconduct</li>
                <li>Technical issues that prevented the session</li>
              </ul>
              <p className="text-slate-400">
                Serious issues should be reported through the platform instead of handled off-platform.
              </p>
            </RuleCard>
          </div>
        )}

        {view === 'buyer' && (
          <div className="space-y-6">
            <RuleCard title="Before You Send a Request">
              <ul className="list-disc space-y-2 pl-5">
                <li>Read the GameMate profile carefully before paying.</li>
                <li>Check the hourly rate, supported games, communication methods, and profile details.</li>
                <li>Choose the session duration you actually want before submitting the request.</li>
                <li>Do not send requests unless you genuinely plan to continue with the session.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Payment and Request Flow">
              <p>
                Your payment is collected when you make the request, but it is held for
                protection and is not instantly transferred to the GameMate.
              </p>
              <p>
                The GameMate must still accept the request before the session becomes ready.
              </p>
            </RuleCard>

            <RuleCard title="Starting the Session">
              <p>
                The session timer does not start automatically just because you paid or
                chatted.
              </p>
              <p>
                The official paid session begins only when both sides press{' '}
                <span className="font-semibold text-slate-200">Start Session</span>.
              </p>
              <p className="text-slate-400">
                Do not press Start Session unless you are genuinely ready to begin the
                paid time.
              </p>
            </RuleCard>

            <RuleCard title="Extensions">
              <p>
                If you want more time, you may request an extension during the session.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>The buyer must approve the extra payment.</li>
                <li>The GameMate must accept the extension.</li>
                <li>The timer only extends after the platform flow is completed.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Completion and Problems">
              <p>
                When the session ends, complete it through the platform.
              </p>
              <p>
                If something serious went wrong, use the problem reporting system instead
                of trying to settle payment outside the platform.
              </p>
            </RuleCard>

            <RuleCard title="Buyer Behavior Rules">
              <ul className="list-disc space-y-2 pl-5">
                <li>Be respectful in chat and during sessions.</li>
                <li>Do not harass, threaten, or troll the GameMate.</li>
                <li>Do not pressure anyone into off-platform contact or payment.</li>
                <li>Do not abuse extension, refund, or report systems.</li>
                <li>False reports may also lead to penalties.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Refund Expectations">
              <p>
                Not every bad feeling or mismatch automatically means a refund.
              </p>
              <p>
                Refund decisions depend on the session flow, payment state, timing, and
                any available evidence or platform records.
              </p>
            </RuleCard>
          </div>
        )}

        {view === 'gamemate' && (
          <div className="space-y-6">
            <RuleCard title="Profile Accuracy">
              <p>Your profile should represent you honestly.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Your identity should not be misleading.</li>
                <li>Your games, languages, and communication methods should be accurate.</li>
                <li>Your hourly rate and max session limits should reflect what you actually offer.</li>
                <li>You should not present yourself as a different person than the one actually joining.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Online Status Responsibility">
              <p>
                If you set yourself as online, you are signaling that you are available
                for requests under the new seller model.
              </p>
              <p>
                Do not stay online if you are not ready to review and handle incoming
                requests properly.
              </p>
            </RuleCard>

            <RuleCard title="Accepting Requests">
              <p>
                Requests should be reviewed manually.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>You can accept or reject incoming requests.</li>
                <li>Do not accept requests you do not genuinely intend to follow through on.</li>
                <li>After acceptance, use platform chat to coordinate before starting.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Starting the Paid Timer">
              <p>
                In the new system, Start Session is not decorative. It begins the actual
                paid countdown.
              </p>
              <p>
                Only start when you are genuinely ready to begin the paid session.
              </p>
            </RuleCard>

            <RuleCard title="Extensions and Session Ending">
              <ul className="list-disc space-y-2 pl-5">
                <li>Extensions should only happen through the platform flow.</li>
                <li>Do not continue extra paid time informally off-platform.</li>
                <li>If a session needs to end earlier, use the platform ending flow instead of creating payment confusion later.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Professional Conduct">
              <ul className="list-disc space-y-2 pl-5">
                <li>Be respectful and professional.</li>
                <li>Do not harass, insult, manipulate, or intentionally waste the buyer’s time.</li>
                <li>Do not misrepresent your availability, conduct, or what you provide.</li>
              </ul>
            </RuleCard>

            <RuleCard title="Platform Payment Rule">
              <p>
                You must not try to move bookings, paid time, or session settlement
                outside the platform.
              </p>
              <p className="text-slate-400">
                Off-platform payment attempts may lead to warnings, strikes, restrictions,
                or bans.
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
                Repeated issues, repeated no-shows, repeated misleading profiles, or
                repeated platform-rule abuse may affect your account.
              </p>
            </RuleCard>
          </div>
        )}
      </section>
    </main>
  )
}