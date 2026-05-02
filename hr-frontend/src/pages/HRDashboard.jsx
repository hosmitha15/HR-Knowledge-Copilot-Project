import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchDocuments, uploadDocument, deleteDocument } from '../services/api.js'
import { CATEGORIES } from '../components/UploadZone.jsx'
import Topbar from '../components/Topbar.jsx'
import UploadZone from '../components/UploadZone.jsx'
import DocumentCard from '../components/DocumentCard.jsx'
import Toast from '../components/Toast.jsx'
import { IconRefresh } from '../components/Icons.jsx'
import styles from './HRDashboard.module.css'

const CATEGORY_COLORS = {
  Policies: '#0183ff',
  Benefits: '#22c55e',
  Compliance: '#f59e0b',
  Onboarding: '#8b5cf6',
  Training: '#ec4899',
  Other: '#6b7280',
}

export default function HRDashboard() {
  const { logout } = useAuth()

  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [toast, setToast] = useState(null)
  const [activeCategory, setActive] = useState('Policies')   // selected filter button

  const showToast = (message, type = 'success') => setToast({ message, type })

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const documents = await fetchDocuments()
      setDocs(documents)
    } catch (err) {
      if (err.message.includes('401') || err.message.includes('denied')) { logout(); return }
      showToast('Failed to load documents.', 'error')
    } finally {
      setLoading(false)
    }
  }, [logout])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleUpload = async (file, category) => {
    setUploading(true)
    setProgress(20)
    try {
      setProgress(50)
      await uploadDocument(file, category)
      setProgress(90)
      showToast(`"${file.name}" uploaded to ${category}!`)
      setProgress(100)
      setActive(category)   // jump to the category the file was uploaded to
      setTimeout(() => { setProgress(0); loadDocs() }, 700)
    } catch (err) {
      showToast(err.message || 'Upload failed.', 'error')
      setProgress(0)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id, filename) => {
    try {
      await deleteDocument(id)
      showToast(`"${filename}" deleted`)
      setDocs(prev => prev.filter(d => d._id !== id))
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error')
    }
  }

  // Count per category for badge numbers on filter buttons
  const countByCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = docs.filter(d => (d.category || 'Policies') === cat).length
    return acc
  }, {})

  // Docs shown in the grid = only the active category
  const visibleDocs = docs.filter(d => (d.category || 'Policies') === activeCategory)

  return (
    <div className={styles.page}>
      <Topbar />

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Document Manager</h1>
            <p className={styles.sub}>Upload and manage your company's HR documents</p>
          </div>
          <button className={styles.refreshBtn} onClick={loadDocs} title="Refresh">
            <IconRefresh size={15} /> Refresh
          </button>
        </div>

        <UploadZone onUpload={handleUpload} uploading={uploading} progress={progress} />

        {/* ── Category filter buttons ── */}
        <div className={styles.filterRow}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`${styles.filterBtn} ${activeCategory === cat ? styles.filterBtnActive : ''}`}
              style={activeCategory === cat ? {
                background: CATEGORY_COLORS[cat],
                borderColor: CATEGORY_COLORS[cat],
                color: '#fff',
              } : {}}
              onClick={() => setActive(cat)}
            >
              {cat}
              {countByCategory[cat] > 0 && (
                <span className={styles.filterCount}>{countByCategory[cat]}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Document grid ── */}
        {loading ? (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <p>Loading documents…</p>
          </div>
        ) : visibleDocs.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No {activeCategory} documents</h3>
            <p>Upload a document and select "{activeCategory}" from the dropdown.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleDocs.map(doc => (
              <DocumentCard key={doc._id} doc={doc} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
