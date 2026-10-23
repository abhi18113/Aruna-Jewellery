import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { supabase } from './supabase'

const STORAGE_BUCKET = 'Jewellery_Images'
const ADMIN_USER_ID = '0e5bb9ce-dd7b-4115-bdb5-ddd17aeb937c'

type Category = {
  id: string
  name: string
}

type JewelleryItem = {
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

export default function Admin() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [categories, setCategories] = useState<Category[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  )
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(
    null,
  )

  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([])
  const [uploading, setUploading] = useState(false)

  const [items, setItems] = useState<JewelleryItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [loadingVisitors, setLoadingVisitors] = useState(false)

  const loadCategories = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('categories')
      .select('id, name')
      .order('name')

    if (loadError) {
      setError(`Could not load categories: ${loadError.message}`)
      return
    }

    setCategories(data ?? [])
  }, [])

  const loadItems = useCallback(async () => {
    setLoadingItems(true)

    try {
      const { data, error: loadError } = await supabase
        .from('jewellery_items')
        .select('id, serial_number, purity, metal, category_id, image_path')
        .order('serial_number', { ascending: false })

      if (loadError) {
        setError(`Could not load jewellery: ${loadError.message}`)
        return
      }

      const loadedItems: JewelleryItem[] = await Promise.all(
        (data ?? []).map(async (item) => {
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

      setItems(loadedItems)
    } catch {
      setError('Could not load jewellery items.')
    } finally {
      setLoadingItems(false)
    }
  }, [])

  const loadVisitors = useCallback(async () => {
    setLoadingVisitors(true)

    try {
      const { data, error: loadError } = await supabase
        .from('catalogue_visitors')
        .select(
          'id, name, phone_number, first_visited_at, last_visited_at, visit_count',
        )
        .order('last_visited_at', { ascending: false })

      if (loadError) {
        setError(`Could not load visitor history: ${loadError.message}`)
        return
      }

      setVisitors((data ?? []) as Visitor[])
    } catch {
      setError('Could not load visitor history.')
    } finally {
      setLoadingVisitors(false)
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    await Promise.all([loadCategories(), loadItems(), loadVisitors()])
  }, [loadCategories, loadItems, loadVisitors])

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
          await loadDashboard()
        } else if (data.session) {
          await supabase.auth.signOut()
        }
      } catch {
        if (active) setError('Could not check your login session.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void checkSession()

    return () => {
      active = false
    }
  }, [loadDashboard])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    const { data, error: loginError } =
      await supabase.auth.signInWithPassword({ email, password })

    if (loginError) {
      setError(loginError.message)
      return
    }

    if (data.user?.id !== ADMIN_USER_ID) {
      await supabase.auth.signOut()
      setError('This account is not authorised to access the admin page.')
      return
    }

    setIsAdmin(true)
    setMessage('Login successful.')
    await loadDashboard()
  }

  async function handleLogout() {
    const { error: logoutError } = await supabase.auth.signOut()

    if (logoutError) {
      setError(logoutError.message)
      return
    }

    uploadQueue.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setUploadQueue([])
    setCategories([])
    setItems([])
    setVisitors([])
    setSelectedCategoryId('')
    setIsAdmin(false)
    setMessage('You have been logged out.')
    setError('')
  }

  async function handleAddCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    const name = newCategory.trim()

    if (!name) {
      setError('Please enter a category name.')
      return
    }

    const duplicate = categories.some(
      (category) => category.name.toLowerCase() === name.toLowerCase(),
    )

    if (duplicate) {
      setError('A category with this name already exists.')
      return
    }

    const { data, error: insertError } = await supabase
      .from('categories')
      .insert({ name })
      .select('id, name')
      .single()

    if (insertError) {
      setError(`Could not add category: ${insertError.message}`)
      return
    }

    setCategories((current) =>
      [...current, data].sort((a, b) => a.name.localeCompare(b.name)),
    )
    setNewCategory('')
    setMessage(`Category "${name}" added successfully.`)
  }

  function startEditingCategory(category: Category) {
    setError('')
    setMessage('')
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
  }

  function cancelEditingCategory() {
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  async function handleUpdateCategory(
    event: FormEvent<HTMLFormElement>,
    categoryId: string,
  ) {
    event.preventDefault()

    const name = editingCategoryName.trim()

    if (!name) {
      setError('Please enter a category name.')
      return
    }

    const duplicate = categories.some(
      (category) =>
        category.id !== categoryId &&
        category.name.toLowerCase() === name.toLowerCase(),
    )

    if (duplicate) {
      setError('Another category already uses this name.')
      return
    }

    setSavingCategory(true)
    setError('')
    setMessage('')

    try {
      const { data, error: updateError } = await supabase
        .from('categories')
        .update({ name })
        .eq('id', categoryId)
        .select('id, name')
        .single()

      if (updateError) {
        setError(`Could not rename category: ${updateError.message}`)
        return
      }

      setCategories((current) =>
        current
          .map((category) => (category.id === categoryId ? data : category))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )

      cancelEditingCategory()
      setMessage(
        `Category renamed to "${data.name}". Its jewellery items remain linked.`,
      )
    } catch {
      setError('An unexpected error occurred while renaming the category.')
    } finally {
      setSavingCategory(false)
    }
  }

  async function handleDeleteCategory(category: Category) {
    if (uploadQueue.length > 0 && selectedCategoryId === category.id) {
      setError(
        'This category is selected for queued uploads. Upload or clear the queue first.',
      )
      return
    }

    const confirmed = window.confirm(
      `Delete the category "${category.name}"?\n\nYou can only delete a category that contains no jewellery items.`,
    )

    if (!confirmed) return

    setDeletingCategoryId(category.id)
    setError('')
    setMessage('')

    try {
      const { data: linkedItems, error: checkError } = await supabase
        .from('jewellery_items')
        .select('id')
        .eq('category_id', category.id)
        .limit(1)

      if (checkError) {
        setError(`Could not check category items: ${checkError.message}`)
        return
      }

      if (linkedItems && linkedItems.length > 0) {
        setError(
          `Cannot delete "${category.name}" because it contains jewellery items. Rename the category instead, or move/delete its items first.`,
        )
        return
      }

      const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .eq('id', category.id)

      if (deleteError) {
        setError(`Could not delete category: ${deleteError.message}`)
        return
      }

      setCategories((current) =>
        current.filter((entry) => entry.id !== category.id),
      )

      if (selectedCategoryId === category.id) {
        setSelectedCategoryId('')
      }

      if (editingCategoryId === category.id) {
        cancelEditingCategory()
      }

      setMessage(`Category "${category.name}" deleted successfully.`)
    } catch {
      setError('An unexpected error occurred while deleting the category.')
    } finally {
      setDeletingCategoryId(null)
    }
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (!selectedCategoryId) {
      setError('Please select a category before choosing images.')
      return
    }

    const imageFiles = files.filter((file) => file.type.startsWith('image/'))

    if (imageFiles.length === 0) {
      setError('Please select valid image files.')
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

  async function handleUploadAll() {
    if (uploadQueue.length === 0) {
      setError('Please select at least one image.')
      return
    }

    if (!categories.some((category) => category.id === selectedCategoryId)) {
      setError('Please select a valid category.')
      return
    }

    if (uploadQueue.some((item) => !item.purity.trim())) {
      setError('Please enter the purity for every image.')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')

    const failedItems: UploadItem[] = []
    let uploadedCount = 0

    try {
      for (const item of uploadQueue) {
        const safeFilename = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const imagePath = `catalogue/${crypto.randomUUID()}-${safeFilename}`

        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(imagePath, item.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: item.file.type,
          })

        if (storageError) {
          failedItems.push(item)
          setError((current) => current || storageError.message)
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
          await supabase.storage.from(STORAGE_BUCKET).remove([imagePath])
          failedItems.push(item)
          setError((current) => current || insertError.message)
          continue
        }

        uploadedCount++
        URL.revokeObjectURL(item.previewUrl)
      }

      setUploadQueue(failedItems)

      if (uploadedCount > 0) {
        const categoryName =
          categories.find((category) => category.id === selectedCategoryId)
            ?.name ?? 'selected category'

        setMessage(
          `${uploadedCount} image(s) uploaded to "${categoryName}" successfully.`,
        )
        await loadItems()
      }

      if (failedItems.length === 0) setError('')
    } catch {
      setError('An unexpected error occurred during upload.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteItem(item: JewelleryItem) {
    const confirmed = window.confirm(
      `Delete jewellery item #${item.serial_number}? This action cannot be undone.`,
    )

    if (!confirmed) return

    setDeletingItemId(item.id)
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

      setItems((current) => current.filter((entry) => entry.id !== item.id))

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([item.image_path])

      setMessage(
        storageError
          ? `Item #${item.serial_number} was removed, but its stored image could not be deleted.`
          : `Jewellery item #${item.serial_number} deleted successfully.`,
      )
    } catch {
      setError('An unexpected error occurred while deleting the item.')
    } finally {
      setDeletingItemId(null)
    }
  }

  function categoryName(categoryId: string) {
    return (
      categories.find((category) => category.id === categoryId)?.name ??
      'Unknown category'
    )
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0d0d0d] text-amber-400">
        Checking admin session...
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0d0d0d] px-4 py-12 text-white">
        <form
          onSubmit={(event) => void handleLogin(event)}
          className="w-full max-w-md space-y-6 rounded-2xl border border-amber-800/40 bg-[#151515] p-8"
        >
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">
              Aruna Jewellery
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Admin Login</h1>
            <p className="mt-2 text-sm text-gray-400">
              Sign in with the authorised owner account.
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-gray-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500"
              placeholder="Owner email"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-gray-300">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500"
              placeholder="Password"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-amber-500 px-5 py-3 font-semibold text-black hover:bg-amber-400"
          >
            Sign in
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-amber-800/30 pb-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">
              Aruna Jewellery
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Admin Dashboard
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Manage categories, catalogue images, and visitors.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-lg border border-gray-700 px-4 py-2 hover:border-amber-500"
          >
            Log out
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300"
          >
            {error}
            <button
              type="button"
              onClick={() => setError('')}
              className="ml-3 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {message && (
          <div
            role="status"
            className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4 text-amber-200"
          >
            {message}
            <button
              type="button"
              onClick={() => setMessage('')}
              className="ml-3 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Manage categories */}
        <section className="space-y-5 rounded-2xl border border-amber-800/30 bg-[#121212] p-5 sm:p-7">
          <div>
            <h2 className="text-2xl font-semibold">1. Manage categories</h2>
            <p className="mt-2 text-sm text-gray-400">
              Add a category, correct its name, or delete an empty category.
            </p>
          </div>

          <form
            onSubmit={(event) => void handleAddCategory(event)}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="New category name"
              required
              className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-amber-500 px-5 py-3 font-semibold text-black hover:bg-amber-400"
            >
              Add category
            </button>
          </form>

          <div className="space-y-3">
            {categories.length === 0 ? (
              <p className="text-gray-400">No categories found.</p>
            ) : (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  {editingCategoryId === category.id ? (
                    <form
                      onSubmit={(event) =>
                        void handleUpdateCategory(event, category.id)
                      }
                      className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row"
                    >
                      <input
                        value={editingCategoryName}
                        onChange={(event) =>
                          setEditingCategoryName(event.target.value)
                        }
                        required
                        autoFocus
                        className="min-w-0 flex-1 rounded-lg border border-amber-700 bg-black px-3 py-2 outline-none focus:border-amber-400"
                      />
                      <button
                        type="submit"
                        disabled={savingCategory}
                        className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-black disabled:opacity-50"
                      >
                        {savingCategory ? 'Saving...' : 'Save name'}
                      </button>
                      <button
                        type="button"
                        disabled={savingCategory}
                        onClick={cancelEditingCategory}
                        className="rounded-lg border border-gray-700 px-4 py-2 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="break-words font-medium">
                          {category.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Category ID: {category.id}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditingCategory(category)}
                          className="rounded-lg border border-amber-700/60 px-4 py-2 text-sm text-amber-300 hover:bg-amber-950/30"
                        >
                          Edit name
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(category)}
                          disabled={deletingCategoryId === category.id}
                          className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                        >
                          {deletingCategoryId === category.id
                            ? 'Deleting...'
                            : 'Delete'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* 2. Bulk upload */}
        <section className="space-y-5 rounded-2xl border border-amber-800/30 bg-[#121212] p-5 sm:p-7">
          <div>
            <h2 className="text-2xl font-semibold">2. Bulk upload images</h2>
            <p className="mt-2 text-sm text-gray-400">
              Choose a category, select multiple images, check purity, and upload.
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-gray-300">Upload category</span>
            <select
              value={selectedCategoryId}
              onChange={(event) => setSelectedCategoryId(event.target.value)}
              disabled={uploading}
              className="w-full rounded-lg border border-gray-700 bg-black px-4 py-3 outline-none focus:border-amber-500 disabled:opacity-50"
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label
            className={`inline-flex cursor-pointer items-center justify-center rounded-lg border border-amber-700/60 px-5 py-3 font-medium text-amber-300 hover:bg-amber-950/30 ${
              !selectedCategoryId || uploading
                ? 'cursor-not-allowed opacity-50'
                : ''
            }`}
          >
            Choose images
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={!selectedCategoryId || uploading}
              onChange={handleFileSelection}
              className="sr-only"
            />
          </label>

          {uploadQueue.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">
                  {uploadQueue.length} image(s) in queue
                </p>
                <button
                  type="button"
                  onClick={clearUploadQueue}
                  disabled={uploading}
                  className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
                >
                  Clear queue
                </button>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {uploadQueue.map((item) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-gray-800 bg-black/30"
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-56 w-full object-cover"
                    />

                    <div className="space-y-4 p-4">
                      <p className="break-words text-sm text-gray-300">
                        {item.file.name}
                      </p>

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
                          className="w-full rounded-lg border border-gray-700 bg-[#151515] px-3 py-2"
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
                          placeholder="Example: 22K"
                          className="w-full rounded-lg border border-gray-700 bg-[#151515] px-3 py-2"
                        />
                      </label>

                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => removeFromQueue(item.id)}
                        className="w-full rounded-lg border border-red-900 px-3 py-2 text-sm text-red-300 disabled:opacity-50"
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
                disabled={uploading || !selectedCategoryId}
                className="w-full rounded-lg bg-amber-500 px-5 py-3 font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {uploading
                  ? 'Uploading images...'
                  : `Upload all ${uploadQueue.length} image(s)`}
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
                View uploaded items and delete unwanted catalogue entries.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadItems()}
              disabled={loadingItems}
              className="rounded-lg border border-amber-700/50 px-4 py-2 text-sm disabled:opacity-50"
            >
              {loadingItems ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {loadingItems ? (
            <p className="text-gray-400">Loading jewellery...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-400">No jewellery items found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
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
                    <p className="text-sm text-gray-300">Metal: {item.metal}</p>
                    <p className="text-sm text-gray-400">
                      Category: {categoryName(item.category_id)}
                    </p>

                    <button
                      type="button"
                      onClick={() => void handleDeleteItem(item)}
                      disabled={deletingItemId === item.id}
                      className="mt-3 w-full rounded-lg border border-red-800 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
                    >
                      {deletingItemId === item.id
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
              <h2 className="text-2xl font-semibold">4. Visitor history</h2>
              <p className="mt-2 text-sm text-gray-400">
                View visitors recorded by your catalogue.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadVisitors()}
              disabled={loadingVisitors}
              className="rounded-lg border border-amber-700/50 px-4 py-2 text-sm disabled:opacity-50"
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
              No visitor records found yet.
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