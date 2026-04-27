'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'


type MatrixRow = {
  category: string
  caseType: string
  description: string
  evidence: string
  likelyDecision: string
  payoutOutcome: string
  refundOutcome: string
  strikeOutcome: string
  manualReview: string
  insufficientEvidence: string
  mutualFault: string
}

const MATRIX_ROWS: MatrixRow[] = [
  {
    category: 'Attendance / No-Show',
    caseType: 'Seller no-show',
    description:
      'Seller does not appear, does not join, and does not meaningfully begin the booked session within the allowed window.',
    evidence:
      'Strong if session never starts, seller never signals readiness, and buyer-side logs support waiting behavior.',
    likelyDecision: 'Buyer-favor decision.',
    payoutOutcome: 'No seller payout.',
    refundOutcome: 'Full refund to buyer.',
    strikeOutcome: 'Seller warning or strike. Repeat behavior should escalate.',
    manualReview: 'Usually not required if system logs are clear.',
    insufficientEvidence:
      'If both sides provide conflicting claims and logs are weak, default to no automatic strike and manual review if needed.',
    mutualFault:
      'If both sides failed to appear or caused confusion, consider no payout and partial/no strike depending on logs.',
  },
  {
    category: 'Attendance / No-Show',
    caseType: 'Buyer no-show',
    description:
      'Buyer books but does not show up or does not meaningfully join within the allowed window after seller is ready.',
    evidence:
      'Strong if seller is ready/start-capable and buyer never engages meaningfully.',
    likelyDecision: 'Seller-favor decision.',
    payoutOutcome: 'Seller payout allowed according to platform policy.',
    refundOutcome: 'No buyer refund.',
    strikeOutcome: 'Buyer warning or strike. Repeat behavior should escalate.',
    manualReview: 'Usually not required if evidence is clean.',
    insufficientEvidence:
      'If readiness is unclear or both sides are inactive, avoid hard strike without stronger proof.',
    mutualFault:
      'If both parties contributed to the failure, reduce certainty and consider softer action.',
  },
  {
    category: 'Attendance / Delay',
    caseType: 'Late arrival',
    description:
      'One party arrives meaningfully late, but the session still partially or fully proceeds.',
    evidence:
      'Timeline logs, chat timestamps, start requests, and actual start time.',
    likelyDecision:
      'Context-based. Mild lateness normally does not justify full refund. Repeated lateness should weigh more heavily.',
    payoutOutcome: 'Usually full or partial seller payout depending on delivered time.',
    refundOutcome: 'None or partial refund depending on impact.',
    strikeOutcome: 'Usually warning first, strike if repeated or severe.',
    manualReview: 'Needed if lateness meaningfully changed delivered value.',
    insufficientEvidence:
      'If delay duration cannot be established, avoid hard penalties.',
    mutualFault:
      'If both sides were late or unresponsive, use softer outcomes.',
  },
  {
    category: 'Session Quality',
    caseType: 'Partial session delivered',
    description:
      'Session started, but only a meaningful fraction of the promised service was delivered.',
    evidence:
      'Start/end events, chat, participant statements, and duration mismatch.',
    likelyDecision: 'Partial fulfillment decision.',
    payoutOutcome: 'Partial payout or reduced payout.',
    refundOutcome: 'Partial refund.',
    strikeOutcome:
      'Usually no strike for first-time technical/ordinary disruption; strike only if clearly avoidable or repeated.',
    manualReview: 'Recommended.',
    insufficientEvidence:
      'If duration/service quality cannot be estimated, avoid forced numeric split unless logs support it.',
    mutualFault:
      'If both sides contributed, favor a balanced partial-resolution outcome.',
  },
  {
    category: 'Session Quality',
    caseType: 'Session started but ended early',
    description:
      'Session begins but terminates earlier than reasonably expected without clear agreement.',
    evidence:
      'Session events, chat, reported reason, who disengaged first.',
    likelyDecision: 'Context-based.',
    payoutOutcome:
      'Partial or full depending on delivered portion and cause.',
    refundOutcome: 'Partial or none depending on cause.',
    strikeOutcome:
      'Strike only if one side clearly abandoned or sabotaged the session.',
    manualReview: 'Usually yes.',
    insufficientEvidence:
      'If no clear cause is visible, prefer softer resolution over punitive decision.',
    mutualFault:
      'If both parties disengaged or communication collapsed, reduce penalties.',
  },
  {
    category: 'Technical Problems',
    caseType: 'Connection / technical issue',
    description:
      'A technical problem prevents the session from starting or continuing normally.',
    evidence:
      'Logs, screenshots, timing, repeated reconnect attempts, chat explanations.',
    likelyDecision:
      'Non-punitive where credible. Prefer reschedule, partial refund, or balanced resolution.',
    payoutOutcome: 'Partial or no payout depending on delivered value.',
    refundOutcome: 'Partial or full depending on severity and responsibility.',
    strikeOutcome:
      'Normally no strike unless technical excuse is clearly fake or repeatedly abused.',
    manualReview: 'Recommended when money impact is material.',
    insufficientEvidence:
      'If technical failure cannot be distinguished from disengagement, avoid hard punishment.',
    mutualFault:
      'If both sides had technical issues, resolve with minimal penalties.',
  },
  {
    category: 'Behavior / Conduct',
    caseType: 'Toxic behavior / hostility',
    description:
      'Insults, repeated rudeness, aggressive conduct, or generally hostile session behavior.',
    evidence:
      'Chat logs, reports, screenshots, voice evidence where supported.',
    likelyDecision:
      'Warning for mild first offense, stronger action for repeated or severe behavior.',
    payoutOutcome:
      'Usually unaffected unless the conduct materially ruined the session.',
    refundOutcome:
      'Possible partial or full refund if the session became unusable.',
    strikeOutcome: 'Warning or strike depending on severity and repetition.',
    manualReview: 'Recommended for borderline cases.',
    insufficientEvidence:
      'Without verifiable evidence, avoid hard strike and close with note/warning if appropriate.',
    mutualFault:
      'If both parties were abusive, use the more specific mutual toxicity / conflict escalation case below instead of defaulting to a generic no-refund outcome.',
  },
  {
    category: 'Behavior / Conduct',
    caseType: 'Mutual toxicity / conflict escalation',
    description:
      'Both participants engage in toxic behavior, arguments, insults, or escalating conflict during the session. This may happen very early, after partial delivery, or near the end of the session.',
    evidence:
      'Chat logs, timestamps, session start/end timing, escalation pattern, who initiated the conflict, whether both sides escalated, and how much of the session was actually completed.',
    likelyDecision:
      'Progress-based and fault-aware decision. Do not use a fixed rule like always no refund. Evaluate both session progress and responsibility.',
    payoutOutcome:
      'May range from no payout to partial payout or full payout depending on how much service was delivered and whether one side was materially more responsible for the breakdown.',
    refundOutcome:
      'May range from full refund for very early collapse, to partial refund for partially completed sessions, to no refund if the session was mostly completed.',
    strikeOutcome:
      'Both users may receive warnings or strikes depending on severity, escalation level, abusive language, and repeat behavior. If one side clearly instigated or manipulated the situation, action can be heavier on that side.',
    manualReview: 'Yes.',
    insufficientEvidence:
      'If it is unclear who escalated, who caused the collapse, or how much of the session was actually delivered, avoid harsh one-sided punishment and prefer a conservative or balanced resolution.',
    mutualFault:
      'Mutual fault here does not mean automatic no refund. Use progress-based logic: very early conflict can justify full refund, partial session can justify partial refund, and near-complete sessions usually do not justify refund. If a user appears to have intentionally created or escalated conflict to manipulate refund outcomes, reduce refund eligibility and consider stronger penalties.',
  },
  {
    category: 'Behavior / Conduct',
    caseType: 'Harassment',
    description:
      'Repeated unwanted personal, sexual, intimidating, or boundary-crossing conduct.',
    evidence:
      'Logs, screenshots, persistent patterns, session evidence.',
    likelyDecision: 'Victim-favor decision with stronger trust & safety action.',
    payoutOutcome: 'May block payout if the harassing side is at fault.',
    refundOutcome: 'Often full refund to affected side.',
    strikeOutcome: 'Strong strike. Severe cases may justify restriction or ban review.',
    manualReview: 'Yes.',
    insufficientEvidence:
      'If evidence is too weak, avoid extreme punishment but document the report.',
    mutualFault:
      'Only use mutual-fault framing if evidence clearly shows both sides engaged in comparable misconduct.',
  },
  {
    category: 'Behavior / Conduct',
    caseType: 'Hate speech',
    description:
      'Racist, sexist, homophobic, transphobic, or other protected-target hostility.',
    evidence:
      'Logs, screenshots, reliable session evidence.',
    likelyDecision: 'High-severity trust & safety response.',
    payoutOutcome: 'Can block or reverse payout depending on case stage.',
    refundOutcome: 'Often full refund for affected side.',
    strikeOutcome: 'Strong strike, severe escalation, possible ban review.',
    manualReview: 'Yes, but severity is high if evidence is clear.',
    insufficientEvidence:
      'If evidence is unclear, do not over-penalize but preserve the case record.',
    mutualFault:
      'Do not dilute a clear hate-speech case unless both sides independently engaged in comparable conduct.',
  },
  {
    category: 'Identity / Profile Integrity',
    caseType: 'Different from profile',
    description:
      'The person delivering the session appears materially different from the represented profile/identity.',
    evidence:
      'Profile mismatch, voice/person mismatch, reliable supporting evidence.',
    likelyDecision: 'Profile-integrity violation.',
    payoutOutcome: 'May block payout.',
    refundOutcome: 'Often full refund.',
    strikeOutcome: 'Strong strike, possible manual trust review.',
    manualReview: 'Yes.',
    insufficientEvidence:
      'If mismatch cannot be established clearly, avoid decisive punishment.',
    mutualFault:
      'Usually not a mutual-fault case unless both parties were materially deceptive.',
  },
  {
    category: 'Payment / Platform Integrity',
    caseType: 'Off-platform payment attempt',
    description:
      'One side attempts to move payment outside the platform.',
    evidence:
      'Chat logs, direct proposals, repeat patterns.',
    likelyDecision: 'Policy violation.',
    payoutOutcome:
      'Case-dependent, but off-platform steering should weigh against violating side.',
    refundOutcome: 'Case-dependent.',
    strikeOutcome:
      'Warning or strike on first offense depending on aggressiveness; stronger action on repeats.',
    manualReview: 'Recommended for repeat cases.',
    insufficientEvidence:
      'If only implied and not clear, do not over-enforce.',
    mutualFault:
      'If both parties clearly cooperated, both may receive action.',
  },
  {
    category: 'Fraud / Abuse',
    caseType: 'Scam attempt',
    description:
      'Intentional deception for money, account access, goods, or false promises.',
    evidence:
      'Strong logs, repeated pattern, misleading instructions, fake obligations.',
    likelyDecision: 'High-severity fraud response.',
    payoutOutcome: 'Block or reverse if possible.',
    refundOutcome: 'Full refund to harmed side where justified.',
    strikeOutcome: 'Strong strike or ban review.',
    manualReview: 'Yes.',
    insufficientEvidence:
      'Document and monitor pattern if evidence is not yet sufficient.',
    mutualFault:
      'Rare. Usually one-sided unless collusive abuse exists.',
  },
  {
    category: 'Fraud / Abuse',
    caseType: 'Fake report',
    description:
      'A user knowingly files a false report to manipulate outcomes.',
    evidence:
      'Strong contradiction between report and logs/evidence.',
    likelyDecision: 'Abuse-of-reporting-system decision.',
    payoutOutcome: 'Usually preserve rightful payout.',
    refundOutcome: 'Usually deny manipulative refund request.',
    strikeOutcome: 'Warning or strike depending on intent and repetition.',
    manualReview: 'Yes if financial consequence is material.',
    insufficientEvidence:
      'If intent to fabricate cannot be proven, avoid hard punishment.',
    mutualFault:
      'If the underlying session had genuine issues on both sides, do not over-focus on fake-report framing.',
  },
  {
    category: 'Fraud / Abuse',
    caseType: 'Suspicious repeated abuse pattern',
    description:
      'A user repeatedly triggers disputes, no-shows, charge-like behavior, harassment, or manipulative patterns across sessions.',
    evidence:
      'Historical case pattern, repeated flags, repeated session outcomes.',
    likelyDecision: 'Pattern-based trust intervention.',
    payoutOutcome: 'Case-specific.',
    refundOutcome: 'Case-specific.',
    strikeOutcome:
      'Escalating strike severity, restriction, or ban review depending on pattern.',
    manualReview: 'Yes, always.',
    insufficientEvidence:
      'One weak case is not enough; pattern evidence matters.',
    mutualFault:
      'If abuse is genuinely mutual across a cluster of interactions, separate pattern review is needed.',
  },
  {
    category: 'Evidence / Decision Logic',
    caseType: 'Insufficient evidence',
    description:
      'Neither side provides enough reliable evidence and logs are not conclusive.',
    evidence: 'Weak or contradictory.',
    likelyDecision:
      'Conservative resolution. Avoid irreversible punitive action without support.',
    payoutOutcome: 'Preserve current state unless strong reason exists to override.',
    refundOutcome: 'Limited or none unless policy clearly favors one side.',
    strikeOutcome: 'Usually none.',
    manualReview: 'Optional depending on amount/risk.',
    insufficientEvidence:
      'Document the case and close with minimal action if facts cannot be established.',
    mutualFault:
      'If both sides are partly credible and partly unsupported, a neutral/limited outcome is usually safer.',
  },
  {
    category: 'Evidence / Decision Logic',
    caseType: 'Mutual misconduct',
    description:
      'Both sides engaged in meaningful misconduct or both materially contributed to failure.',
    evidence: 'Logs support fault on both sides.',
    likelyDecision: 'Balanced enforcement.',
    payoutOutcome: 'Partial, withheld, or case-specific.',
    refundOutcome: 'Partial, withheld, or case-specific.',
    strikeOutcome: 'Possible action on both sides.',
    manualReview: 'Yes.',
    insufficientEvidence:
      'If mutuality cannot be proven, do not force a split-blame outcome.',
    mutualFault:
      'Use this path only when the evidence genuinely supports shared responsibility. For mutual toxicity during a session, prefer the more specific progress-based conduct case above.',
  },
  {
    category: 'Privacy / Streaming',
    caseType: 'Streaming / disclosure problem',
    description:
      'A user streams, records, or publicly exposes the interaction without acceptable disclosure/consent expectations.',
    evidence:
      'Clip, stream, disclosure logs, prior agreement, report detail.',
    likelyDecision:
      'Privacy-sensitive moderation review.',
    payoutOutcome: 'Case-dependent.',
    refundOutcome: 'Possible if the violation materially changed trust/safety conditions.',
    strikeOutcome:
      'Warning or strike depending on severity, consent context, and repeat behavior.',
    manualReview: 'Yes.',
    insufficientEvidence:
      'If recording/streaming cannot be established, avoid hard action.',
    mutualFault:
      'If both parties knowingly agreed or both contributed to disclosure, reduce severity accordingly.',
  },
]

