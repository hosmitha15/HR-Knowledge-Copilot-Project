import { IconFile, IconTrash } from './Icons.jsx'
import { deleteDocument } from '../services/api.js'
import styles from './DocumentCard.module.css'

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch {
    return '—'
  }
}

export default function DocumentCard({ doc, onDelete }) {
  const openDocument = () => {
    window.open("http://localhost:5000/api/documents/view/" + doc._id)
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${doc.filename}"?`)) return
    try {
      await deleteDocument(doc._id)
      onDelete(doc._id, doc.filename)
    } catch (err) {
      alert("Delete failed")
    }
  }

  return (
    <div
      className={styles.card}
      onClick={openDocument}
      style={{ cursor: "pointer" }}
    >
      <div className={styles.fileIcon}>
        <IconFile size={18} />
      </div>

      <div className={styles.info}>
        <p className={styles.name}>
          {doc.filename}
        </p>

        <p className={styles.meta}>
          Uploaded {formatDate(doc.uploadedAt)}
        </p>
      </div>

      <button
        className={styles.deleteBtn}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(doc._id, doc.filename)
        }}
      >
        <IconTrash size={14} />
      </button>

    </div>
  )
}
