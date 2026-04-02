'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TopNav from '../../../components/TopNav'
import StartChatButton from '../../../components/StartChatButton'

type Profile = {
  id: string
  display_name: string | null
  bio: string | null
  country: string | null
  timezone: string | null
  gender: string | null
  hourly_price: number | null
  primary_games: string[] | null
  languages: string[] | null
  communication_methods: string[] | null
}

type SellerRatingStat = {
  seller_id: string
  avg_rating: number | null
  review_count: number
  avg_skill: number | null
  avg_communication: number | null
  avg_vibe: number | null
  avg_reliability: number | null
  avg_tech_quality: number | null
}

type BuyerRatingStat = {
  buyer_id: string
  avg_rating: number | null
  review_count: number
  avg_politeness: number | null
  avg_communication: number | null
  avg_reliability: number | null
  avg_easy_to_play_with: number | null
  avg_respect: number | null
}

type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  buyer_id: string
}

type BuyerMap = Record<string, string>

type FavoriteRow = {
  seller_id: string
}

const SELLER_STAT_ITEMS = [
  { key: 'avg_skill', label: 'Skill' },
  { key: 'avg_communication', label: 'Communication' },
  { key: 'avg_vibe', label: 'Vibe' },
  { key: 'avg_reliability', label: 'Reliability' },
  { key: 'avg_tech_quality', label: 'Tech Quality' },
] as const

const BUYER_STAT_ITEMS = [
  { key: 'avg_politeness', label: 'Politeness' },
  { key: 'avg_communication', label: 'Communication' },
  { key: 'avg_reliability', label: 'Reliability' },
  { key: 'avg_easy_to_play_with', label: 'Easy To Play With' },
  { key: 'avg_respect', label: 'Respect' },
] as const

const genderMeta = (gender: string | null) => {
  switch (gender) {
    case 'male':
      return { label: 'Male', icon: '♂️' }
    case 'female':
      return { label: 'Female', icon: '♀️' }
    case 'non_binary':
      return { label: 'Non-binary', icon: '⚧️' }
    case 'prefer_not_to_say':
      return { label: 'Prefer not to say', icon: '•' }
    default:
      return null
  }
}

function getRatingTheme(rating: number | null) {
  if (rating === null) {
    return {
      text: 'text-slate-300',
      bar: 'bg-slate-600',
      glow: 'shadow-none',
      label: 'New',
    }
  }

  if (rating >= 4.75) {
    return {
      text: 'text-emerald-300',
      bar: 'bg-emerald-500',
      glow: 'shadow-[0_0_24px_rgba(16,185,129,0.38)]',
      label: 'Elite',
    }
  }

  if (rating >= 4.2) {
    return {
      text: 'text-lime-300',
      bar: 'bg-lime-500',
      glow: 'shadow-[0_0_22px_rgba(132,204,22,0.32)]',
      label: 'Strong',
    }
  }

  if (rating >= 3.5) {
    return {
      text: 'text-amber-300',
      bar: 'bg-amber-500',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.30)]',
      label: 'Mixed',
    }
  }

  if (rating >= 2.5) {
    return {
      text: 'text-orange-300',
      bar: 'bg-orange-500',
      glow: 'shadow-[0_0_18px_rgba(249,115,22,0.28)]',
      label: 'Risky',
    }
  }

  return {
    text: 'text-rose-300',
    bar: 'bg-rose-500',
    glow: 'shadow-[0_0_20px_rgba(244,63,94,0.30)]',
    label: 'Bad',
  }
}

