import { useNavigate } from 'react-router-dom'
import { IconDarwinbox, IconShield, IconUser } from '../components/Icons.jsx'
import styles from './LandingPage.module.css'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      {/* Animated background glows */}
      <div className={styles.glowOrb1} />
      <div className={styles.glowOrb2} />
      <div className={styles.glowOrb3} />
      <div className={styles.grid} />

      {/* Top nav bar */}
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <IconDarwinbox size={22} />
          <span>darwinbox</span>
        </div>
        <div className={styles.navRight}>
          <button className={styles.navBtn} onClick={() => navigate('/hr/login')}>HR Login</button>
          <button className={styles.navBtnPrimary} onClick={() => navigate('/user/login')}>Employee Login</button>
        </div>
      </nav>

      <div className={styles.content}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          AI-Powered HR Knowledge Base
        </div>

        <h1 className={styles.title}>
          Your Policies,<br />
          <span className={styles.highlight}>Instantly Answered</span>
        </h1>

        <p className={styles.sub}>
          Experience a modern HR platform with AI at its core. Upload policy documents once -
          employees get accurate answers instantly, no folder-digging required.
        </p>

        <div className={styles.roleCards}>
          <div className={styles.card} onClick={() => navigate('/hr/login')}>
            <div className={styles.cardGlow} />
            <div className={styles.cardIcon}>
              <IconShield size={24} />
            </div>
            <h3 className={styles.cardLabel}>HR Portal</h3>
            <p className={styles.cardDesc}>Upload and manage policy documents</p>
            <span className={styles.cardArrow}>→</span>
          </div>

          <div className={`${styles.card} ${styles.cardAlt}`} onClick={() => navigate('/user/login')}>
            <div className={styles.cardGlow} />
            <div className={styles.cardIcon}>
              <IconUser size={24} />
            </div>
            <h3 className={styles.cardLabel}>Employee</h3>
            <p className={styles.cardDesc}>Ask questions about company policies</p>
            <span className={styles.cardArrow}>→</span>
          </div>
        </div>

        {/* Feature pills */}
        <div className={styles.features}>
          <span className={styles.featurePill}>🤖 AI-Powered Answers</span>
          <span className={styles.featurePill}>📄 Multi-format Support</span>
          <span className={styles.featurePill}>🔒 Role-based Access</span>
          <span className={styles.featurePill}>⚡ Instant Responses</span>
        </div>
      </div>
    </div>
  )
}
