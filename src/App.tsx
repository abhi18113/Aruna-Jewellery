import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import {
  ArrowDownRight,
  ArrowRight,
  Gem,
  Menu,
  Search,
  ShieldCheck,
  X,
  LockKeyhole,
  Phone,
  MessageCircle,
} from 'lucide-react'

type JewelleryItem = {
  id: string
  purity: string
  category: string
  image: string
}

type DbCategory = {
  id: string
  name: string
}

const gold = '#d8bc83'
const STORAGE_BUCKET = 'Jewellery_Images'
const ownerPhone = '917386684554'
const ownerDisplayPhone = '+91 73866 84554'

function contactOwner(item?: JewelleryItem) {
  const message = item
    ? `Hello, I am interested in jewellery item ${item.id}. Please share the details.`
    : 'Hello, I would like to know more about the Aruna Jewellery collection.'

  const whatsappUrl = `https://wa.me/${ownerPhone}?text=${encodeURIComponent(message)}`

  window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
}

function App() {
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState('')

  const [jewellery, setJewellery] = useState<JewelleryItem[]>([])
  const [jewelleryLoading, setJewelleryLoading] = useState(true)
  const [jewelleryError, setJewelleryError] = useState('')

  const [activeCategory, setActiveCategory] = useState('All Designs')
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] =
    useState<JewelleryItem | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Load categories from Supabase.
  useEffect(() => {
    let cancelled = false

    async function fetchCategories() {
      setCategoriesLoading(true)
      setCategoriesError('')

      try {
        const { data, error } = await supabase
          .from('categories')
          .select('id, name')
          .order('name')

        if (cancelled) return

        if (error) {
          console.error('Error fetching categories:', error.message)
          setCategoriesError(error.message)
          setDbCategories([])
        } else {
          setDbCategories(data ?? [])
        }
      } catch (error) {
        console.error('Could not load categories:', error)

        if (!cancelled) {
          setCategoriesError('Could not connect to load categories.')
          setDbCategories([])
        }
      } finally {
        if (!cancelled) {
          setCategoriesLoading(false)
        }
      }
    }

    void fetchCategories()

    return () => {
      cancelled = true
    }
  }, [])

  // Load jewellery and create temporary URLs for stored images.
  useEffect(() => {
    if (categoriesLoading) return

    let cancelled = false

    async function fetchJewellery() {
      setJewelleryLoading(true)
      setJewelleryError('')

      try {
        const { data, error } = await supabase
          .from('jewellery_items')
          .select(
            'id, item_code, purity, category_id, image_path, created_at',
          )
          .order('created_at', { ascending: false })

        if (cancelled) return

        if (error) {
          console.error('Error fetching jewellery:', error.message)
          setJewelleryError(error.message)
          setJewellery([])
          setJewelleryLoading(false)
          return
        }

        const items = await Promise.all(
          (data ?? []).map(async (item) => {
            const category = dbCategories.find(
              (cat) => cat.id === item.category_id,
            )

            const imagePath =
              typeof item.image_path === 'string'
                ? item.image_path.trim()
                : ''

            const jewelleryItem: JewelleryItem = {
              id: item.item_code || item.id,
              purity: item.purity ?? '',
              category: category?.name ?? 'Uncategorized',
              image: '',
            }

            // Keep the item even when its image path is missing.
            if (!imagePath) {
              return jewelleryItem
            }

            try {
              const { data: imageData, error: imageError } =
                await supabase.storage
                  .from(STORAGE_BUCKET)
                  .createSignedUrl(imagePath, 3600)

              if (imageError || !imageData?.signedUrl) {
                console.error('Could not create signed image URL:', {
                  itemCode: item.item_code,
                  imagePath,
                  error: imageError?.message,
                })

                return jewelleryItem
              }

              return {
                ...jewelleryItem,
                image: imageData.signedUrl,
              }
            } catch (error) {
              console.error(
                `Could not load image for item ${jewelleryItem.id}:`,
                error,
              )

              return jewelleryItem
            }
          }),
        )

        if (!cancelled) {
          setJewellery(items)
        }
      } catch (error) {
        console.error('Could not load jewellery:', error)

        if (!cancelled) {
          setJewelleryError(
            'Could not load jewellery from the catalogue.',
          )
          setJewellery([])
        }
      } finally {
        if (!cancelled) {
          setJewelleryLoading(false)
        }
      }
    }

    void fetchJewellery()

    return () => {
      cancelled = true
    }
  }, [categoriesLoading, dbCategories])

  // Build the category filter list.
  const categories = useMemo(
    () => [
      'All Designs',
      ...dbCategories.map((category) => category.name),
    ],
    [dbCategories],
  )

  // Filter by selected category and item ID.
  const filteredJewellery = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()

    return jewellery.filter((item) => {
      const matchesCategory =
        activeCategory === 'All Designs' ||
        item.category === activeCategory

      const matchesSearch = item.id
        .toLowerCase()
        .includes(searchTerm)

      return matchesCategory && matchesSearch
    })
  }, [jewellery, activeCategory, search])

  // Calculate the number of designs in each category.
  const visibleCategoryCount = (category: string) =>
    jewellery.filter(
      (item) =>
        category === 'All Designs' || item.category === category,
    ).length

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0c0b09] text-[#f5f0e7]">
      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#d8bc83]/20 bg-[#0c0b09]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 lg:px-10">
          <a
            href="#home"
            className="flex min-w-0 items-center gap-3"
            aria-label="Aruna Jewellery home"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d8bc83]/70">
              <Gem size={23} color={gold} strokeWidth={1.2} />
            </div>

            <div className="min-w-0">
              <div className="whitespace-nowrap font-serif text-lg tracking-[0.08em] sm:text-2xl">
                ARUNA JEWELLERY
              </div>
              <div className="mt-1 text-[8px] tracking-[0.2em] text-[#c5b18b] sm:text-[9px]">
                THE ART OF FINE JEWELLERY
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-6 text-[10px] tracking-[0.15em] text-white/70 lg:flex">
            <a
              href="#collections"
              className="transition hover:text-[#d8bc83]"
            >
              COLLECTIONS
            </a>

            <a
              href="#gallery"
              className="transition hover:text-[#d8bc83]"
            >
              GALLERY
            </a>

            <a
              href={`tel:+${ownerPhone}`}
              className="inline-flex items-center gap-2 border border-[#d8bc83]/60 px-4 py-3 text-[#e6d2a8] transition hover:bg-[#d8bc83] hover:text-[#11100e]"
            >
              <Phone size={14} />
              CALL OWNER
            </a>

            <button
              type="button"
              onClick={() => contactOwner()}
              className="inline-flex items-center gap-2 bg-[#d8bc83] px-4 py-3 text-[#11100e] transition hover:bg-[#e8d3a6]"
            >
              <MessageCircle size={14} />
              WHATSAPP
            </button>

            <a
              href="/admin"
              className="inline-flex items-center gap-2 transition hover:text-[#d8bc83]"
            >
              <LockKeyhole size={14} />
              ADMIN
            </a>
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="shrink-0 p-2 text-[#d8bc83] lg:hidden"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <nav
            id="mobile-navigation"
            className="flex flex-col gap-5 border-t border-white/10 bg-[#11100e] px-6 py-5 text-xs tracking-widest lg:hidden"
          >
            <a
              href="#collections"
              onClick={() => setMenuOpen(false)}
            >
              COLLECTIONS
            </a>

            <a
              href="#gallery"
              onClick={() => setMenuOpen(false)}
            >
              GALLERY
            </a>

            <a
              href={`tel:+${ownerPhone}`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 text-[#d8bc83]"
            >
              <Phone size={16} />
              CALL OWNER — {ownerDisplayPhone}
            </a>

            <button
              type="button"
              className="flex items-center gap-3 text-left text-[#d8bc83]"
              onClick={() => {
                setMenuOpen(false)
                contactOwner()
              }}
            >
              <MessageCircle size={16} />
              WHATSAPP OWNER
            </button>

            <a
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 border border-[#d8bc83] px-4 py-3 text-[#d8bc83]"
            >
              <LockKeyhole size={15} />
              ADMIN LOGIN
            </a>
          </nav>
        )}
      </header>

      {/* Premium hero banner */}
      <section
        id="home"
        className="relative isolate flex min-h-[570px] items-center overflow-hidden border-b border-[#d8bc83]/20 sm:min-h-[640px] lg:min-h-[690px]"
      >
        <div className="absolute inset-0 -z-20">
          <img
            src="https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=2000&q=90"
            alt=""
            fetchPriority="high"
            className="h-full w-full object-cover object-center"
          />
        </div>

        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#090806] via-[#090806]/90 to-[#090806]/15" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0c0b09]/70 via-transparent to-black/20" />

        <div className="mx-auto w-full max-w-[1500px] px-6 py-20 sm:px-10 lg:px-16">
          <div className="max-w-2xl">
            <div className="mb-7 flex items-center gap-3 text-[10px] tracking-[0.28em] text-[#e6c98e] sm:text-xs">
              <span className="h-px w-10 bg-[#d8bc83]" />
              TIMELESS / ELEGANT / EXQUISITE
            </div>

            <h1 className="font-serif text-5xl font-normal leading-[1.12] sm:text-6xl lg:text-7xl">
              Timeless Beauty
              <br />
              <span className="italic text-[#e6c98e]">
                in Every Design
              </span>
            </h1>

            <div className="mt-7 h-px w-14 bg-[#d8bc83]" />

            <p className="mt-7 max-w-md text-sm leading-7 text-white/75 sm:text-base">
              Discover a curated collection of fine jewellery crafted
              for life’s most special moments.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#collections"
                className="inline-flex min-h-12 items-center gap-4 bg-[#d8bc83] px-5 py-4 text-[10px] font-medium tracking-[0.16em] text-[#11100e] transition hover:bg-[#f0d8a7] sm:px-6"
              >
                EXPLORE COLLECTION
                <ArrowRight size={16} />
              </a>

              <a
                href={`tel:+${ownerPhone}`}
                className="inline-flex min-h-12 items-center gap-2 border border-[#d8bc83]/80 px-4 py-4 text-[10px] tracking-[0.14em] text-[#f1d8a5] transition hover:bg-[#d8bc83] hover:text-[#11100e] sm:px-5"
              >
                <Phone size={16} />
                CALL OWNER
              </a>

              <button
                type="button"
                onClick={() => contactOwner()}
                className="inline-flex min-h-12 items-center gap-2 border border-[#d8bc83]/80 px-4 py-4 text-[10px] tracking-[0.14em] text-[#f1d8a5] transition hover:bg-[#d8bc83] hover:text-[#11100e] sm:px-5"
              >
                <MessageCircle size={16} />
                WHATSAPP
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section
        id="collections"
        className="scroll-mt-24 border-b border-[#d8bc83]/20 bg-[#0c0b09]"
      >
        <div className="mx-auto max-w-[1500px] px-5 py-12 sm:px-10 lg:px-16 lg:py-16">
          <div className="mb-7">
            <div className="mb-3 text-[10px] tracking-[0.24em] text-[#d8bc83]">
              EXPLORE OUR COLLECTIONS
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl">
              Shop by Category
            </h2>
          </div>

          {categoriesError && (
            <p className="mb-4 text-sm text-red-300">
              Could not load categories: {categoriesError}
            </p>
          )}

          <div className="flex gap-3 overflow-x-auto pb-3">
            {categories.map((category) => {
              const isActive = activeCategory === category

              return (
                <button
                  type="button"
                  key={category}
                  onClick={() => {
                    setActiveCategory(category)
                    document.getElementById('gallery')?.scrollIntoView({
                      behavior: 'smooth',
                    })
                  }}
                  aria-pressed={isActive}
                  className={`group min-w-32 shrink-0 border px-5 py-5 text-left transition sm:min-w-40 sm:px-6 sm:py-6 ${
                    isActive
                      ? 'border-[#d8bc83] bg-[#d8bc83]/10'
                      : 'border-white/15 bg-white/[0.02] hover:border-[#d8bc83]/70 hover:bg-[#d8bc83]/5'
                  }`}
                >
                  <Gem
                    size={23}
                    strokeWidth={1.2}
                    className={`mb-5 transition ${
                      isActive
                        ? 'text-[#e6c98e]'
                        : 'text-[#d8bc83]/60 group-hover:text-[#d8bc83]'
                    }`}
                  />

                  <span className="block text-[10px] tracking-[0.12em] text-[#f5f0e7] sm:text-xs">
                    {category.toUpperCase()}
                  </span>

                  <span className="mt-2 block text-[10px] text-white/45">
                    {visibleCategoryCount(category)} designs
                  </span>
                </button>
              )
            })}
          </div>

          {categoriesLoading && (
            <p className="mt-4 text-xs text-white/45">
              Loading collections...
            </p>
          )}
        </div>
      </section>

      {/* Jewellery gallery */}
      <section
        id="gallery"
        className="mx-auto max-w-[1500px] scroll-mt-24 px-5 py-14 sm:px-10 lg:px-16 lg:py-20"
      >
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 text-[10px] tracking-[0.24em] text-[#d8bc83]">
              THE ARUNA SHOWROOM COLLECTION
            </div>

            <h2 className="font-serif text-4xl sm:text-5xl">
              {activeCategory === 'All Designs'
                ? 'Featured Designs'
                : activeCategory}
            </h2>

            <p className="mt-3 text-sm text-white/45">
              Discover a design that feels uniquely yours.
            </p>
          </div>

          <div className="flex h-12 items-center gap-3 border border-white/15 px-4 transition focus-within:border-[#d8bc83]/70 sm:w-64">
            <Search size={17} className="shrink-0 text-[#d8bc83]" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item ID..."
              aria-label="Search jewellery by item ID"
              className="w-full bg-transparent text-sm outline-none placeholder:text-white/35"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="shrink-0 text-white/50 transition hover:text-[#d8bc83]"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {jewelleryError && (
          <p className="mt-6 border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
            Could not load jewellery: {jewelleryError}
          </p>
        )}

        {jewelleryLoading && (
          <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="animate-pulse">
                <div className="aspect-[4/5] bg-white/5" />
                <div className="mt-3 h-3 w-1/3 bg-white/10" />
                <div className="mt-2 h-3 w-1/2 bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {!jewelleryLoading && !jewelleryError && (
          <div className="mt-9 grid grid-cols-2 gap-x-4 gap-y-7 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
            {filteredJewellery.map((item, index) => (
              <button
                type="button"
                key={`${item.id}-${item.category}`}
                onClick={() => setSelectedItem(item)}
                className="group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bc83]"
                aria-label={`View jewellery item ${item.id}, purity ${item.purity}`}
              >
                <div className="relative aspect-[4/5] overflow-hidden border border-white/10 bg-[#171410]">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={`Jewellery item ${item.id}`}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-[#d8bc83]/70">
                      <Gem size={38} strokeWidth={1.2} />
                      <span className="text-[9px] tracking-widest">
                        IMAGE UNAVAILABLE
                      </span>
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/10" />

                  <div className="pointer-events-none absolute left-3 top-3 border border-[#d8bc83]/50 bg-black/50 px-2 py-1 text-[9px] tracking-widest text-[#e6c98e]">
                    {(index + 1).toString().padStart(2, '0')}
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 sm:p-4">
                    <div className="min-w-0">
                      <div className="break-all text-[9px] tracking-[0.12em] text-[#e6c98e] sm:text-[10px]">
                        ID: {item.id}
                      </div>

                      <div className="mt-2 text-xs text-white sm:text-sm">
                        Purity: {item.purity}
                      </div>
                    </div>

                    <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#d8bc83]/70 text-[#e6c98e] transition group-hover:bg-[#d8bc83] group-hover:text-[#11100e]">
                      <ArrowDownRight size={16} />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!jewelleryLoading &&
          !jewelleryError &&
          filteredJewellery.length === 0 && (
            <div className="border border-white/10 py-20 text-center">
              <Gem size={32} className="mx-auto text-[#d8bc83]" />

              <h3 className="mt-5 font-serif text-2xl">
                No designs found
              </h3>

              <p className="mt-2 text-sm text-white/45">
                Try another item ID or category.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setActiveCategory('All Designs')
                }}
                className="mt-5 text-sm text-[#d8bc83] underline underline-offset-4 transition hover:text-white"
              >
                Clear filters
              </button>
            </div>
          )}
      </section>

      {/* Contact section */}
      <section className="border-y border-[#d8bc83]/20 bg-[#17130e]">
        <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-10 lg:px-16">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] tracking-[0.2em] text-[#d8bc83]">
              <ShieldCheck size={15} />
              PERSONAL ASSISTANCE
            </div>

            <h2 className="font-serif text-3xl">
              Found something special?
            </h2>

            <p className="mt-3 max-w-lg text-sm leading-6 text-white/55">
              Contact our showroom for prices, availability, and further
              details about your chosen design.
            </p>

            <p className="mt-3 text-sm text-[#d8bc83]">
              {ownerDisplayPhone}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={`tel:+${ownerPhone}`}
              className="flex items-center justify-center gap-2 border border-[#d8bc83] px-5 py-4 text-[10px] tracking-wider text-[#e6c98e] transition hover:bg-[#d8bc83] hover:text-[#11100e]"
            >
              <Phone size={16} />
              CALL OWNER
            </a>

            <button
              type="button"
              onClick={() => contactOwner(selectedItem ?? undefined)}
              className="flex items-center justify-center gap-2 bg-[#d8bc83] px-5 py-4 text-[10px] tracking-wider text-[#11100e] transition hover:bg-[#e8d3a6]"
            >
              <MessageCircle size={16} />
              WHATSAPP OWNER
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex max-w-[1500px] flex-col justify-between gap-4 px-5 py-7 text-[10px] tracking-wider text-white/40 sm:flex-row sm:items-center sm:px-10 lg:px-16">
        <a
          href="#home"
          className="font-serif text-lg tracking-[0.08em] text-[#d8bc83]"
        >
          ARUNA JEWELLERY
        </a>

        <p>AN ELEGANT WAY TO DISCOVER JEWELLERY.</p>

        <p>© {new Date().getFullYear()} ARUNA JEWELLERY</p>
      </footer>

      {/* Selected jewellery item popup */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setSelectedItem(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Jewellery item ${selectedItem.id}`}
            className="relative grid max-h-[90vh] w-full max-w-3xl overflow-auto border border-[#d8bc83]/20 bg-[#171512] shadow-2xl shadow-black/50 sm:grid-cols-2"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center bg-black/70 text-white transition hover:bg-[#d8bc83] hover:text-black"
              aria-label="Close image viewer"
            >
              <X size={19} />
            </button>

            {selectedItem.image ? (
              <img
                src={selectedItem.image}
                alt={`Jewellery item ${selectedItem.id}`}
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
                className="max-h-[55vh] w-full bg-[#211e19] object-contain sm:max-h-[75vh]"
              />
            ) : (
              <div className="flex min-h-64 items-center justify-center bg-[#211e19] text-[#d8bc83]/70">
                <Gem size={48} strokeWidth={1.2} />
              </div>
            )}

            <div className="flex flex-col justify-center p-7 sm:p-10">
              <div className="text-[10px] tracking-[0.2em] text-[#d8bc83]">
                ARUNA JEWELLERY · ITEM DETAILS
              </div>

              <h3 className="mt-5 break-words font-serif text-3xl">
                ID: {selectedItem.id}
              </h3>

              <p className="mt-3 text-sm text-white/65">
                Purity: {selectedItem.purity}
              </p>

              <p className="mt-5 text-xs leading-6 text-white/40">
                For pricing and further information, please contact the
                showroom owner.
              </p>

              <div className="mt-7 flex flex-col gap-3">
                <a
                  href={`tel:+${ownerPhone}`}
                  className="flex items-center justify-center gap-3 border border-[#d8bc83] px-5 py-4 text-xs tracking-wider text-[#e6c98e] transition hover:bg-[#d8bc83] hover:text-[#11100e]"
                >
                  <Phone size={16} />
                  CALL ABOUT THIS DESIGN
                </a>

                <button
                  type="button"
                  onClick={() => contactOwner(selectedItem)}
                  className="flex items-center justify-center gap-3 bg-[#d8bc83] px-5 py-4 text-xs tracking-wider text-[#11100e] transition hover:bg-[#e8d3a6]"
                >
                  <MessageCircle size={16} />
                  WHATSAPP ABOUT THIS DESIGN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App