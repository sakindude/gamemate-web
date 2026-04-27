'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'


type FAQItem = {
  category: string
  question: string
  shortAnswer: string
  detailedAnswer: string
}

type FAQDbRow = {
  id: string
  category: string
  question: string
  short_answer: string
  detailed_answer: string
  keywords?: string[] | null
  created_at?: string
}

type ReplyTone = 'neutral' | 'friendly' | 'firm'

const FAQ_ITEMS: FAQItem[] = [
  {
    category: 'Booking Basics',
    question: 'How does booking work?',
    shortAnswer:
      'The buyer selects a GameMate, chooses details, and creates a booking request. The seller must accept it before the session can move forward.',
    detailedAnswer:
      'A booking starts as a request. After the seller accepts, the session moves into a ready state. From there, both sides must participate in the normal session flow. Payment is handled on-platform and held securely according to the system rules.',
  },
  {
    category: 'Booking Basics',
    question: 'What does pending mean?',
    shortAnswer:
      'Pending means the booking request exists but the seller has not accepted it yet.',
    detailedAnswer:
      'At the pending stage, the request is waiting for seller action. The session is not active yet. If the seller rejects the request, the booking ends according to the platform flow.',
  },
  {
    category: 'Booking Basics',
    question: 'What does ready_to_start mean?',
    shortAnswer:
      'The seller accepted the booking and the session is now prepared for the normal start flow.',
    detailedAnswer:
      'This means the booking moved past the request stage and is now waiting for the actual session-start actions from the participants.',
  },
  {
    category: 'Session States',
    question: 'What does active mean?',
    shortAnswer:
      'Active means the session has started and is currently in progress.',
    detailedAnswer:
      'Once the session start flow is completed, the session becomes active. At this point, the session is considered underway and normal completion or dispute rules apply later.',
  },
  {
    category: 'Session States',
    question: 'What does awaiting_confirmation mean?',
    shortAnswer:
      'It means one side has already completed their part and the other side still needs to confirm completion.',
    detailedAnswer:
      'This state exists to avoid immediate forced closure when one participant finishes first. It also helps the system preserve a reviewable trail before the session becomes fully completed.',
  },
  {
    category: 'Session States',
    question: 'What does completed mean?',
    shortAnswer:
      'Completed means the session has been finalized by the platform flow.',
    detailedAnswer:
      'A completed session is treated as finished for payout, dispute timing, and history purposes. If disputes are not opened within the allowed window, the system continues through the normal payout logic.',
  },
  {
    category: 'Session States',
    question: 'What does disputed mean?',
    shortAnswer:
      'Disputed means a report was opened and the case is now under review.',
    detailedAnswer:
      'When a dispute is opened, the platform treats the session as under review. Financial outcomes and moderation actions may depend on the evidence, policy, and platform decision rules.',
  },
  {
    category: 'Actions / Buttons',
    question: 'What does Complete do?',
    shortAnswer:
      'Complete marks that you consider the session finished from your side.',
    detailedAnswer:
      'This does not automatically mean the other side has confirmed the same thing yet. The platform uses completion signals as part of the session state flow and later payout/dispute logic.',
  },
  {
    category: 'Reports / Disputes',
    question: 'How do reports work?',
    shortAnswer:
      'A report opens a dispute flow so the session can be reviewed.',
    detailedAnswer:
      'If something went wrong, a report can be opened from the session flow. Once that happens, the case may require evidence, moderation review, and a payout/refund decision depending on the facts.',
  },
  {
    category: 'Reports / Disputes',
    question: 'What happens if a dispute is opened?',
    shortAnswer:
      'The session enters dispute handling and the platform reviews the case.',
    detailedAnswer:
      'Disputes are resolved using logs, timestamps, booking/session events, chat evidence, and platform policy. The final outcome may affect payout, refund, warnings, or strikes.',
  },
  {
    category: 'Money / Payments',
    question: 'When does the buyer’s money leave their balance?',
    shortAnswer:
      'The system reserves/holds the payment during the booking flow according to platform rules.',
    detailedAnswer:
      'The platform handles money on-platform rather than leaving it to the users. The exact internal state may vary by flow, but the buyer should understand that booking and session progress can affect fund hold/release timing.',
  },
  {
    category: 'Money / Payments',
    question: 'When does the seller receive the payout?',
    shortAnswer:
      'The seller receives payout after the session flow is properly completed and no unresolved blocker remains.',
    detailedAnswer:
      'Payout timing depends on session completion and dispute/hold rules. The platform does not treat payout settlement and availability state as the same thing.',
  },
  {
    category: 'Money / Payments',
    question: 'Do processing fees get refunded?',
    shortAnswer:
      'Not always. It depends on the platform decision logic and case type.',
    detailedAnswer:
      'Some refund situations return the main held amount but not necessarily every fee component. Internal policy and the specific case path determine the exact outcome.',
  },
  {
    category: 'Blocking / Busy Logic',
    question: 'Why am I marked as busy?',
    shortAnswer:
      'You likely have an unresolved booking/session flow that blocks new activity.',
    detailedAnswer:
      'GameMate uses a single unresolved flow model. This means the system can temporarily block a buyer or seller from opening another unresolved path when one is already active.',
  },
  {
    category: 'Blocking / Busy Logic',
    question: 'Why can’t I create another booking?',
    shortAnswer:
      'Because the system is designed to prevent multiple unresolved flows at the same time.',
    detailedAnswer:
      'This is an intentional product rule. It reduces abuse, confusion, and overlapping states. The exact lock behavior depends on whether you are acting as buyer or seller.',
  },
  {
    category: 'Blocking / Busy Logic',
    question: 'Why is a seller unavailable?',
    shortAnswer:
      'The seller may already be tied to another unresolved flow or may be otherwise blocked by the current system state.',
    detailedAnswer:
      'Availability is not just a visual toggle. It can also reflect current workflow restrictions, unresolved sessions, or state-based locking rules.',
  },
  {
    category: 'Attendance / No-Show',
    question: 'What counts as a no-show?',
    shortAnswer:
      'A no-show usually means one side did not meaningfully appear or participate within the expected session window.',
    detailedAnswer:
      'The final decision depends on logs, timestamps, and surrounding context. The system and moderation tools look at whether the missing side actually failed to participate, or whether the case was more complicated.',
  },
  {
    category: 'Attendance / No-Show',
    question: 'When does the buyer get refunded for a no-show?',
    shortAnswer:
      'Usually when the seller clearly fails to appear or deliver the session as expected.',
    detailedAnswer:
      'Strong log evidence makes this easier. However, if the facts are mixed, the platform may review the case rather than automatically assuming one-sided fault.',
  },
  {
    category: 'Attendance / No-Show',
    question: 'When does a user receive a strike for no-show behavior?',
    shortAnswer:
      'A strike can apply when a no-show is clear and attributable to that user.',
    detailedAnswer:
      'Repeat no-show patterns, clear logs, or abusive attendance behavior can increase severity. Weak evidence should not automatically trigger a harsh trust decision.',
  },
  {
    category: 'Trust & Safety',
    question: 'Why is off-platform payment not allowed?',
    shortAnswer:
      'Because it removes platform protection, evidence quality, and trust safeguards.',
    detailedAnswer:
      'Off-platform payment makes it harder to protect both sides from fraud, abuse, disputes, and missing evidence. That is why the platform treats payment steering as a policy problem.',
  },
  {
    category: 'Trust & Safety',
    question: 'What if someone tries to move the payment outside the platform?',
    shortAnswer:
      'That can trigger policy action such as warnings, strikes, or stronger review depending on severity and repetition.',
    detailedAnswer:
      'The platform may treat clear off-platform payment attempts as trust and safety violations, especially when repeated or aggressively pushed.',
  },
  {
    category: 'Trust & Safety',
    question: 'Can a session be streamed?',
    shortAnswer:
      'Not freely. Streaming, recording, or disclosure without proper expectation/consent can become a privacy issue.',
    detailedAnswer:
      'Users should not assume they can broadcast or expose a session however they want. Privacy-sensitive issues may require moderation review depending on what happened and what was disclosed.',
  },
  {
    category: 'Trust & Safety',
    question: 'How does the platform handle bad behavior?',
    shortAnswer:
      'The platform uses moderation logic, evidence review, and escalating trust actions when needed.',
    detailedAnswer:
      'Not every rude moment gets treated the same way. Severity, repetition, evidence strength, and session impact matter. The platform aims for consistency rather than random punishment.',
  },
  {
    category: 'Support Guidance',
    question: 'How should support answer unclear cases?',
    shortAnswer:
      'Do not overpromise outcomes before the evidence and session logs are reviewed.',
    detailedAnswer:
      'Support should explain the process clearly, avoid declaring winners too early, and stay consistent with moderation policy. If evidence is weak or contradictory, support should avoid absolute statements.',
  },
  {
    category: 'Reports / Disputes',
    question: 'What happens if both users argue or become toxic?',
    shortAnswer:
      'The outcome depends on how much of the session was completed, not a fixed no-refund rule.',
    detailedAnswer:
      'If both participants engage in toxic behavior, the platform does not automatically cancel payout or always deny refund. Very early conflicts may lead to refund, partially completed sessions may lead to partial outcomes, and near-complete sessions usually do not qualify for refund. Both users may still receive warnings or penalties depending on severity.',
  },
  {
    category: 'Reports / Disputes',
    question: 'What if the session started normally but later turned into a conflict?',
    shortAnswer:
      'Partial completion matters. The outcome depends on how much of the session was delivered.',
    detailedAnswer:
      'If a session starts normally but later breaks down due to conflict, the platform evaluates how much of the service was actually completed. This can lead to partial refund, no refund, or other balanced outcomes depending on the case.',
  },
  {
    category: 'Reports / Disputes',
    question: 'What if the other user started the conflict but I also responded?',
    shortAnswer:
      'Your own behavior still matters, even if the other side started it.',
    detailedAnswer:
      'Even if one side initiates toxic behavior, responding with similar behavior can still affect the outcome. The platform evaluates both sides, not just who started it. This may reduce refund eligibility or lead to shared penalties.',
  },
  {
    category: 'Fraud / Abuse',
    question: 'Can someone create conflict on purpose to get a refund?',
    shortAnswer:
      'Yes, but it is treated as abuse and may lead to penalties.',
    detailedAnswer:
      'If a user intentionally provokes or escalates conflict to manipulate refund outcomes, the platform may deny refund eligibility and apply stronger penalties. Repeated patterns of this behavior are treated as abuse.',
  },
]

