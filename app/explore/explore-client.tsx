'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'
import StartChatButton from '../../components/StartChatButton'

type Profile = {
  id: string
  display_name: string | null
  bio: string | null
  country: string | null
  gender: string | null
  hourly_price: number | null
  is_seller: boolean | null
  primary_games: string[] | null
  languages: string[] | null
  communication_methods: string[] | null
}

type RatingStatRow = {
  seller_id: string
  avg_rating: number
  review_count: number
}

type RatingMap = Record<
  string,
  {
    avg_rating: number
    review_count: number
  }
>

type SortMode =
  | 'best_rated'
  | 'most_reviews'
  | 'price_low'
  | 'price_high'
  | 'name'

type FilterChip = {
  key: string
  label: string
  onRemove: () => void
}

type FavoriteRow = {
  seller_id: string
}

const VALID_SORTS: SortMode[] = [
  'best_rated',
  'most_reviews',
  'price_low',
  'price_high',
  'name',
]

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
      label: 'New',
    }
  }

  if (rating >= 4.75) {
    return {
      text: 'text-emerald-300',
      bar: 'bg-emerald-500',
      label: 'Elite',
    }
  }

  if (rating >= 4.2) {
    return {
      text: 'text-lime-300',
      bar: 'bg-lime-500',
      label: 'Strong',
    }
  }

  if (rating >= 3.5) {
    return {
      text: 'text-amber-300',
      bar: 'bg-amber-500',
      label: 'Mixed',
    }
  }

  if (rating >= 2.5) {
    return {
      text: 'text-orange-300',
      bar: 'bg-orange-500',
      label: 'Risky',
    }
  }

  return {
    text: 'text-rose-300',
    bar: 'bg-rose-500',
    label: 'Bad',
  }
}

