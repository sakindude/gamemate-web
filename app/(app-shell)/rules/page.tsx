// START_FILE: app/(app-shell)/rules/page.tsx
type RuleSectionProps = {
  number: string
  title: string
  children: React.ReactNode
}

type MiniNoteProps = {
  title: string
  description: string
}

function RuleSection({ number, title, children }: RuleSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
          {number}
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
      </div>

      <div className="space-y-3 text-sm leading-6 text-slate-300">{children}</div>
    </section>
  )
}

function MiniNote({ title, description }: MiniNoteProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  )
}

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1160px] px-8 py-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">GameMate Rules</h1>
          <p className="mt-2 text-slate-400">
            These rules define what is allowed, what is not allowed, and how GameMate
            protects buyers, GameMates, and platform integrity.
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm leading-6 text-slate-300">
            Unless a section clearly says otherwise, these rules apply to both buyers and
            GameMates.
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <MiniNote
            title="Platform First"
            description="Paid activity, payment handling, and dispute-sensitive actions must stay on-platform."
          />
          <MiniNote
            title="Truth Matters"
            description="False claims, fake profiles, manipulation, and dishonest reporting are rule violations."
          />
          <MiniNote
            title="Logs Matter"
            description="Refund, payout, and enforcement outcomes may depend on records, timing, and supporting evidence."
          />
        </div>

        <div className="space-y-6">
          <RuleSection number="1" title="Platform Payments Only">
            <p>
              Payments for bookings, paid session time, extensions, and tipping must stay
              on GameMate.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>You must not request, suggest, or pressure anyone to pay outside the platform.</li>
              <li>You must not move a protected booking or paid session outcome off-platform.</li>
              <li>
                You must not use external payment methods to bypass platform protection,
                review, hold, or dispute systems.
              </li>
            </ul>
            <p className="text-slate-400">
              Off-platform communication is not automatically forbidden, but it must not be
              used to move payment off-platform or to bypass platform protections.
            </p>
          </RuleSection>

          <RuleSection number="2" title="Respectful Conduct">
            <p>
              Harassment, threats, hate, sexual misconduct, coercion, and repeated abusive
              behavior are not allowed.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Do not insult, threaten, intimidate, or deliberately degrade another user.</li>
              <li>Do not sexually harass, pressure, or make unwanted explicit advances.</li>
              <li>Do not use hate speech or target protected characteristics.</li>
              <li>Do not spam, troll, manipulate, or repeatedly pressure the other side.</li>
            </ul>
            <p className="text-slate-400">
              Bad conduct during a session can affect both platform enforcement and dispute
              outcomes.
            </p>
          </RuleSection>

          <RuleSection number="3" title="Attendance and No-Shows">
            <p>
              When a session becomes ready to start, both sides are expected to be
              genuinely ready to begin.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                The start window is 10 minutes after the session enters the ready-to-start
                state.
              </li>
              <li>
                If one side does not start within that window, the platform may treat the
                case as a no-show or failed start flow.
              </li>
              <li>
                Repeated lateness, repeated no-shows, or repeated failure to join may lead
                to restrictions or stronger account action.
              </li>
            </ul>
            <p className="text-slate-400">
              No-show outcomes may depend on logs, timing, session state, and which side
              failed to act.
            </p>
          </RuleSection>

          <RuleSection number="4" title="Disputes and Honest Reporting">
            <p>
              Disputes exist for real payment or session outcome disagreements. They must
              be used honestly.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Do not open false, misleading, or bad-faith disputes.</li>
              <li>Do not fabricate evidence or knowingly make dishonest claims.</li>
              <li>
                If requested, you must provide reasonable supporting information related to
                the issue.
              </li>
              <li>
                The platform may review records, timing, chat, session events, and other
                supporting material when making a decision.
              </li>
            </ul>
            <p className="text-slate-400">
              Support is for help, access, technical issues, and general assistance.
              Disputes are for session or money outcome disagreements.
            </p>
          </RuleSection>

          <RuleSection number="5" title="Refunds, Holds, and Payouts">
            <p>
              Refunds and payouts are not automatically guaranteed in every complaint or
              every completed-looking flow.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Funds may stay locked while a session or dispute is under review.</li>
              <li>
                Refund outcomes may depend on session progress, timing, evidence, and
                dispute findings.
              </li>
              <li>
                Payout may be delayed, reduced, released, or denied depending on the final
                outcome.
              </li>
            </ul>
            <p>
              After one side completes a session, the other side has up to 24 hours from
              the first completion timestamp before the platform may auto-complete the
              remaining confirmation flow.
            </p>
            <p className="text-slate-400">
              Auto-complete does not override the platform’s ability to review fraud,
              misconduct, no-show behavior, or dispute abuse.
            </p>
          </RuleSection>

          <RuleSection number="6" title="Fraud, Abuse, and Account Misuse">
            <p>
              Any attempt to manipulate the platform, payments, trust systems, or account
              reputation is prohibited.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Do not use multiple accounts to manipulate outcomes or visibility.</li>
              <li>Do not create fake bookings, fake activity, fake reviews, or farming behavior.</li>
              <li>Do not abuse tipping, payout, refund, or review systems.</li>
              <li>
                Do not coordinate with linked or controlled accounts to exploit platform
                flows.
              </li>
            </ul>
          </RuleSection>

          <RuleSection number="7" title="Profile Accuracy and Service Integrity">
            <p>
              Profiles must represent the service honestly and must not create false
              expectations.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Do not pretend to be a different person.</li>
              <li>Do not list games, languages, skills, or services you do not actually provide.</li>
              <li>Do not use misleading profile details to win bookings or avoid disputes.</li>
              <li>
                Do not knowingly create a major mismatch between what was promised and what
                was delivered.
              </li>
            </ul>
          </RuleSection>

          <RuleSection number="8" title="Tips, Reviews, and Post-Session Eligibility">
            <p>
              Tips and reviews are tied to eligible completed sessions and platform
              integrity.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Tips are only allowed after an eligible completed session.</li>
              <li>Reviews are only allowed after an eligible completed session.</li>
              <li>
                Open disputes may delay or block review and other post-session actions
                until the outcome is resolved.
              </li>
              <li>
                If the final outcome shows abuse, fraud, or clear ineligibility, related
                post-session actions may be limited or removed.
              </li>
            </ul>
          </RuleSection>

          <RuleSection number="9" title="Privacy and Safety Basics">
            <p>
              Users must respect privacy and must not misuse personal information or
              sensitive material.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Do not request or expose sensitive personal information without a valid reason.</li>
              <li>Do not share private information to pressure, threaten, or exploit someone.</li>
              <li>Do not record or publish private material without appropriate permission.</li>
              <li>
                Do not pressure users into unsafe contact, unsafe disclosure, or behavior
                that weakens platform protections.
              </li>
            </ul>
          </RuleSection>

          <RuleSection number="10" title="Enforcement">
            <p>
              Violations may lead to warnings, restrictions, feature limitations, reduced
              visibility, review limitations, payout controls, suspension, or permanent
              removal where necessary.
            </p>
            <p>
              GameMate may consider severity, repetition, intent, evidence, linked abuse
              patterns, and overall platform risk when deciding enforcement.
            </p>
            <p className="text-slate-400">
              Not every violation receives the same outcome. Repeated abuse or high-risk
              behavior may lead to stronger action.
            </p>
          </RuleSection>
        </div>
      </section>
    </main>
  )
}
// END_FILE