const FAQ_ITEMS = [
  {
    q: 'What is this page?',
    short: 'An internal admin reference for moderation, disputes, refunds, strikes, and policy guidance.',
    detail:
      'This page is not a user-facing policy page. It is a structured internal decision reference for ops, admin, and support consistency.',
  },
  {
    q: 'How should admins use this matrix?',
    short: 'Use it as a decision baseline, not as blind automation.',
    detail:
      'The matrix helps standardize likely outcomes, but admins should still consider evidence strength, repeat behavior, system logs, and case context.',
  },
  {
    q: 'When is manual review required?',
    short: 'Use manual review for high-severity, identity, harassment, fraud, privacy, or unclear evidence cases.',
    detail:
      'If the case involves profile mismatch, severe abuse, scam signals, privacy concerns, or contradictory evidence, escalate rather than forcing a simplistic decision.',
  },
  {
    q: 'What should happen if evidence is weak?',
    short: 'Avoid irreversible punitive action.',
    detail:
      'When logs and user evidence do not strongly support a claim, document the case, avoid over-penalizing, and prefer conservative outcomes.',
  },
  {
    q: 'What should happen in mutual-fault situations?',
    short: 'Do not force a one-sided winner if both sides clearly contributed.',
    detail:
      'Use a balanced resolution, potentially with partial financial outcomes and softer but fair trust actions for both sides.',
  },
  {
    q: 'What if both users argue or become toxic?',
    short: 'Outcome depends on session progress, not a fixed no-refund rule.',
    detail:
      'If both participants engage in toxic behavior, do not default to automatic no refund. Very early conflicts may justify refund, partially completed sessions may justify partial outcomes, and near-complete sessions usually do not justify refund. Both users may still receive penalties depending on severity and escalation.',
  },
  {
    q: 'Can users manipulate refunds by creating conflict?',
    short: 'Intentional conflict to manipulate outcomes is treated as abuse.',
    detail:
      'If a user appears to provoke or escalate conflict in order to trigger a refund outcome, refund eligibility may be reduced or denied, and stronger penalties may apply.',
  },
]

