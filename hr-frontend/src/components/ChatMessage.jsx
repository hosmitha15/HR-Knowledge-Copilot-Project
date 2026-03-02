import { IconBot, IconUser } from './Icons.jsx'
import styles from './ChatMessage.module.css'

export default function ChatMessage({ role, text, sources }) {
  const isBot = role === 'bot'

  return (
    <div className={`${styles.msg} ${isBot ? styles.bot : styles.user}`}>
      <div className={`${styles.avatar} ${isBot ? styles.botAvatar : styles.userAvatar}`}>
        {isBot ? <IconBot size={18} /> : <IconUser size={18} />}
      </div>

      <div className={styles.content}>
        <div className={`${styles.bubble} ${isBot ? styles.botBubble : styles.userBubble}`}>
          {text}
        </div>

        {isBot && sources && sources.length > 0 && (
          <div className={styles.sources}>
            {[...new Set(sources)].map((s, i) => (
              <span key={i} className={styles.sourceTag}>📄 {s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
