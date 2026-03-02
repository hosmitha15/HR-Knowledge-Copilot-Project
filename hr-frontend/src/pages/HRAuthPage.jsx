import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { loginUser, registerUser } from '../services/api.js'
import { IconShield, IconCheck, IconChevronLeft, IconDarwinbox } from '../components/Icons.jsx'
import AuthForm from '../components/AuthForm.jsx'
import styles from './AuthPage.module.css'

const FEATURES = [
  'Upload PDF, DOCX, XLSX, and image files',
  'View all uploaded policy documents',
  'Delete outdated or incorrect files',
  'Secure, role-based access control',
]

export default function HRAuthPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (credentials) => {
    const data = await loginUser(credentials)
    if (data.role !== 'HR') throw new Error('This account is not an HR account.')
    login(data.token, data.role)
    navigate('/hr/dashboard')
  }

  const handleRegister = async (credentials) => {
    await registerUser({ ...credentials, role: 'HR' })
  }

  return (
    <div className={styles.page}>
      {/* Left panel */}
      <div className={styles.panel}>
        <div className={styles.panelGlow} />
        <div className={styles.panelContent}>
          <div className={styles.panelLogo}>
            <IconDarwinbox size={20} />
            <span>darwinbox</span>
          </div>
          <h2 className={styles.panelTitle}>
            HR <span className={styles.panelHighlight}>Portal</span>
          </h2>
          <p className={styles.panelSub}>
            Manage your company's knowledge base. Upload policies, review documents, and keep everything current.
          </p>
          <ul className={styles.features}>
            {FEATURES.map((f, i) => (
              <li key={i} className={styles.feature}>
                <span className={styles.featureDot}><IconCheck size={13} /></span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right form side */}
      <div className={styles.formSide}>
        <button className={styles.back} onClick={() => navigate('/')}>
          <IconChevronLeft size={16} /> Back to Home
        </button>

        <div className={styles.formWrapper}>
          <h2 className={styles.formTitle}>HR Portal</h2>
          <p className={styles.formSub}>Sign in or create your HR account below</p>
          <AuthForm role="HR" onLogin={handleLogin} onRegister={handleRegister} />
        </div>
      </div>
    </div>
  )
}