function RatingPower({
  rating,
  reviewCount,
}: {
  rating: number | null
  reviewCount: number
}) {
  const safeRating = rating ?? 0
  const percent = Math.max(0, Math.min((safeRating / 5) * 100, 100))
  const theme = getRatingTheme(rating)

  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-lg font-semibold text-slate-200">Overall Reputation</div>
        <div className={`text-lg font-bold ${theme.text}`}>
          {rating === null ? 'No ratings yet' : `${safeRating.toFixed(2)} / 5`}
        </div>
      </div>

      <div className="h-4 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${theme.bar} ${theme.glow}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className={theme.text}>{theme.label}</span>
        <span className="text-slate-400">
          {reviewCount} review{reviewCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}

function StatBar({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  const safe = value ?? 0
  const percent = Math.max(0, Math.min((safe / 5) * 100, 100))

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <span className="text-sm font-bold text-slate-300">
          {value === null ? '-' : safe.toFixed(2)}
        </span>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [sellerStats, setSellerStats] = useState<SellerRatingStat | null>(null)
  const [buyerStats, setBuyerStats] = useState<BuyerRatingStat | null>(null)
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [buyerMap, setBuyerMap] = useState<BuyerMap>({})
  const [favoriteSellerIds, setFavoriteSellerIds] = useState<string[]>([])
  const [favoriteBusy, setFavoriteBusy] = useState(false)

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
      setCurrentUserId(session.user.id)

      const [
        { data: profileData, error: profileError },
        { data: sellerStatsData },
        { data: buyerStatsData },
        { data: reviewData },
        { data: favoriteData },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, display_name, bio, country, timezone, gender, hourly_price, primary_games, languages, communication_methods'
          )
          .eq('id', id)
          .single(),
        supabase
          .from('seller_rating_stats')
          .select(
            'seller_id, avg_rating, review_count, avg_skill, avg_communication, avg_vibe, avg_reliability, avg_tech_quality'
          )
          .eq('seller_id', id)
          .maybeSingle(),
        supabase
          .from('buyer_rating_stats')
          .select(
            'buyer_id, avg_rating, review_count, avg_politeness, avg_communication, avg_reliability, avg_easy_to_play_with, avg_respect'
          )
          .eq('buyer_id', id)
          .maybeSingle(),
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at, buyer_id')
          .eq('seller_id', id)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('favorite_sellers')
          .select('seller_id')
          .eq('user_id', session.user.id),
      ])

      if (!profileError) {
        setProfile(profileData as Profile)
      }

      setSellerStats((sellerStatsData || null) as SellerRatingStat | null)
      setBuyerStats((buyerStatsData || null) as BuyerRatingStat | null)

      const reviewRows = (reviewData || []) as ReviewRow[]
      setReviews(reviewRows)

      const buyerIds = [...new Set(reviewRows.map((r) => r.buyer_id).filter(Boolean))]

      if (buyerIds.length > 0) {
        const { data: buyers } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', buyerIds)

        const map: BuyerMap = {}
        ;(buyers || []).forEach((buyer: any) => {
          map[buyer.id] = buyer.display_name || 'Unknown user'
        })
        setBuyerMap(map)
      }

      setFavoriteSellerIds(
        ((favoriteData || []) as FavoriteRow[]).map((row) => row.seller_id)
      )

      setLoading(false)
    }

    void load()
  }, [id, router])

  const toggleFavorite = async () => {
    if (!currentUserId || !profile || favoriteBusy || profile.id === currentUserId) return

    const isFavorite = favoriteSellerIds.includes(profile.id)
    setFavoriteBusy(true)

    if (isFavorite) {
      const { error } = await supabase
        .from('favorite_sellers')
        .delete()
        .eq('user_id', currentUserId)
        .eq('seller_id', profile.id)

      if (!error) {
        setFavoriteSellerIds((prev) => prev.filter((sellerId) => sellerId !== profile.id))
      }
    } else {
      const { error } = await supabase
        .from('favorite_sellers')
        .insert({
          user_id: currentUserId,
          seller_id: profile.id,
        })

      if (!error) {
        setFavoriteSellerIds((prev) => Array.from(new Set([...prev, profile.id])))
      }
    }

    setFavoriteBusy(false)
  }

  const gender = useMemo(() => genderMeta(profile?.gender || null), [profile?.gender])

  const hasSellerDetailStats =
    !!sellerStats &&
    sellerStats.review_count > 0 &&
    (
      sellerStats.avg_skill !== null ||
      sellerStats.avg_communication !== null ||
      sellerStats.avg_vibe !== null ||
      sellerStats.avg_reliability !== null ||
      sellerStats.avg_tech_quality !== null
    )

  const hasBuyerDetailStats =
    !!buyerStats &&
    buyerStats.review_count > 0 &&
    (
      buyerStats.avg_politeness !== null ||
      buyerStats.avg_communication !== null ||
      buyerStats.avg_reliability !== null ||
      buyerStats.avg_easy_to_play_with !== null ||
      buyerStats.avg_respect !== null
    )

  const isFavorite = !!profile && favoriteSellerIds.includes(profile.id)

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav userEmail={userEmail} />
        <section className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-slate-400">Loading profile...</p>
        </section>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav userEmail={userEmail} />
        <section className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-rose-400">Profile not found.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav userEmail={userEmail} />

      <section className="mx-auto max-w-5xl px-6 py-8">
        <button
          onClick={() => router.push('/explore')}
          className="mb-6 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700"
        >
          ← Back to Explore
        </button>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                {profile.display_name || 'Unknown GameMate'}
              </h1>

              <div className="mt-3 flex flex-wrap gap-2">
                {gender && (
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200">
                    {gender.icon} {gender.label}
                  </span>
                )}

                {profile.country && (
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200">
                    🌍 {profile.country}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              {profile.id !== currentUserId && (
                <button
                  onClick={() => void toggleFavorite()}
                  disabled={favoriteBusy}
                  className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                    isFavorite
                      ? 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  } disabled:opacity-50`}
                >
                  {favoriteBusy ? '...' : isFavorite ? '★ Saved' : '☆ Save'}
                </button>
              )}

              <div className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold">
                ${profile.hourly_price ?? 0}/hour
              </div>
            </div>
          </div>

          <RatingPower
            rating={sellerStats?.avg_rating ?? null}
            reviewCount={sellerStats?.review_count ?? 0}
          />

          {hasSellerDetailStats && (
            <div className="mt-6">
              <h2 className="mb-4 text-xl font-bold">GameMate Stats</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {SELLER_STAT_ITEMS.map((item) => (
                  <StatBar
                    key={item.key}
                    label={item.label}
                    value={sellerStats?.[item.key] as number | null}
                  />
                ))}
              </div>
            </div>
          )}

          {hasBuyerDetailStats && (
            <div className="mt-6">
              <h2 className="mb-4 text-xl font-bold">Player Stats</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {BUYER_STAT_ITEMS.map((item) => (
                  <StatBar
                    key={item.key}
                    label={item.label}
                    value={buyerStats?.[item.key] as number | null}
                  />
                ))}
              </div>
            </div>
          )}

          {profile.bio && (
            <div className="mt-6">
              <h2 className="mb-2 text-lg font-semibold">Bio</h2>
              <p className="text-slate-300">{profile.bio}</p>
            </div>
          )}

          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Languages</h2>
            <div className="flex flex-wrap gap-2">
              {profile.languages?.length ? (
                profile.languages.map((lang) => (
                  <span
                    key={lang}
                    className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200"
                  >
                    {lang}
                  </span>
                ))
              ) : (
                <p className="text-slate-400">No languages added.</p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Games</h2>
            <div className="flex flex-wrap gap-2">
              {profile.primary_games?.length ? (
                profile.primary_games.map((game) => (
                  <span
                    key={game}
                    className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200"
                  >
                    {game}
                  </span>
                ))
              ) : (
                <p className="text-slate-400">No games added.</p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Communication</h2>
            <div className="flex flex-wrap gap-2">
              {profile.communication_methods?.length ? (
                profile.communication_methods.map((method) => (
                  <span
                    key={method}
                    className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200"
                  >
                    {method}
                  </span>
                ))
              ) : (
                <p className="text-slate-400">No communication methods added.</p>
              )}
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              onClick={() => router.push(`/book/${profile.id}`)}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500"
            >
              Book Session
            </button>

            {profile.id !== currentUserId && (
              <div className="flex-1">
                <StartChatButton
                  otherUserId={profile.id}
                  label="Start Chat"
                  className="w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold text-white hover:bg-slate-700"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-bold">Recent Reviews</h2>

          {reviews.length === 0 && (
            <p className="text-slate-400">No reviews yet.</p>
          )}

          <div className="space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-200">
                    {buyerMap[review.buyer_id] || 'Unknown user'}
                  </div>
                  <div className="text-sm font-bold text-amber-300">
                    {review.rating}/5
                  </div>
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  {new Date(review.created_at).toLocaleDateString()}
                </div>

                {review.comment && (
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}