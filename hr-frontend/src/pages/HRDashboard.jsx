import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchDocuments, uploadDocument, deleteDocument } from '../services/api.js'
import Topbar from '../components/Topbar.jsx'
import UploadZone from '../components/UploadZone.jsx'
import DocumentCard from '../components/DocumentCard.jsx'
import Toast from '../components/Toast.jsx'
import { IconRefresh } from '../components/Icons.jsx'
import styles from './HRDashboard.module.css'

export default function HRDashboard() {
  const { logout } = useAuth()

  const [docs, setDocs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [uploading, setUploading]   = useState(false)
  const [progress, setProgress]     = useState(0)
  const [toast, setToast]           = useState(null)

  const showToast = (message, type = 'success') => setToast({ message, type })

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const documents = await fetchDocuments()
      setDocs(documents)
    } catch (err) {
      if (err.message.includes('401') || err.message.includes('denied')) {
        logout()
        return
      }
      showToast('Failed to load documents.', 'error')
    } finally {
      setLoading(false)
    }
  }, [logout])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  // upload docs
  const handleUpload = async (file) => {
    setUploading(true)
    setProgress(20)
    try {
      setProgress(50)
      await uploadDocument(file)
      setProgress(90)
      showToast(`"${file.name}" uploaded successfully!`)
      setProgress(100)
      setTimeout(() => { setProgress(0); loadDocs() }, 700)
    } catch (err) {
      showToast(err.message || 'Upload failed.', 'error')
      setProgress(0)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id, filename) => {
  if (!window.confirm(`Delete "${filename}"?`)) return
  try {
    await deleteDocument(id)
    showToast(`"${filename}" deleted`)
    setDocs(prev => prev.filter(d => d._id !== id))
  } catch (err) {
    showToast(err.message || 'Delete failed', 'error')
  }
}

  return (
    <div className={styles.page}>
      <Topbar />

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Document Manager</h1>
            <p className={styles.sub}>Upload and manage your company's HR policy documents</p>
          </div>
          <button className={styles.refreshBtn} onClick={loadDocs} title="Refresh">
            <IconRefresh size={15} /> Refresh
          </button>
        </div>

        <UploadZone onUpload={handleUpload} uploading={uploading} progress={progress} />

        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Policy Documents</h2>
          <span className={styles.count}>{docs.length}</span>
        </div>

        {loading ? (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <p>Loading documents…</p>
          </div>
        ) : docs.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No documents yet</h3>
            <p>Upload your first policy document above to get started.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {docs.map(doc => (
              <DocumentCard
                key={doc._id}
                doc={doc}
                onDelete={handleDelete}
              />

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
