import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { sendChatMessage } from '../services/api.js'
import Topbar from '../components/Topbar.jsx'
import ChatMessage from '../components/ChatMessage.jsx'
import TypingIndicator from '../components/TypingIndicator.jsx'
import { IconSend, IconBot } from '../components/Icons.jsx'
import styles from './UserChat.module.css'

const SUGGESTIONS = [
  'What is the leave policy?',
  'How many sick days do I get?',
  'What is the work from home policy?',
  'How do I apply for maternity leave?',
]

export default function UserChat() {
  const { logout } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef()
  const textareaRef             = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (question) => {
    const q = (question || input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)

    try {
      const data = await sendChatMessage(q)
      setMessages(prev => [...prev, {
        role: 'bot',
        text: data.answer,
        sources: data.sources || [],
      }])
    } catch (err) {
      if (err.message.includes('401') || err.message.includes('denied')) {
        logout()
        return
      }
      setMessages(prev => [...prev, {
        role: 'bot',
        text: "Sorry, I couldn't get a response. Please try again.",
        sources: [],
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleInput = (e) => {
    setInput(e.target.value)
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  return (
    <div className={styles.page}>
      <Topbar />

      <div className={styles.chatArea}>
        {messages.length === 0 && !loading ? (
          <div className={styles.welcome}>
            <div className={styles.welcomeIcon}><IconBot size={28} /></div>
            <h2 className={styles.welcomeTitle}>HR Knowledge Copilot</h2>
            <p className={styles.welcomeSub}>
              Ask me anything about your company's HR policies — leave, benefits,
              code of conduct, reimbursements, and more.
            </p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className={styles.suggestion} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.messages}>
            {messages.map((m, i) => (
              <ChatMessage key={i} role={m.role} text={m.text} sources={m.sources} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            rows={1}
            placeholder="Ask about leave policies, benefits, code of conduct…"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
          />
          <button
            className={styles.sendBtn}
            onClick={() => send()}
            disabled={loading || !input.trim()}
          >
            <IconSend size={18} />
          </button>
        </div>
        <p className={styles.hint}>Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