function Pill({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'good' | 'warn' | 'danger'
}) {
  const styles =
    tone === 'good'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : tone === 'warn'
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      : tone === 'danger'
      ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
      : 'border-slate-700 bg-slate-800 text-slate-200'

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>
      {children}
    </span>
  )
}

export default function AdminModerationPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        router.push('/login')
        return
      }

      setUserEmail(session.user.email || '')
      setLoading(false)
    }

    void load()
  }, [router])

  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(MATRIX_ROWS.map((row) => row.category)))]
  }, [])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()

    return MATRIX_ROWS.filter((row) => {
      const categoryOk = categoryFilter === 'All' || row.category === categoryFilter

      const searchBlob = [
        row.category,
        row.caseType,
        row.description,
        row.evidence,
        row.likelyDecision,
        row.payoutOutcome,
        row.refundOutcome,
        row.strikeOutcome,
        row.manualReview,
        row.insufficientEvidence,
        row.mutualFault,
      ]
        .join(' ')
        .toLowerCase()

      const queryOk = !q || searchBlob.includes(q)

      return categoryOk && queryOk
    })
  }, [categoryFilter, query])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">

        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <p className="text-slate-400">Loading moderation reference...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">


      <section className="mx-auto max-w-[1160px] px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Pill tone="good">Internal</Pill>
              <Pill>Moderation</Pill>
              <Pill>Support Reference</Pill>
            </div>

            <h1 className="text-4xl font-bold">Moderation Matrix</h1>
            <p className="mt-2 max-w-3xl text-slate-400">
              Internal decision support for disputes, refunds, payout outcomes,
              strikes, evidence handling, and trust & safety consistency.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Back to Admin
            </Link>

            <Link
              href="/ops"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Open OPS
            </Link>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">How to use this page</h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
              <div className="text-sm font-semibold text-white">1. Classify the case</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Identify whether the issue is attendance, conduct, fraud, identity,
                payment integrity, privacy, or evidence-related.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
              <div className="text-sm font-semibold text-white">2. Check evidence strength</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Prefer system logs, timestamps, session events, and chat evidence over
                unsupported claims.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
              <div className="text-sm font-semibold text-white">3. Apply proportionate action</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Use the matrix as a structured baseline. Escalate high-severity or
                unclear cases to manual review.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-6">
          <h2 className="text-xl font-bold text-indigo-200">Key interpretation rule</h2>
          <p className="mt-3 text-sm leading-6 text-indigo-100/90">
            Do not use a simplistic fixed rule for mutual toxicity or conflict cases.
            If both users behaved badly, still evaluate how much of the session was actually delivered,
            whether one side clearly escalated more than the other, and whether conflict appears intentional
            or manipulative. Shared fault does not automatically erase session progress.
          </p>
        </div>

        <div className="mb-8 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-300">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-300">
              Search
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search case types, evidence logic, refund outcomes..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none"
            />
          </div>
        </div>

        <div className="space-y-5">
          {filteredRows.map((row) => (
            <div
              key={`${row.category}-${row.caseType}`}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
            >
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2">
                    <Pill>{row.category}</Pill>
                  </div>
                  <h2 className="text-2xl font-bold text-white">{row.caseType}</h2>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
                    {row.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Pill tone={row.manualReview === 'Yes.' || row.manualReview === 'Yes, always.' ? 'warn' : 'default'}>
                    Manual review: {row.manualReview}
                  </Pill>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
                  <div className="text-sm font-semibold text-white">Evidence</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{row.evidence}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
                  <div className="text-sm font-semibold text-white">Likely decision</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{row.likelyDecision}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
                  <div className="text-sm font-semibold text-white">Payout outcome</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{row.payoutOutcome}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
                  <div className="text-sm font-semibold text-white">Refund outcome</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{row.refundOutcome}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
                  <div className="text-sm font-semibold text-white">Warning / strike outcome</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{row.strikeOutcome}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
                  <div className="text-sm font-semibold text-white">Insufficient evidence handling</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {row.insufficientEvidence}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4 xl:col-span-2">
                  <div className="text-sm font-semibold text-white">Mutual fault handling</div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{row.mutualFault}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold text-white">Support / FAQ Reference</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Short internal support answers aligned with the moderation logic above.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {FAQ_ITEMS.map((item) => (
              <div
                key={item.q}
                className="rounded-2xl border border-slate-800 bg-[#020617] p-5"
              >
                <div className="text-base font-semibold text-white">{item.q}</div>
                <p className="mt-3 text-sm font-medium text-indigo-300">{item.short}</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6">
          <h2 className="text-lg font-bold text-amber-200">Important note</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/90">
            This page is an internal guidance tool. It should improve consistency,
            but it should not replace judgment in high-risk, unclear, or sensitive cases.
          </p>
        </div>
      </section>
    </main>
  )
}