function CompactReputation({
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
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300">Reputation</span>
        <span className={`font-bold ${theme.text}`}>
          {rating === null ? 'New' : safeRating.toFixed(2)}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${theme.bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className={theme.text}>{theme.label}</span>
        <span className="text-slate-400">
          {reviewCount} review{reviewCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}

function normalizeText(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function getParam(searchParams: ReturnType<typeof useSearchParams>, key: string) {
  return searchParams.get(key) || ''
}

function getInitialSort(searchParams: ReturnType<typeof useSearchParams>): SortMode {
  const sort = getParam(searchParams, 'sort')
  return VALID_SORTS.includes(sort as SortMode) ? (sort as SortMode) : 'best_rated'
}

function sortModeLabel(sortMode: SortMode) {
  switch (sortMode) {
    case 'best_rated':
      return 'Best Rated'
    case 'most_reviews':
      return 'Most Reviews'
    case 'price_low':
      return 'Price: Low to High'
    case 'price_high':
      return 'Price: High to Low'
    case 'name':
      return 'Name'
    default:
      return 'Best Rated'
  }
}

export default function ExploreClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const didMountRef = useRef(false)

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [ratings, setRatings] = useState<RatingMap>({})
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [favoriteSellerIds, setFavoriteSellerIds] = useState<string[]>([])
  const [favoriteBusySellerId, setFavoriteBusySellerId] = useState<string>('')

  const [searchText, setSearchText] = useState(() => getParam(searchParams, 'q'))
  const [selectedGame, setSelectedGame] = useState(
    () => getParam(searchParams, 'game') || 'all'
  )
  const [selectedLanguage, setSelectedLanguage] = useState(
    () => getParam(searchParams, 'lang') || 'all'
  )
  const [selectedCommunication, setSelectedCommunication] = useState(
    () => getParam(searchParams, 'comm') || 'all'
  )
  const [selectedCountry, setSelectedCountry] = useState(
    () => getParam(searchParams, 'country') || 'all'
  )
  const [favoritesOnly, setFavoritesOnly] = useState(
    () => getParam(searchParams, 'favorites') === '1'
  )
  const [minPrice, setMinPrice] = useState(() => getParam(searchParams, 'min'))
  const [maxPrice, setMaxPrice] = useState(() => getParam(searchParams, 'max'))
  const [sortMode, setSortMode] = useState<SortMode>(() => getInitialSort(searchParams))

  useEffect(() => {
    const load = async () => {
      const sessionResult = await supabase.auth.getSession()
      const session = sessionResult.data.session

      if (!session?.user) {
        router.push('/login')
        return
      }

      setUserEmail(session.user.email || '')
      setCurrentUserId(session.user.id)

      const [
        { data: profileData, error: profileError },
        { data: ratingData },
        { data: favoriteData, error: favoriteError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, display_name, bio, country, gender, hourly_price, is_seller, primary_games, languages, communication_methods'
          )
          .eq('is_seller', true)
          .order('display_name', { ascending: true }),
        supabase
          .from('seller_rating_stats')
          .select('seller_id, avg_rating, review_count'),
        supabase
          .from('favorite_sellers')
          .select('seller_id')
          .eq('user_id', session.user.id),
      ])

      if (!profileError) {
        setProfiles((profileData || []) as Profile[])
      }

      const ratingMap: RatingMap = {}
      ;((ratingData || []) as RatingStatRow[]).forEach((row) => {
        ratingMap[row.seller_id] = {
          avg_rating: Number(row.avg_rating),
          review_count: Number(row.review_count),
        }
      })
      setRatings(ratingMap)

      if (!favoriteError) {
        setFavoriteSellerIds(
          ((favoriteData || []) as FavoriteRow[]).map((row) => row.seller_id)
        )
      }

      setLoading(false)
    }

    void load()
  }, [router])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    const params = new URLSearchParams()

    if (searchText.trim()) params.set('q', searchText.trim())
    if (selectedGame !== 'all') params.set('game', selectedGame)
    if (selectedLanguage !== 'all') params.set('lang', selectedLanguage)
    if (selectedCommunication !== 'all') params.set('comm', selectedCommunication)
    if (selectedCountry !== 'all') params.set('country', selectedCountry)
    if (favoritesOnly) params.set('favorites', '1')
    if (minPrice.trim()) params.set('min', minPrice.trim())
    if (maxPrice.trim()) params.set('max', maxPrice.trim())
    if (sortMode !== 'best_rated') params.set('sort', sortMode)

    const nextQuery = params.toString()
    const currentQuery = searchParams.toString()

    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `/explore?${nextQuery}` : '/explore', { scroll: false })
    }
  }, [
    searchText,
    selectedGame,
    selectedLanguage,
    selectedCommunication,
    selectedCountry,
    favoritesOnly,
    minPrice,
    maxPrice,
    sortMode,
    router,
    searchParams,
  ])

  const shortBio = (bio: string | null) => {
    if (!bio) return ''
    if (bio.length <= 110) return bio
    return bio.slice(0, 110).trim() + '...'
  }

  const allGames = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((profile) => {
      ;(profile.primary_games || []).forEach((game) => {
        const clean = game.trim()
        if (clean) set.add(clean)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const allLanguages = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((profile) => {
      ;(profile.languages || []).forEach((lang) => {
        const clean = lang.trim()
        if (clean) set.add(clean)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const allCommunicationMethods = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((profile) => {
      ;(profile.communication_methods || []).forEach((method) => {
        const clean = method.trim()
        if (clean) set.add(clean)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const allCountries = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((profile) => {
      const clean = profile.country?.trim()
      if (clean) set.add(clean)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const filteredProfiles = useMemo(() => {
    const query = normalizeText(searchText)
    const min = minPrice === '' ? null : Number(minPrice)
    const max = maxPrice === '' ? null : Number(maxPrice)

    let next = [...profiles].filter((profile) => {
      if (profile.id === currentUserId) return false

      const profileName = normalizeText(profile.display_name)
      const profileBio = normalizeText(profile.bio)
      const profileCountry = normalizeText(profile.country)
      const games = (profile.primary_games || []).map(normalizeText)
      const languages = (profile.languages || []).map(normalizeText)
      const communicationMethods = (profile.communication_methods || []).map(normalizeText)
      const price = Number(profile.hourly_price ?? 0)
      const isFavorite = favoriteSellerIds.includes(profile.id)

      const matchesSearch =
        !query ||
        profileName.includes(query) ||
        profileBio.includes(query) ||
        profileCountry.includes(query) ||
        games.some((game) => game.includes(query)) ||
        languages.some((lang) => lang.includes(query)) ||
        communicationMethods.some((method) => method.includes(query))

      if (!matchesSearch) return false

      if (selectedGame !== 'all' && !games.includes(normalizeText(selectedGame))) {
        return false
      }

      if (
        selectedLanguage !== 'all' &&
        !languages.includes(normalizeText(selectedLanguage))
      ) {
        return false
      }

      if (
        selectedCommunication !== 'all' &&
        !communicationMethods.includes(normalizeText(selectedCommunication))
      ) {
        return false
      }

      if (
        selectedCountry !== 'all' &&
        profileCountry !== normalizeText(selectedCountry)
      ) {
        return false
      }

      if (favoritesOnly && !isFavorite) {
        return false
      }

      if (min !== null && Number.isFinite(min) && price < min) {
        return false
      }

      if (max !== null && Number.isFinite(max) && price > max) {
        return false
      }

      return true
    })

    next.sort((a, b) => {
      const ratingA = ratings[a.id]?.avg_rating ?? -1
      const ratingB = ratings[b.id]?.avg_rating ?? -1
      const reviewsA = ratings[a.id]?.review_count ?? 0
      const reviewsB = ratings[b.id]?.review_count ?? 0
      const priceA = Number(a.hourly_price ?? 0)
      const priceB = Number(b.hourly_price ?? 0)
      const nameA = a.display_name || ''
      const nameB = b.display_name || ''

      switch (sortMode) {
        case 'best_rated':
          if (ratingB !== ratingA) return ratingB - ratingA
          if (reviewsB !== reviewsA) return reviewsB - reviewsA
          return nameA.localeCompare(nameB)

        case 'most_reviews':
          if (reviewsB !== reviewsA) return reviewsB - reviewsA
          if (ratingB !== ratingA) return ratingB - ratingA
          return nameA.localeCompare(nameB)

        case 'price_low':
          if (priceA !== priceB) return priceA - priceB
          if (ratingB !== ratingA) return ratingB - ratingA
          return nameA.localeCompare(nameB)

        case 'price_high':
          if (priceB !== priceA) return priceB - priceA
          if (ratingB !== ratingA) return ratingB - ratingA
          return nameA.localeCompare(nameB)

        case 'name':
          return nameA.localeCompare(nameB)

        default:
          return 0
      }
    })

    return next
  }, [
    profiles,
    ratings,
    favoriteSellerIds,
    searchText,
    selectedGame,
    selectedLanguage,
    selectedCommunication,
    selectedCountry,
    favoritesOnly,
    minPrice,
    maxPrice,
    sortMode,
    currentUserId,
  ])

  const clearFilters = () => {
    setSearchText('')
    setSelectedGame('all')
    setSelectedLanguage('all')
    setSelectedCommunication('all')
    setSelectedCountry('all')
    setFavoritesOnly(false)
    setMinPrice('')
    setMaxPrice('')
    setSortMode('best_rated')
  }

  const toggleFavorite = async (sellerId: string) => {
    if (!currentUserId || favoriteBusySellerId) return

    const isFavorite = favoriteSellerIds.includes(sellerId)
    setFavoriteBusySellerId(sellerId)

    if (isFavorite) {
      const { error } = await supabase
        .from('favorite_sellers')
        .delete()
        .eq('user_id', currentUserId)
        .eq('seller_id', sellerId)

      if (!error) {
        setFavoriteSellerIds((prev) => prev.filter((id) => id !== sellerId))
      }
    } else {
      const { error } = await supabase
        .from('favorite_sellers')
        .insert({
          user_id: currentUserId,
          seller_id: sellerId,
        })

      if (!error) {
        setFavoriteSellerIds((prev) => Array.from(new Set([...prev, sellerId])))
      }
    }

    setFavoriteBusySellerId('')
  }

  const chips = useMemo<FilterChip[]>(() => {
    const next: FilterChip[] = []

    if (searchText.trim()) {
      next.push({
        key: 'q',
        label: `Search: ${searchText.trim()}`,
        onRemove: () => setSearchText(''),
      })
    }

    if (selectedGame !== 'all') {
      next.push({
        key: 'game',
        label: `Game: ${selectedGame}`,
        onRemove: () => setSelectedGame('all'),
      })
    }

    if (selectedLanguage !== 'all') {
      next.push({
        key: 'lang',
        label: `Language: ${selectedLanguage}`,
        onRemove: () => setSelectedLanguage('all'),
      })
    }

    if (selectedCommunication !== 'all') {
      next.push({
        key: 'comm',
        label: `Communication: ${selectedCommunication}`,
        onRemove: () => setSelectedCommunication('all'),
      })
    }

    if (selectedCountry !== 'all') {
      next.push({
        key: 'country',
        label: `Country: ${selectedCountry}`,
        onRemove: () => setSelectedCountry('all'),
      })
    }

    if (favoritesOnly) {
      next.push({
        key: 'favorites',
        label: 'Favorites Only',
        onRemove: () => setFavoritesOnly(false),
      })
    }

    if (minPrice.trim()) {
      next.push({
        key: 'min',
        label: `Min: $${minPrice.trim()}`,
        onRemove: () => setMinPrice(''),
      })
    }

    if (maxPrice.trim()) {
      next.push({
        key: 'max',
        label: `Max: $${maxPrice.trim()}`,
        onRemove: () => setMaxPrice(''),
      })
    }

    if (sortMode !== 'best_rated') {
      next.push({
        key: 'sort',
        label: `Sort: ${sortModeLabel(sortMode)}`,
        onRemove: () => setSortMode('best_rated'),
      })
    }

    return next
  }, [
    searchText,
    selectedGame,
    selectedLanguage,
    selectedCommunication,
    selectedCountry,
    favoritesOnly,
    minPrice,
    maxPrice,
    sortMode,
  ])

  const hasActiveFilters = chips.length > 0

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav userEmail={userEmail} />

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Find GameMates</h1>
          <p className="mt-2 text-slate-400">
            Browse available GameMates and find someone that fits your vibe.
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-lg font-bold">Filters</div>
              <p className="mt-1 text-sm text-slate-400">
                Narrow down results by game, language, communication, country,
                favorites, and price.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-400">
                {loading
                  ? 'Loading...'
                  : `${filteredProfiles.length} result${
                      filteredProfiles.length === 1 ? '' : 's'
                    }`}
              </div>

              <button
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  title="Remove filter"
                >
                  <span>{chip.label}</span>
                  <span className="text-slate-400">×</span>
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Search
              </label>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search name, bio, game, country, language..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Sort By
              </label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="best_rated">Best Rated</option>
                <option value="most_reviews">Most Reviews</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="name">Name</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Country
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="all">All Countries</option>
                {allCountries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Game
              </label>
              <select
                value={selectedGame}
                onChange={(e) => setSelectedGame(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="all">All Games</option>
                {allGames.map((game) => (
                  <option key={game} value={game}>
                    {game}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="all">All Languages</option>
                {allLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Communication
              </label>
              <select
                value={selectedCommunication}
                onChange={(e) => setSelectedCommunication(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="all">All Methods</option>
                {allCommunicationMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Favorites
              </label>
              <button
                onClick={() => setFavoritesOnly((prev) => !prev)}
                className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  favoritesOnly
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900'
                }`}
              >
                {favoritesOnly ? 'Favorites Only: ON' : 'Favorites Only: OFF'}
              </button>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Min Price
              </label>
              <input
                type="number"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Max Price
              </label>
              <input
                type="number"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="999"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>

        {loading && <p className="mt-6 text-slate-400">Loading...</p>}

        {!loading && filteredProfiles.length === 0 && (
          <p className="mt-6 text-slate-400">
            No GameMates found with the current filters.
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProfiles.map((p) => {
            const gender = genderMeta(p.gender)
            const rating = ratings[p.id]
            const isFavorite = favoriteSellerIds.includes(p.id)
            const favoriteBusy = favoriteBusySellerId === p.id

            return (
              <div
                key={p.id}
                className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-bold">
                      {p.display_name || 'Unknown GameMate'}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {gender && (
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200">
                          {gender.icon} {gender.label}
                        </span>
                      )}

                      {p.country && (
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200">
                          🌍 {p.country}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => void toggleFavorite(p.id)}
                      disabled={favoriteBusy}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        isFavorite
                          ? 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      } disabled:opacity-50`}
                      title={isFavorite ? 'Remove favorite' : 'Save favorite'}
                    >
                      {favoriteBusy ? '...' : isFavorite ? '★ Saved' : '☆ Save'}
                    </button>

                    <div className="whitespace-nowrap rounded-full bg-indigo-600 px-4 py-2.5 text-base font-bold">
                      ${p.hourly_price ?? 0}/h
                    </div>
                  </div>
                </div>

                <CompactReputation
                  rating={rating?.avg_rating ?? null}
                  reviewCount={rating?.review_count ?? 0}
                />

                {p.bio && (
                  <p className="mt-4 text-sm leading-6 text-slate-300">
                    {shortBio(p.bio)}
                  </p>
                )}

                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Games
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.primary_games?.length ? (
                      p.primary_games.slice(0, 4).map((game) => (
                        <span
                          key={game}
                          className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200"
                        >
                          {game}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No games listed</span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Languages
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.languages?.length ? (
                      p.languages.slice(0, 4).map((lang) => (
                        <span
                          key={lang}
                          className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200"
                        >
                          {lang}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No languages listed</span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Communication
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.communication_methods?.length ? (
                      p.communication_methods.slice(0, 4).map((method) => (
                        <span
                          key={method}
                          className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200"
                        >
                          {method}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No methods listed</span>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex gap-2 pt-5">
                  <button
                    onClick={() => router.push(`/profile/${p.id}`)}
                    className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    Open Profile
                  </button>

                  {p.id !== currentUserId && (
                    <div className="flex-1">
                      <StartChatButton
                        otherUserId={p.id}
                        label="Start Chat"
                        className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}