'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

const categories = [
  'User was rude',
  'Harassment',
  'No show',
  'Payment issue',
  'Technical problem',
  'Other',
]

type SupportKnowledgeItem = {
  category: string
  question: string
  answer: string
  keywords: string[]
}

type MatchItem = {
  item: SupportKnowledgeItem
  score: number
}

type StatusType = 'success' | 'error' | 'info' | ''

const fallbackSupportKnowledge: SupportKnowledgeItem[] = [
  {
    category: 'Booking Basics',
    question: 'Why is my booking pending?',
    answer:
      'Your booking is still waiting for the seller to accept it. A pending booking does not mean the session has started yet.',
    keywords: ['pending', 'waiting', 'accept', 'accepted', 'seller not responding'],
  },
  {
    category: 'Booking Basics',
    question: 'Why can’t I create another booking?',
    answer:
      'You likely already have an unresolved booking or session flow. GameMate uses a single unresolved flow model, so you may need to finish or resolve the current flow first.',
    keywords: [
      'another booking',
      'cannot book',
      'cant book',
      'can’t book',
      'busy',
      'blocked',
      'unresolved',
    ],
  },
  {
    category: 'Money / Refunds',
    question: 'When do I get refunded?',
    answer:
      'Refunds are not automatic in every case. Refund outcomes depend on session flow, logs, timing, evidence, and platform policy.',
    keywords: ['refund', 'money back', 'iade', 'payment issue', 'fee', 'refunded'],
  },
  {
    category: 'Attendance / No-Show',
    question: 'What happens if someone does not show up?',
    answer:
      'No-show cases are reviewed using logs and session activity. Clear seller no-show may lead to refund. Buyer no-show may not.',
    keywords: ['no show', 'did not show', 'didnt show', 'didn’t show', 'late', 'missing'],
  },
  {
    category: 'Availability',
    question: 'Why is the seller unavailable?',
    answer:
      'The seller may already be in another session or blocked by the current system state. Availability is not only a visual toggle.',
    keywords: ['unavailable', 'offline', 'seller unavailable', 'not available'],
  },
  {
    category: 'Session States',
    question: 'What does active mean?',
    answer: 'Active means the session has started and is currently in progress.',
    keywords: ['active', 'session active', 'in progress'],
  },
  {
    category: 'Session States',
    question: 'What does awaiting confirmation mean?',
    answer:
      'It means one side already completed their part and the other side still needs to confirm completion.',
    keywords: ['awaiting confirmation', 'confirmation', 'complete', 'completed'],
  },
  {
    category: 'Reports / Disputes',
    question: 'What happens if a dispute is opened?',
    answer:
      'A dispute puts the case into review. Final outcomes depend on logs, evidence, and platform policy.',
    keywords: ['dispute', 'report', 'reported', 'review', 'case'],
  },
  {
    category: 'Trust & Safety',
    question: 'Why is off-platform payment not allowed?',
    answer:
      'Off-platform payment removes platform protection and may lead to account penalties. Keeping payment on-platform is the safest option.',
    keywords: ['off platform', 'outside payment', 'discord payment', 'steam payment', 'cash'],
  },
  {
    category: 'Trust & Safety',
    question: 'Can a session be streamed?',
    answer:
      'Streaming, recording, or disclosure without proper expectation or consent may become a privacy issue and can require review.',
    keywords: ['stream', 'streamed', 'record', 'recorded', 'privacy'],
  },
]

const primaryPanelClasses =
  'relative overflow-hidden rounded-[30px] border border-[rgba(164,82,58,0.20)] bg-[linear-gradient(180deg,rgba(18,11,13,0.96)_0%,rgba(11,7,9,0.985)_100%)] shadow-[inset_0_1px_0_rgba(255,170,130,0.04),0_16px_40px_rgba(0,0,0,0.24)]'

const secondaryPanelClasses =
  'relative overflow-hidden rounded-[28px] border border-[rgba(103,57,43,0.16)] bg-[linear-gradient(180deg,rgba(15,10,12,0.95)_0%,rgba(10,7,9,0.98)_100%)] shadow-[inset_0_1px_0_rgba(255,145,110,0.025),0_12px_24px_rgba(0,0,0,0.16)]'

