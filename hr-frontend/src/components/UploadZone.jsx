import { useRef, useState } from 'react'
import { IconUpload } from './Icons.jsx'
import styles from './UploadZone.module.css'

const ACCEPTED_TYPES = ['.pdf', '.docx', '.txt', '.csv', '.xlsx', '.png', '.jpg', '.jpeg']
const TYPE_LABELS = ['PDF', 'DOCX', 'TXT', 'CSV', 'XLSX', 'PNG', 'JPG']

export default function UploadZone({ onUpload, uploading, progress }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef()

  const handleFile = (file) => {
    if (file) onUpload(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  const handleChange = (e) => {
    const file = e.target.files[0]
    handleFile(file)
    e.target.value = ''
  }

  return (
    <div
      className={`${styles.zone} ${drag ? styles.drag : ''} ${uploading ? styles.uploading : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className={styles.fileInput}
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleChange}
        disabled={uploading}
      />

      <div className={styles.icon}>
        <IconUpload size={22} />
      </div>

      <p className={styles.title}>
        {uploading ? 'Processing document…' : 'Drag & drop or click to upload'}
      </p>
      <p className={styles.sub}>
        {uploading
          ? 'Extracting text, chunking and generating embeddings…'
          : 'Files are parsed, chunked, and embedded automatically'
        }
      </p>

      <div className={styles.typeTags}>
        {TYPE_LABELS.map(t => (
          <span key={t} className={styles.tag}>{t}</span>
        ))}
      </div>

      {progress > 0 && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
