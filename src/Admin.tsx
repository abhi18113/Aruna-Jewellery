
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { supabase } from './supabase'

const STORAGE_BUCKET = 'Jewellery_Images'
const ADMIN_USER_ID = '0e5bb9ce-dd7b-4115-bdb5-ddd17aeb937c'

type Category = {
  id: string
  name: string
}

type SavedItem = {
  id: string
  serial_number: number
  purity: string
  metal: string
  category_id: string
  image_path: string
  imageUrl: string
}

type UploadItem = {
  id: string
  file: File
  previewUrl: string
  metal: 'Gold' | 'Silver'
  purity: string
}

type Visitor = {
  id: number
  name: string
  phone_number: string
  first_visited_at: string
  last_visited_at: string
  visit_count: number
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function Admin() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  // One category applies to every image in the current upload queue.
  // The selection stays active for later batches until changed.
  const [selectedCategoryId, setSelectedCategoryId] = useState('')

  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([])
  const [uploading, setUploading] = useState(false)

  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [loadingVisitors, setLoadingVisitors] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true)

    try {
      const { data, error: categoryError } = await supabase
        .from('categories')
        .select('id, name')
        .order('name')

      if (categoryError) {
        setError(`Could not load categories: ${categoryError.message}`)
      } else {
        setCategories(data ?? [])
      }
    } catch {
      setError('Could not load categories.')
    } finally {
      setLoadingCategories(false)
    }
  }, [])

  const loadSavedItems = useCallback(async () => {
    setLoadingItems(true)

    try {
      const { data, error: itemsError } = await supabase
        .from('jewellery_items')
        .select(
          'id, serial_number, purity, metal, category_id, image_path',
        )
        .order('serial_number', { ascending: false })

      if (itemsError) {
        setError(`Could not load saved items: ${itemsError.message}`)
        return
      }

      const rows = data ?? []

      const itemsWithUrls: SavedItem[] = await Promise.all(
        rows.map(async (item) => {
          const { data: signedData, error: signedError } =
            await supabase.storage
              .from(STORAGE_BUCKET)
              .createSignedUrl(item.image_path, 3600)

          return {
            ...item,
            imageUrl: signedError ? '' : signedData.signedUrl,
          }
        }),
      )

      setSavedItems(itemsWithUrls)
    } catch {
      setError('Could not load saved jewellery items.')
    } finally {
      setLoadingItems(false)
    }
  }, [])

  const loadVisitors = useCallback(async () => {
    setLoadingVisitors(true)

    try {
      const { data, error: visitorsError } = await supabase
        .from('catalogue_visitors')
        .select(
          'id, name, phone_number, first_visited_at, last_visited_at, visit_count',
        )
        .order('last_visited_at', { ascending: false })

      if (visitorsError) {
        setError(
          `Could not load visitor history: ${visitorsError.message}`,
        )
        return
      }

      setVisitors((data ?? []) as Visitor[])
    } catch {
      setError('Could not load visitor history.')
    } finally {
      setLoadingVisitors(false)
    }
  }, [])

  const loadDashboardData = useCallback(async () => {
    await Promise.all([
      loadCategories(),
      loadSavedItems(),
      loadVisitors(),
    ])
  }, [loadCategories, loadSavedItems, loadVisitors])

  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const { data, error: sessionError } =
          await supabase.auth.getSession()

        if (!active) return

        if (sessionError) {
          setError(sessionError.message)
          return
        }

        if (data.session?.user.id === ADMIN_USER_ID) {
          setIsAdmin(true)
          await loadDashboardData()
        } else if (data.session) {
          await supabase.auth.signOut()
        }
      } catch {
        if (active) {
          setError('Could not check your login session.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void checkSession()

    return () => {
      active = false
    }
  }, [loadDashboardData])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (loginError) {
        setError(loginError.message)
        return
      }

      if (data.user?.id !== ADMIN_USER_ID) {
        await supabase.auth.signOut()
        setError(
          'This account is not authorised to access the admin page.',
        )
        return
      }

      setIsAdmin(true)
      setMessage('Login successful.')
      await loadDashboardData()
    } catch {
      setError('Login failed. Please try again.')
    }
  }

  async function handleLogout() {
    setError('')
    setMessage('')

    const { error: logoutError } = await supabase.auth.signOut()

    if (logoutError) {
      setError(logoutError.message)
      return
    }

    setIsAdmin(false)

    uploadQueue.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setUploadQueue([])

    setSavedItems([])
    setCategories([])
    setVisitors([])
    setSelectedCategoryId('')
    setMessage('You have been logged out.')
  }

  function handleFileSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    const imageFiles = files.filter((file) =>
      file.type.startsWith('image/'),
    )

    if (imageFiles.length === 0) {
      setError('Please select image files.')
      return
    }

    if (!selectedCategoryId) {
      setError(
        'Please select a category before choosing jewellery images.',
      )
      return
    }

    setError('')
    setMessage('')

    const newItems: UploadItem[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      metal: 'Gold',
      purity: '22K',
    }))

    setUploadQueue((current) => [...current, ...newItems])
  }

  function updateQueueItem(
    id: string,
    changes: Partial<Pick<UploadItem, 'metal' | 'purity'>>,
  ) {
    setUploadQueue((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    )
  }

  function removeFromQueue(id: string) {
    setUploadQueue((current) => {
      const item = current.find((entry) => entry.id === id)

      if (item) URL.revokeObjectURL(item.previewUrl)

      return current.filter((entry) => entry.id !== id)
    })
  }

  function clearUploadQueue() {
    uploadQueue.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setUploadQueue([])
    setError('')
    setMessage('')
  }

  async function handleAddCategory(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    setError('')
    setMessage('')

    const name = newCategory.trim()

    if (!name) {
      setError('Enter a category name.')
      return
    }

    const { data, error: categoryError } = await supabase
      .from('categories')
      .insert({ name })
      .select('id, name')
      .single()

    if (categoryError) {
      setError(`Could not add category: ${categoryError.message}`)
      return
    }

    setCategories((current) =>
      [...current, data].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    )

    setNewCategory('')
    setMessage(`Category "${name}" added successfully.`)
  }

  async function handleUploadAll() {
    if (uploadQueue.length === 0) {
      setError('Please select at least one image to upload.')
      return
    }

    if (!selectedCategoryId) {
      setError('Please select a category for this batch.')
      return
    }

    if (!categories.some((category) => category.id === selectedCategoryId)) {
      setError('The selected category is no longer available. Select another.')
      return
    }

    const incomplete = uploadQueue.some(
      (item) => !item.purity.trim(),
    )

    if (incomplete) {
      setError('Enter the purity for every image before uploading.')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')

    let uploadedCount = 0
    const failedItems: UploadItem[] = []

    const categoryName =
      categories.find((category) => category.id === selectedCategoryId)
        ?.name ?? 'selected category'

    try {
      for (const item of uploadQueue) {
        const safeFilename = item.file.name.replace(
          /[^a-zA-Z0-9._-]/g,
          '_',
        )

        const imagePath =
          `catalogue/${crypto.randomUUID()}-${safeFilename}`

        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(imagePath, item.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: item.file.type,
          })

        if (storageError) {
          failedItems.push(item)
          setError(
            (current) =>
              current ||
              `Could not upload ${item.file.name}: ${storageError.message}`,
          )
          continue
        }

        const { error: insertError } = await supabase
          .from('jewellery_items')
          .insert({
            metal: item.metal,
            purity: item.purity.trim(),
            category_id: selectedCategoryId,
            image_path: imagePath,
          })

        if (insertError) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([imagePath])

          failedItems.push(item)
          setError(
            (current) =>
              current ||
              `Could not save ${item.file.name}: ${insertError.message}`,
          )
          continue
        }

        uploadedCount++
        URL.revokeObjectURL(item.previewUrl)
      }

      setUploadQueue(failedItems)

      if (uploadedCount > 0) {
        setMessage(
          `${uploadedCount} image(s) uploaded to "${categoryName}" successfully. Serial numbers were generated automatically.`,
        )
        await loadSavedItems()
      }

      if (failedItems.length === 0 && uploadedCount > 0) {
        setError('')
      }
    } catch {
      setError('An unexpected error occurred during upload.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(item: SavedItem) {
    const confirmed = window.confirm(
      `Delete jewellery item #${item.serial_number}?\n\nThis removes the catalogue record. This action cannot be undone.`,
    )

    if (!confirmed) return

    setDeletingId(item.id)
    setError('')
    setMessage('')

    try {
      const { error: deleteError } = await supabase
        .from('jewellery_items')
        .delete()
        .eq('id', item.id)

      if (deleteError) {
        setError(`Could not delete item: ${deleteError.message}`)
        return
      }

      setSavedItems((current) =>
        current.filter((savedItem) => savedItem.id !== item.id),
      )

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([item.image_path])

      if (storageError) {
        setMessage(
          `Item #${item.serial_number} was removed from the catalogue, but its image could not be deleted from Storage. You may need to remove that file manually.`,
        )
      } else {
        setMessage(`Jewellery item #${item.serial_number} deleted.`)
      }
    } catch {
      setError('An unexpected error occurred while deleting the item.')
    } finally {
      setDeletingId(null)
    }
  }

  function getCategoryName(categoryId: string) {
    return (
      categories.find((category) => category.id === categoryId)
        ?.name ?? 'Unknown category'
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#090909] p-8 text-center text-amber-100">
        Checking admin access...
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090909] px-4 py-10 text-amber-100">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md space-y-5 rounded-2xl border border-amber-700/40 bg-[#151515] p-8 shadow-xl"
        >
          <p className="text-sm uppercase tracking-[0.3em] text-amber-500">
            Aruna Jewellery
          </p>

          <h1 className="text-3xl font-semibold">Owner Login</h1>

          <p className="text-sm text-gray-400">
            Sign in with your authorised Supabase admin account.
          </p>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          {message && (
            <p className="rounded-lg border border-green-800 bg-green-950/30 p-3 text-sm text-green-300">
              {message}
            </p>
          )}

          <label className="block space-y-2">
            <span className="text-sm text-gray-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500"
              placeholder="Admin email"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-gray-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500"
              placeholder="Password"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-amber-500 px-4 py-3 font-semibold text-black transition hover:bg-amber-400"
          >
            Sign in
          </button>

          <a
            href="/"
            className="block text-center text-sm text-gray-400 hover:text-amber-400"
          >
            Return to catalogue
          </a>
        </form>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#090909] px-4 py-8 text-amber-100 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-amber-800/40 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-500">
              Aruna Jewellery · Owner Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              Jewellery Management
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Upload, organise and delete catalogue images.
            </p>
          </div>

          <div className="flex gap-3">
            <a
              href="/"
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm hover:border-amber-500"
            >
              View catalogue
            </a>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40"
            >
              Log out
            </button>
          </div>
        </header>

        {(error || message) && (
          <div className="space-y-2">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-lg border border-green-800 bg-green-950/30 p-4 text-sm text-green-300">
                {message}
              </p>
            )}
          </div>
        )}

        {/* 1. Manage categories */}
        <section className="space-y-5 rounded-2xl border border-amber-800/30 bg-[#121212] p-5 sm:p-7">
          <div>
            <h2 className="text-2xl font-semibold">1. Manage categories</h2>
            <p className="mt-2 text-sm text-gray-400">
              Create categories before uploading jewellery images.
            </p>
          </div>

          <form
            onSubmit={handleAddCategory}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              required
              placeholder="Example: Gold Chains"
              className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500"
            />

            <button
              type="submit"
              className="rounded-lg bg-amber-500 px-5 py-3 font-semibold text-black hover:bg-amber-400"
            >
              Add category
            </button>
          </form>

          {loadingCategories ? (
            <p className="text-sm text-gray-400">Loading categories...</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-gray-400">
              No categories yet. Add your first category above.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <span
                  key={category.id}
                  className="rounded-full border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-sm"
                >
                  {category.name}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 2. Upload jewellery */}
        <section className="space-y-5 rounded-2xl border border-amber-800/30 bg-[#121212] p-5 sm:p-7">
          <div>
            <h2 className="text-2xl font-semibold">2. Upload jewellery</h2>
            <p className="mt-2 text-sm text-gray-400">
              Choose one category for the entire batch, then select as many
              images as you need. Every image in the batch will use that
              category automatically.
            </p>
          </div>

          <div className="rounded-xl border border-amber-700/30 bg-black/30 p-4 sm:p-5">
            <label className="block space-y-2">
              <span className="font-medium text-amber-300">
                Category for this batch
              </span>
              <select
                value={selectedCategoryId}
                onChange={(event) => {
                  setSelectedCategoryId(event.target.value)
                  setError('')
                  setMessage('')
                }}
                disabled={uploading}
                className="w-full rounded-lg border border-amber-700/40 bg-[#151515] px-4 py-3 outline-none focus:border-amber-500 disabled:opacity-50"
              >
                <option value="">Select category for all images</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-gray-400">
                {selectedCategoryId
                  ? `Selected: ${getCategoryName(selectedCategoryId)}. All queued images will be saved to this category. You can change it before uploading.`
                  : 'Choose a category before selecting images.'}
              </span>
            </label>
          </div>

          <label
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              selectedCategoryId && !uploading
                ? 'cursor-pointer border-amber-800/50 bg-black/40 hover:border-amber-500'
                : 'cursor-not-allowed border-gray-800 bg-black/20 opacity-60'
            }`}
          >
            <span className="text-lg font-medium">
              Choose jewellery images
            </span>
            <span className="mt-2 text-sm text-gray-400">
              Select multiple files for the selected category
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={!selectedCategoryId || uploading}
              onChange={handleFileSelection}
              className="sr-only"
            />
          </label>

          {!selectedCategoryId && categories.length > 0 && (
            <p className="text-sm text-amber-300">
              Select a category above to enable image selection.
            </p>
          )}

          {categories.length === 0 && (
            <p className="text-sm text-amber-300">
              Add at least one category before uploading.
            </p>
          )}

          {uploadQueue.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-300">
                    {uploadQueue.length} image(s) waiting to upload
                  </p>
                  <p className="mt-1 text-sm text-amber-400">
                    Batch category: {getCategoryName(selectedCategoryId)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearUploadQueue}
                  disabled={uploading}
                  className="text-sm text-red-300 hover:text-red-200 disabled:opacity-50"
                >
                  Clear all
                </button>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {uploadQueue.map((item) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-gray-800 bg-black/40"
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-56 w-full object-cover"
                    />

                    <div className="space-y-4 p-4">
                      <p className="truncate text-sm text-gray-300">
                        {item.file.name}
                      </p>

                      <div className="rounded-lg border border-amber-800/30 bg-amber-950/20 px-3 py-2">
                        <p className="text-xs text-gray-400">
                          Category assigned to this batch
                        </p>
                        <p className="mt-1 text-sm font-medium text-amber-300">
                          {getCategoryName(selectedCategoryId)}
                        </p>
                      </div>

                      <label className="block space-y-2">
                        <span className="text-sm text-gray-400">Metal</span>
                        <select
                          value={item.metal}
                          disabled={uploading}
                          onChange={(event) => {
                            const metal = event.target.value as
                              | 'Gold'
                              | 'Silver'
                            updateQueueItem(item.id, {
                              metal,
                              purity: metal === 'Gold' ? '22K' : '',
                            })
                          }}
                          className="w-full rounded-lg border border-gray-700 bg-[#151515] px-3 py-2 disabled:opacity-50"
                        >
                          <option value="Gold">Gold</option>
                          <option value="Silver">Silver</option>
                        </select>
                      </label>

                      <label className="block space-y-2">
                        <span className="text-sm text-gray-400">Purity</span>
                        <input
                          value={item.purity}
                          disabled={uploading}
                          onChange={(event) =>
                            updateQueueItem(item.id, {
                              purity: event.target.value,
                            })
                          }
                          required
                          placeholder={
                            item.metal === 'Gold'
                              ? 'Example: 22K'
                              : 'Enter silver purity'
                          }
                          className="w-full rounded-lg border border-gray-700 bg-[#151515] px-3 py-2 disabled:opacity-50"
                        />
                      </label>

                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => removeFromQueue(item.id)}
                        className="w-full rounded-lg border border-red-900 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                      >
                        Remove from queue
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleUploadAll()}
                disabled={uploading || !selectedCategoryId || categories.length === 0}
                className="w-full rounded-lg bg-amber-500 px-5 py-3 font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {uploading ? 'Uploading images...' : `Upload all ${uploadQueue.length} image(s)`}
              </button>
            </>
          )}
        </section>

        {/* 3. Manage jewellery */}
        <section className="space-y-5 rounded-2xl border border-amber-800/30 bg-[#121212] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">3. Manage jewellery</h2>
              <p className="mt-2 text-sm text-gray-400">
                Delete items from the catalogue using the button on each card.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadSavedItems()}
              disabled={loadingItems}
              className="rounded-lg border border-amber-700/50 px-4 py-2 text-sm hover:border-amber-500 disabled:opacity-50"
            >
              {loadingItems ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {loadingItems ? (
            <p className="text-gray-400">Loading saved jewellery...</p>
          ) : savedItems.length === 0 ? (
            <p className="text-gray-400">
              No jewellery items have been saved yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {savedItems.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-gray-800 bg-black/40"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={`Jewellery item ${item.serial_number}`}
                      className="h-64 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center bg-[#1a1a1a] text-sm text-gray-500">
                      Image unavailable
                    </div>
                  )}

                  <div className="space-y-2 p-4">
                    <p className="text-lg font-semibold text-amber-400">
                      Serial #{item.serial_number}
                    </p>
                    <p className="text-sm text-gray-300">
                      Purity: {item.purity}
                    </p>
                    <p className="text-sm text-gray-300">
                      Metal: {item.metal}
                    </p>
                    <p className="text-sm text-gray-400">
                      Category: {getCategoryName(item.category_id)}
                    </p>

                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="mt-3 w-full rounded-lg border border-red-800 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === item.id
                        ? 'Deleting...'
                        : 'Delete jewellery'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* 4. Visitor history */}
        <section className="space-y-5 rounded-2xl border border-amber-800/30 bg-[#121212] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">4. Visitor History</h2>
              <p className="mt-2 text-sm text-gray-400">
                Visitors who registered to view your catalogue.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadVisitors()}
              disabled={loadingVisitors}
              className="rounded-lg border border-amber-700/50 px-4 py-2 text-sm hover:border-amber-500 disabled:opacity-50"
            >
              {loadingVisitors ? 'Refreshing...' : 'Refresh history'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-800 bg-black/30 p-4">
              <p className="text-sm text-gray-400">Unique visitors</p>
              <p className="mt-2 text-2xl font-semibold text-amber-400">
                {visitors.length}
              </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-black/30 p-4">
              <p className="text-sm text-gray-400">Recorded visits</p>
              <p className="mt-2 text-2xl font-semibold text-amber-400">
                {visitors.reduce(
                  (total, visitor) => total + visitor.visit_count,
                  0,
                )}
              </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-black/30 p-4">
              <p className="text-sm text-gray-400">Visitors listed</p>
              <p className="mt-2 text-2xl font-semibold text-amber-400">
                {visitors.length}
              </p>
            </div>
          </div>

          {loadingVisitors ? (
            <p className="text-gray-400">Loading visitor history...</p>
          ) : visitors.length === 0 ? (
            <p className="rounded-lg border border-gray-800 bg-black/30 p-4 text-gray-400">
              No visitor records found yet. Once someone submits the visitor
              form, their record will appear here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-[#1b1b1b] text-amber-400">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Phone number</th>
                    <th className="px-4 py-3">First visit</th>
                    <th className="px-4 py-3">Last visit</th>
                    <th className="px-4 py-3 text-center">Visits</th>
                  </tr>
                </thead>

                <tbody>
                  {visitors.map((visitor) => (
                    <tr
                      key={visitor.id}
                      className="border-t border-gray-800 hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-medium">
                        {visitor.name}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {visitor.phone_number}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {formatDate(visitor.first_visited_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {formatDate(visitor.last_visited_at)}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-amber-400">
                        {visitor.visit_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