const subtlePanelClasses =
  'relative overflow-hidden rounded-[24px] border border-[rgba(88,49,39,0.14)] bg-[linear-gradient(180deg,rgba(13,10,12,0.88)_0%,rgba(9,7,9,0.94)_100%)] shadow-[inset_0_1px_0_rgba(255,140,110,0.02)]'

const fieldClasses =
  'w-full rounded-[20px] border border-[rgba(97,58,47,0.18)] bg-[linear-gradient(180deg,rgba(10,13,18,0.84)_0%,rgba(8,10,14,0.96)_100%)] px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.02),inset_0_-10px_20px_rgba(0,0,0,0.22)] outline-none transition placeholder:text-[#7f7a80] hover:border-[rgba(119,71,57,0.24)] focus:border-[rgba(176,95,70,0.34)] focus:ring-2 focus:ring-[rgba(176,95,70,0.12)]'

const selectClasses =
  'w-full rounded-[18px] border border-[rgba(97,58,47,0.18)] bg-[linear-gradient(180deg,rgba(10,13,18,0.84)_0%,rgba(8,10,14,0.96)_100%)] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] outline-none transition hover:border-[rgba(119,71,57,0.24)] focus:border-[rgba(176,95,70,0.34)] focus:ring-2 focus:ring-[rgba(176,95,70,0.12)]'

const primaryButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#a24c35_0%,#783221_100%)] px-6 py-3 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,196,166,0.10)] transition hover:bg-[linear-gradient(180deg,#b1553c_0%,#853826_100%)] disabled:cursor-not-allowed disabled:opacity-60'

const secondaryButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] border border-[rgba(118,68,54,0.22)] bg-[linear-gradient(180deg,rgba(18,10,12,0.76)_0%,rgba(12,7,9,0.92)_100%)] px-6 py-3 font-semibold text-[#ead7d0] transition hover:border-[rgba(149,81,61,0.28)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60'

const quietButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] border border-[rgba(114,66,53,0.18)] bg-[linear-gradient(180deg,rgba(16,10,12,0.68)_0%,rgba(10,7,9,0.84)_100%)] px-4 py-2.5 text-sm font-semibold text-[#ead8d1] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition hover:border-[rgba(144,78,58,0.24)] hover:text-white'

function matchSupportKnowledge(query: string, supportKnowledge: SupportKnowledgeItem[]) {
  const text = query.trim().toLowerCase()
  if (!text) return [] as MatchItem[]

  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)

  const results: MatchItem[] = []

  for (const item of supportKnowledge) {
    let score = 0

    const questionText = item.question.toLowerCase()
    const answerText = item.answer.toLowerCase()
    const keywordList = item.keywords.map((k) => k.toLowerCase())
    const haystack = `${questionText} ${answerText} ${keywordList.join(' ')}`

    let keywordHits = 0
    let tokenHits = 0

    for (const keyword of keywordList) {
      if (!keyword) continue
      if (text.includes(keyword)) {
        score += keyword.includes(' ') ? 5 : 3
        keywordHits += 1
      }
    }

    if (text && questionText.includes(text)) {
      score += 4
    }

    for (const token of tokens) {
      if (token.length <= 2) continue
      if (haystack.includes(token)) {
        score += 1
        tokenHits += 1
      }
    }

    if (keywordHits >= 2) {
      score += 3
    }

    if (tokenHits >= 4) {
      score += 2
    }

    if (score >= 3) {
      results.push({
        item,
        score,
      })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 4)
}

function Eyebrow({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a68378]">
      {children}
    </div>
  )
}

function PanelTopAccent({
  strength = 'soft',
}: {
  strength?: 'soft' | 'strong'
}) {
  return (
    <span
      className={`pointer-events-none absolute left-8 right-8 top-0 h-px ${
        strength === 'strong'
          ? 'bg-[linear-gradient(90deg,transparent_0%,rgba(226,118,84,0.16)_50%,transparent_100%)]'
          : 'bg-[linear-gradient(90deg,transparent_0%,rgba(190,96,67,0.09)_50%,transparent_100%)]'
      }`}
    />
  )
}

