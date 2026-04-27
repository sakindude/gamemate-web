// START_FILE: app/(app-shell)/guide/page.tsx
'use client'

function GuideSection({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: React.ReactNode
}) {
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

function MiniCard({
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
  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1160px] px-8 py-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">Guide</h1>
          <p className="mt-2 max-w-3xl text-slate-400">
            Learn how GameMate works from booking to completion, how payment protection
            works, when disputes make sense, and when you should contact support instead.
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <MiniCard
            title="Duration Based"
            description="You book session time, not a calendar slot. The total price is based on the selected duration."
          />
          <MiniCard
            title="Two-Sided Start"
            description='A session becomes active only when both sides press "Start Session".'
          />
          <MiniCard
            title="Protected Payment"
            description="Funds are collected first and held on-platform until the session flow is completed or reviewed."
          />
        </div>

        <div className="space-y-6">
          <GuideSection number="1" title="What GameMate Is">
            <p>
              GameMate is a platform where buyers can book a GameMate for paid gaming
              sessions.
            </p>
            <p>
              The core flow is simple: browse profiles, send a booking request, wait for
              accept or reject, start together, complete the session on-platform, and use
              dispute or support only when needed.
            </p>
            <p className="text-slate-400">
              The safest experience is when the full flow stays on-platform from payment
              to completion.
            </p>
          </GuideSection>

          <GuideSection number="2" title="How Booking Works">
            <p>
              Start on Explore and choose a GameMate that matches your game, language,
              communication style, and budget.
            </p>
            <p>
              Open the profile, review the details, then choose the duration you want.
              The total price is based on the GameMate&apos;s rate and your selected time.
            </p>
            <p>
              When you submit the request, payment is collected and placed into a protected
              hold. It is not released to the GameMate immediately.
            </p>
            <p>
              After that, the request enters{' '}
              <span className="font-semibold text-slate-200">pending</span>. If the
              GameMate accepts, the session becomes{' '}
              <span className="font-semibold text-slate-200">ready to start</span>. If the
              request is rejected, the booking does not continue into a normal session
              flow.
            </p>
          </GuideSection>

          <GuideSection number="3" title="Starting and Running a Session">
            <p>
              After acceptance, both sides can use platform chat to coordinate the game,
              connection method, and any final details before starting.
            </p>
            <p>
              The official paid session begins only when both sides press{' '}
              <span className="font-semibold text-slate-200">Start Session</span>.
            </p>
            <p>
              This is a two-sided start system. Payment alone does not start the timer,
              and chat alone does not start the timer.
            </p>
            <p>
              Once both sides start, the session becomes{' '}
              <span className="font-semibold text-slate-200">active</span> and the
              purchased time begins counting down.
            </p>
            <p className="text-slate-400">
              If a session is ready to start but one side does not join the start flow in
              time, the platform may treat that as a no-show based on the session window
              and available logs.
            </p>
          </GuideSection>

          <GuideSection number="4" title="Starting Window and Completing a Session">
            <p>
              A ready-to-start session is expected to move forward promptly. In normal
              cases, both sides should start within the first 10 minutes of the ready
              state.
            </p>
            <p>
              When the session ends, both sides should complete it through the platform.
              If one side completes first, the session can move into{' '}
              <span className="font-semibold text-slate-200">awaiting confirmation</span>.
            </p>
            <p>
              If the other side does not confirm, the platform may auto-complete the
              session after 24 hours, counted from the first completion action.
            </p>
            <p className="text-slate-400">
              Do not try to settle session results outside the platform. Completion state,
              payout handling, and review eligibility depend on the official flow.
            </p>
          </GuideSection>

          <GuideSection number="5" title="Balance, Locked Funds, Refunds, and Payouts">
            <p>
              Your available balance is the amount that is currently usable. Locked funds
              are different. Locked funds are tied to an active booking or session flow and
              are temporarily held for safety.
            </p>
            <p>
              This protection does not mean every problem leads to an automatic refund, and
              it does not mean every completed session leads to an instant payout.
            </p>
            <p>
              Final money outcomes depend on what happened in the session, the platform
              state, relevant logs, and any review or dispute outcome.
            </p>
            <div className="grid gap-4 pt-2 md:grid-cols-2">
              <MiniCard
                title="Buyer View"
                description="Payment is collected first, then held while the request and session flow are processed."
              />
              <MiniCard
                title="GameMate View"
                description="Payout can remain on hold until the session is completed normally or any dispute is resolved."
              />
            </div>
          </GuideSection>

          <GuideSection number="6" title="Tips and Reviews">
            <p>
              Tips are post-session only. A tip can only happen after an eligible completed
              session.
            </p>
            <p>
              Reviews are also tied to eligible completed sessions. Reviews are not meant
              for random interaction outside a real completed session flow.
            </p>
            <p>
              If a session is still under dispute or has not reached an eligible completed
              state, tips and reviews may be unavailable until the flow is resolved.
            </p>
            <p className="text-slate-400">
              Reviews matter because they help other users understand reliability, conduct,
              and overall experience quality on the platform.
            </p>
          </GuideSection>

          <GuideSection number="7" title="Disputes and No-Shows">
            <p>
              Use a dispute when there is a real disagreement about session outcome or
              money outcome.
            </p>
            <p>
              Good examples include no-show, serious service mismatch, major misconduct
              during the session, or disagreement about what actually happened in the paid
              flow.
            </p>
            <p>
              A no-show usually means one side did not properly join or continue the
              session flow when they were expected to do so. Repeated no-show behavior can
              lead to warnings, restrictions, payout loss, or stronger account action.
            </p>
            <p>
              Dispute outcomes may include buyer favor, seller favor, or partial outcome,
              depending on the facts and the available records.
            </p>
            <p className="text-slate-400">
              Do not open a dispute just because the session felt awkward, disappointing,
              or not perfect. False or misleading disputes can damage your account.
            </p>
          </GuideSection>

          <GuideSection number="8" title="Seller Mode, Online Status, and Explore Visibility">
            <p>
              Being a GameMate means you are offering paid sessions through your profile.
            </p>
            <p>
              Online status is a visibility signal, not just a cosmetic switch. If a
              GameMate is shown as online, buyers may reasonably expect that new requests
              can be reviewed and handled.
            </p>
            <p>
              Explore visibility can also depend on platform state. A GameMate may appear
              unavailable if they are offline, already tied to another unresolved flow, or
              temporarily blocked by current booking or session state.
            </p>
            <p className="text-slate-400">
              This helps prevent overlapping sessions, messy state conflicts, and abuse of
              the booking system.
            </p>
          </GuideSection>

          <GuideSection number="9" title="Getting Help">
            <p>
              Use support for account help, technical issues, general questions, or
              clarification about how the product works.
            </p>
            <p>
              Use a dispute for session outcome or payment outcome disagreement.
            </p>
            <div className="grid gap-4 pt-2 md:grid-cols-2">
              <MiniCard
                title="Use Support When"
                description="You need help with login, account access, product behavior, technical trouble, or general assistance."
              />
              <MiniCard
                title="Use Dispute When"
                description="You disagree about what happened in a paid session or how the session/payment outcome should be handled."
              />
            </div>
            <p className="text-slate-400">
              Keeping this distinction clean helps the platform resolve problems faster and
              with less confusion.
            </p>
          </GuideSection>

          <InfoCard title="Session States at a Glance">
            <div className="grid gap-4 md:grid-cols-2">
              <MiniCard
                title="Pending"
                description="The request exists, but the GameMate has not accepted it yet."
              />
              <MiniCard
                title="Ready to Start"
                description="The request was accepted. The session is waiting for both sides to press Start Session."
              />
              <MiniCard
                title="Active"
                description="Both sides started. The official paid timer is now running."
              />
              <MiniCard
                title="Awaiting Confirmation"
                description="One side completed, but the other side has not confirmed yet."
              />
            </div>
          </InfoCard>

          <InfoCard title="Safety Reminder">
            <p>
              Keep payment on-platform. Off-platform payment requests, pressure, or attempts
              to bypass platform protection are not safe and can affect dispute handling.
            </p>
            <p>
              Platform-official steps matter: booking, payment, start, completion, dispute,
              and support all work best when they stay inside the product.
            </p>
            <p className="text-slate-400">
              Off-platform communication may reduce clarity and protection if it is used to
              pressure users, hide facts, or bypass platform safeguards.
            </p>
          </InfoCard>
        </div>
      </section>
    </main>
  )
}
// END_FILE: app/(app-shell)/guide/page.tsx