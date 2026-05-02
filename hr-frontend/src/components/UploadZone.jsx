// Upload zone with a category dropdown. Default is "Policies".
import { useRef, useState } from 'react'
import { IconUpload } from './Icons.jsx'
import styles from './UploadZone.module.css'

const ACCEPTED_TYPES = ['.pdf', '.docx', '.txt', '.csv', '.xlsx', '.png', '.jpg', '.jpeg']
const TYPE_LABELS = ['PDF', 'DOCX', 'TXT', 'CSV', 'XLSX', 'PNG', 'JPG']
export const CATEGORIES = ['Policies', 'Benefits', 'Compliance', 'Onboarding', 'Training', 'Other']

export default function UploadZone({ onUpload, uploading, progress }) {
  const [drag, setDrag] = useState(false)
  const [category, setCategory] = useState('Policies')
  const inputRef = useRef()

  const handleFile = (file) => { if (file) onUpload(file, category) }

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleChange = (e) => {
    handleFile(e.target.files[0])
    e.target.value = ''
  }

  return (
    <div className={styles.uploadWrapper}>
      {/* Category row — stopPropagation so it never triggers the file picker */}
      <div className={styles.categoryRow} onClick={e => e.stopPropagation()}>
        <label className={styles.categoryLabel} htmlFor="cat-select">
          Category
        </label>
        <select
          id="cat-select"
          className={styles.categorySelect}
          value={category}
          onChange={e => setCategory(e.target.value)}
          disabled={uploading}
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        className={`${styles.zone} ${drag ? styles.drag : ''} ${uploading ? styles.uploading : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
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
        <div className={styles.icon}><IconUpload size={22} /></div>
        <p className={styles.title}>
          {uploading ? 'Processing document…' : 'Drag & drop or click to upload'}
        </p>
        <p className={styles.sub}>
          {uploading
            ? 'Extracting, chunking and embedding…'
            : `Will be saved under "${category}"`}
        </p>
        <div className={styles.typeTags}>
          {TYPE_LABELS.map(t => <span key={t} className={styles.tag}>{t}</span>)}
        </div>
        {progress > 0 && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