function Pill({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'good' | 'warn'
}) {
  const styles =
    tone === 'good'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : tone === 'warn'
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      : 'border-slate-700 bg-slate-800 text-slate-200'

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>
      {children}
    </span>
  )
}

function buildReplyText(item: FAQItem, tone: ReplyTone) {
  if (tone === 'friendly') {
    return `Hey, just to clarify:

${item.shortAnswer}

A bit more detail:
${item.detailedAnswer}`
  }

  if (tone === 'firm') {
    return `For clarity:

${item.shortAnswer}

Additional detail:
${item.detailedAnswer}

Please note that final outcomes can still depend on platform review, logs, and policy.`
  }

  return `Q: ${item.question}

Short answer:
${item.shortAnswer}

Detailed answer:
${item.detailedAnswer}`
}

function mapDbRowsToFaqItems(rows: FAQDbRow[]): FAQItem[] {
  return rows.map((item) => ({
    category: item.category,
    question: item.question,
    shortAnswer: item.short_answer,
    detailedAnswer: item.detailed_answer,
  }))
}

export default function AdminSupportFaqPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [tonesByIndex, setTonesByIndex] = useState<Record<number, ReplyTone>>({})
  const [dbFaqs, setDbFaqs] = useState<FAQItem[]>([])
  const [dbStatus, setDbStatus] = useState<'fallback' | 'db'>('fallback')

  const loadFaqs = async () => {
    const { data, error } = await supabase
      .from('support_knowledge')
      .select('id, category, question, short_answer, detailed_answer, keywords, created_at')
      .order('created_at', { ascending: true })

    if (!error && data && data.length > 0) {
      setDbFaqs(mapDbRowsToFaqItems(data as FAQDbRow[]))
      setDbStatus('db')
    } else {
      setDbFaqs([])
      setDbStatus('fallback')
    }
  }

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
      await loadFaqs()
      setLoading(false)
    }

    void load()
  }, [router])

  const sourceFaqs = useMemo(() => {
    return dbFaqs.length > 0 ? dbFaqs : FAQ_ITEMS
  }, [dbFaqs])

  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(sourceFaqs.map((item) => item.category)))]
  }, [sourceFaqs])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()

    return sourceFaqs.filter((item) => {
      const categoryOk = categoryFilter === 'All' || item.category === categoryFilter

      const blob = [
        item.category,
        item.question,
        item.shortAnswer,
        item.detailedAnswer,
      ]
        .join(' ')
        .toLowerCase()

      const queryOk = !q || blob.includes(q)

      return categoryOk && queryOk
    })
  }, [categoryFilter, query, sourceFaqs])

  const handleToneChange = (index: number, tone: ReplyTone) => {
    setTonesByIndex((prev) => ({
      ...prev,
      [index]: tone,
    }))
  }

  const handleCopy = async (item: FAQItem, index: number) => {
    const tone = tonesByIndex[index] || 'neutral'
    const text = buildReplyText(item, tone)

    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      window.setTimeout(() => {
        setCopiedIndex(null)
      }, 1500)
    } catch {
      setCopiedIndex(null)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen  bg-[#020617] text-white">

        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <p className="text-slate-400">Loading support FAQ...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen  bg-[#020617] text-white">


      <section className="mx-auto max-w-[1160px] px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Pill tone="good">Internal</Pill>
              <Pill>Support</Pill>
              <Pill>FAQ</Pill>
              <Pill tone="warn">Copy Ready</Pill>
              <Pill>{dbStatus === 'db' ? 'DB Source' : 'Fallback Source'}</Pill>
            </div>

            <h1 className="text-4xl font-bold">Support / FAQ Reference</h1>
            <p className="mt-2 max-w-3xl text-slate-400">
              Internal answer bank for support-facing explanations about booking flow,
              states, disputes, refunds, busy logic, safety rules, and user questions.
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
              href="/admin/moderation"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Open Moderation Matrix
            </Link>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6">
          <h2 className="text-lg font-bold text-amber-200">Support note</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/90">
            If the case depends on evidence, moderation review, payout decisions, or dispute outcome,
            support should explain the process clearly but should not overstate certainty before review is completed.
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">How support should use this page</h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800  bg-[#020617] p-4">
              <div className="text-sm font-semibold text-white">1. Start with the short answer</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Use the short version first when the user needs a quick, simple explanation.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800  bg-[#020617] p-4">
              <div className="text-sm font-semibold text-white">2. Expand only when needed</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Use the detailed answer when the user is confused, upset, or asking follow-up questions.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800  bg-[#020617] p-4">
              <div className="text-sm font-semibold text-white">3. Stay aligned with policy</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Do not promise outcomes that depend on evidence review, moderation, or unresolved case logic.
              </p>
            </div>
          </div>
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
              placeholder="Search questions, states, refunds, disputes, safety..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none"
            />
          </div>
        </div>

        <div className="space-y-5">
          {filteredItems.map((item, index) => {
            const selectedTone = tonesByIndex[index] || 'neutral'
            const previewText = buildReplyText(item, selectedTone)

            return (
              <div
                key={`${item.category}-${item.question}-${index}`}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="mb-2">
                      <Pill>{item.category}</Pill>
                    </div>
                    <h2 className="text-2xl font-bold text-white">{item.question}</h2>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <select
                      value={selectedTone}
                      onChange={(e) => handleToneChange(index, e.target.value as ReplyTone)}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white outline-none"
                    >
                      <option value="neutral">Neutral</option>
                      <option value="friendly">Friendly</option>
                      <option value="firm">Firm</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => void handleCopy(item, index)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                        copiedIndex === index
                          ? 'bg-emerald-600 text-white'
                          : 'bg-indigo-600 text-white hover:bg-indigo-500'
                      }`}
                    >
                      {copiedIndex === index ? 'Copied' : 'Copy Reply'}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800  bg-[#020617] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">Short answer</div>
                      <Pill tone="good">Fast reply</Pill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.shortAnswer}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-800  bg-[#020617] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">Detailed answer</div>
                      <Pill tone="warn">Expanded</Pill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.detailedAnswer}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-800  bg-[#020617] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">Copy-ready support reply</div>
                    <Pill>{selectedTone.charAt(0).toUpperCase() + selectedTone.slice(1)} tone</Pill>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm leading-6 text-slate-300">
                    {previewText}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}