function ThemedPanel({
  children,
  tone = 'secondary',
  className = '',
}: {
  children: React.ReactNode
  tone?: 'primary' | 'secondary' | 'subtle'
  className?: string
}) {
  const classes =
    tone === 'primary'
      ? primaryPanelClasses
      : tone === 'subtle'
        ? subtlePanelClasses
        : secondaryPanelClasses

  return (
    <div className={`${classes} ${className}`}>
      <PanelTopAccent strength={tone === 'primary' ? 'strong' : 'soft'} />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

function ThemedChip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'warm' | 'success'
}) {
  const classes =
    tone === 'warm'
      ? 'border-[rgba(171,84,59,0.22)] bg-[rgba(109,44,30,0.16)] text-[#efc1b2]'
      : tone === 'success'
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
        : 'border-[rgba(104,63,53,0.20)] bg-[rgba(17,12,14,0.68)] text-[#ccb5ae]'

  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${classes}`}>
      {children}
    </span>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-5">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-2 text-xl font-semibold tracking-[-0.01em] text-white md:text-2xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[#c2b2ac]">{description}</p>
      ) : null}
    </div>
  )
}

function AutoAnswerCard({
  category,
  question,
  answer,
}: {
  category: string
  question: string
  answer: string
}) {
  return (
    <ThemedPanel tone="primary" className="p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ThemedChip tone="success">Best answer</ThemedChip>
        <ThemedChip tone="warm">{category}</ThemedChip>
      </div>

      <h3 className="text-xl font-semibold tracking-[-0.01em] text-white">{question}</h3>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#d9c9c2]">{answer}</p>
    </ThemedPanel>
  )
}

function RelatedAnswerCard({
  category,
  question,
  answer,
}: {
  category: string
  question: string
  answer: string
}) {
  return (
    <ThemedPanel tone="subtle" className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ThemedChip>Related</ThemedChip>
        <ThemedChip>{category}</ThemedChip>
      </div>

      <h4 className="text-sm font-semibold text-white">{question}</h4>
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-6 text-[#aea19f]">
        {answer}
      </p>
    </ThemedPanel>
  )
}

function TicketHelpDetails() {
  return (
    <ThemedPanel tone="subtle" className="p-4">
      <p className="text-sm font-semibold text-white">Helpful details</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-[#b8a7a2]">
        <li>what happened</li>
        <li>when it happened</li>
        <li>which session or booking this is about</li>
        <li>what the other side or system did</li>
        <li>what result you are expecting</li>
      </ul>
    </ThemedPanel>
  )
}

function FeedbackBox({
  message,
  type,
}: {
  message: string
  type: StatusType
}) {
  if (!message || !type) return null

  const classes =
    type === 'error'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
      : type === 'success'
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
        : 'border-[rgba(116,66,52,0.20)] bg-[rgba(15,10,12,0.84)] text-[#e6d7d1]'

  return (
    <div className={`rounded-[22px] border px-4 py-3 text-sm leading-6 ${classes}`}>
      {message}
    </div>
  )
}

export default function SupportClient() {
  const { user, loading: authLoading } = useAuth()

  const [questionInput, setQuestionInput] = useState('')
  const [helpQuery, setHelpQuery] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [statusMsg, setStatusMsg] = useState('')
  const [statusType, setStatusType] = useState<StatusType>('')
  const [showTicketForm, setShowTicketForm] = useState(false)
  const [autoAnswerChecked, setAutoAnswerChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const supportKnowledge = useMemo(() => fallbackSupportKnowledge, [])

  const matches = useMemo(() => {
    return matchSupportKnowledge(helpQuery, supportKnowledge)
  }, [helpQuery, supportKnowledge])

  const primaryMatch = matches.length > 0 ? matches[0] : null
  const relatedMatches = matches.slice(1, 4)

  const openTicketWithGuidance = (
    prefillAnswer?: string,
    matchCategory?: string,
    sourceQuestion?: string
  ) => {
    const effectiveQuestion = sourceQuestion || helpQuery || questionInput.trim()

    setShowTicketForm(true)

    if (matchCategory) {
      if (matchCategory.includes('Refund') || matchCategory.includes('Payment')) {
        setCategory('Payment issue')
      }
      if (matchCategory.includes('No-Show')) {
        setCategory('No show')
      }
      if (matchCategory.includes('Harassment')) {
        setCategory('Harassment')
      }
    }

    if (!message.trim()) {
      if (prefillAnswer) {
        setMessage(
          `Question: ${effectiveQuestion}

Automatic answer I saw:
${prefillAnswer}

Please review this case more closely.

Helpful details:
- what happened:
- when it happened:
- which session or booking this is about:
- what the other side or system did:
- what result I am expecting:
`
        )
      } else {
        setMessage(
          `Question: ${effectiveQuestion}

Please review this case more closely.

Helpful details:
- what happened:
- when it happened:
- which session or booking this is about:
- what the other side or system did:
- what result I am expecting:
`
        )
      }
    }

    setStatusMsg('')
    setStatusType('')
  }

  const submit = async () => {
    if (submitting) return

    if (!message.trim()) {
      setStatusMsg('Write your ticket message first.')
      setStatusType('error')
      return
    }

    if (authLoading) {
      setStatusMsg('Your account status is still loading. Please wait a moment and try again.')
      setStatusType('info')
      return
    }

    if (!user?.id) {
      setStatusMsg('You must be logged in to open a ticket.')
      setStatusType('error')
      return
    }

    setSubmitting(true)

    try {
      const { error } = await supabase.from('support_tickets').insert({
        user_id: user.id,
        type: 'support',
        category,
        message,
      })

      if (error) {
        setStatusMsg(error.message)
        setStatusType('error')
        return
      }

      setStatusMsg('Your support ticket was submitted successfully.')
      setStatusType('success')
      setMessage('')
      setQuestionInput('')
      setHelpQuery('')
      setShowTicketForm(false)
      setAutoAnswerChecked(false)
    } catch (error) {
      console.error('support ticket submit threw:', error)
      setStatusMsg('Support is temporarily unavailable. Please try again shortly.')
      setStatusType('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_18%,rgba(132,58,35,0.12),transparent_20%),radial-gradient(circle_at_10%_80%,rgba(92,39,28,0.06),transparent_18%),radial-gradient(circle_at_100%_0%,rgba(48,20,20,0.04),transparent_16%),radial-gradient(circle_at_50%_32%,rgba(7,8,11,0.18)_0%,rgba(7,8,11,0.74)_38%,rgba(6,7,9,0.98)_78%),linear-gradient(180deg,#0b0b0d_0%,#08080a_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,0,0,0.20),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.02] [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.95)_0.7px,transparent_0.7px)] [background-size:14px_14px]" />

      <div className="relative z-10 mx-auto max-w-[1180px] px-6 py-8 md:px-8 md:py-10">
        <div className="mx-auto max-w-[980px]">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Eyebrow>Support Center</Eyebrow>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.025em] text-white md:text-4xl">
                Support
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#b7a8a3] md:text-[15px]">
                Ask your question first. If the answer does not solve it, continue to a support
                ticket for a closer review.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/support/tickets" className={quietButtonClasses}>
                My Tickets
              </Link>
            </div>
          </div>

          <div className="space-y-5">
            <ThemedPanel tone="primary" className="p-5 md:p-6">
              <SectionHeader
                eyebrow="Ask first"
                title="Ask your question"
                description="The best first action is to check for a direct answer here. If it does not solve the issue, continue to a support ticket below."
              />

              <label className="mb-3 block text-sm font-semibold text-[#f1e2db]">
                What do you need help with?
              </label>

              <textarea
                placeholder="Example: Why is my booking still pending?"
                value={questionInput}
                onChange={(e) => {
                  setQuestionInput(e.target.value)
                  setHelpQuery('')
                  setAutoAnswerChecked(false)
                  setStatusMsg('')
                  setStatusType('')
                }}
                className={`${fieldClasses} min-h-[138px] resize-y`}
              />

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const nextQuery = questionInput.trim()

                    if (!nextQuery) {
                      setStatusMsg('Write your question first.')
                      setStatusType('info')
                      setAutoAnswerChecked(false)
                      setHelpQuery('')
                      return
                    }

                    setHelpQuery(nextQuery)
                    setAutoAnswerChecked(true)
                    setStatusMsg('')
                    setStatusType('')
                  }}
                  className={primaryButtonClasses}
                >
                  Get Help
                </button>

                <button
                  type="button"
                  onClick={() => {
                    openTicketWithGuidance()
                  }}
                  className={secondaryButtonClasses}
                >
                  Open Ticket
                </button>
              </div>
            </ThemedPanel>

            {autoAnswerChecked && (
              <div className="space-y-5">
                {primaryMatch ? (
                  <>
                    <AutoAnswerCard
                      category={primaryMatch.item.category}
                      question={primaryMatch.item.question}
                      answer={primaryMatch.item.answer}
                    />

                    {relatedMatches.length > 0 && (
                      <ThemedPanel tone="secondary" className="p-4 md:p-5">
                        <p className="mb-4 text-sm font-semibold text-white">
                          You may also want to check
                        </p>

                        <div className="grid gap-3">
                          {relatedMatches.map((match, index) => (
                            <RelatedAnswerCard
                              key={`${match.item.category}-${match.item.question}-${index}`}
                              category={match.item.category}
                              question={match.item.question}
                              answer={match.item.answer}
                            />
                          ))}
                        </div>
                      </ThemedPanel>
                    )}

                    <ThemedPanel tone="secondary" className="p-5">
                      <p className="text-sm font-semibold text-white">Need more help?</p>
                      <p className="mt-2 text-sm leading-7 text-[#c5b5af]">
                        If this did not solve the issue, continue to a support ticket and include
                        the details below so the case can be reviewed faster.
                      </p>

                      <div className="mt-4">
                        <TicketHelpDetails />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowTicketForm(false)
                            setStatusMsg('Glad that solved it. No ticket was needed.')
                            setStatusType('success')
                          }}
                          className="inline-flex items-center justify-center rounded-[18px] border border-emerald-500/18 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/15"
                        >
                          This solved it
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            openTicketWithGuidance(
                              primaryMatch.item.answer,
                              primaryMatch.item.category,
                              helpQuery
                            )
                          }}
                          className={primaryButtonClasses}
                        >
                          Continue to Ticket
                        </button>
                      </div>
                    </ThemedPanel>
                  </>
                ) : (
                  <ThemedPanel tone="secondary" className="p-5 md:p-6">
                    <h2 className="text-lg font-semibold text-white">Still need help?</h2>

                    <p className="mt-3 text-sm leading-7 text-[#c5b5af]">
                      No direct answer matched your question closely enough. The next step is to
                      open a support ticket with the key details of what happened.
                    </p>

                    <div className="mt-4">
                      <TicketHelpDetails />
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          openTicketWithGuidance(undefined, undefined, helpQuery)
                        }}
                        className={primaryButtonClasses}
                      >
                        Continue to Ticket
                      </button>
                    </div>
                  </ThemedPanel>
                )}
              </div>
            )}

            {showTicketForm && (
              <ThemedPanel tone="secondary" className="p-5 md:p-6">
                <SectionHeader
                  eyebrow="Support request"
                  title="Open Support Ticket"
                  description="Choose the closest category and describe the issue clearly. Include the session or booking if it matters."
                />

                <div className="space-y-4">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={selectClasses}
                    style={{ colorScheme: 'dark' }}
                  >
                    {categories.map((c) => (
                      <option
                        key={c}
                        value={c}
                        style={{
                          backgroundColor: '#101317',
                          color: '#f3e5de',
                        }}
                      >
                        {c}
                      </option>
                    ))}
                  </select>

                  <textarea
                    placeholder="Describe your issue..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className={`${fieldClasses} min-h-[220px] resize-y`}
                  />

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={submitting}
                      className={primaryButtonClasses}
                    >
                      {submitting ? 'Submitting...' : 'Submit Ticket'}
                    </button>

                    <Link href="/support/tickets" className={secondaryButtonClasses}>
                      My Tickets
                    </Link>
                  </div>
                </div>
              </ThemedPanel>
            )}

            <FeedbackBox message={statusMsg} type={statusType} />
          </div>
        </div>
      </div>
    </main>
  )
}