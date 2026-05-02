# 🤖 HR Knowledge Copilot

An AI-powered HR knowledge assistant that lets HR teams upload and manage company policy documents, and lets employees ask natural-language questions and get precise answers backed by those documents.

---

## ✨ Features

- **HR Dashboard** — Upload, view, and delete policy documents (PDF, DOCX, XLSX, CSV, images, TXT)
- **AI Chatbot** — Employees ask questions; the system retrieves the most relevant document chunks and generates grounded answers
- **Multi-format Document Processing** — Extracts text, tables, and image content from every file type
- **Semantic Search** — Uses sentence embeddings + cosine similarity with query expansion to find relevant context
- **Table Understanding** — Parses and stores tabular data (CSV, XLSX, DOCX tables, image tables) with structured chunking
- **Image/PDF Vision** — Uses Groq Vision (LLaMA) to extract facts and tables from scanned PDFs and images
- **LFU Cache** — Caches repeated Q&A responses with smart per-file invalidation on re-upload
- **JWT Auth** — Separate login flows for HR (`role: HR`) and Employees (`role: USER`)

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express (ESM modules) |
| **Frontend** | React + Vite |
| **Database** | MongoDB Atlas (via Mongoose) |
| **Embeddings** | `@xenova/transformers` — `Xenova/all-MiniLM-L6-v2` (local, no API key needed) |
| **LLM / Vision** | Groq API — `llama-3.3-70b-versatile` (chat), `llama-3.1-8b-instant` (query expansion), `meta-llama/llama-4-scout-17b-16e-instruct` (vision) |
| **PDF Parsing** | `pdf-parse` (text extraction) + `pdf-poppler` (page → images) |
| **DOCX** | `mammoth` (raw text + HTML for tables) |
| **Spreadsheets** | `xlsx` |
| **Auth** | `bcryptjs` + `jsonwebtoken` |
| **File Upload** | `multer` (disk storage → `uploads/`) |

---

## 📁 Project Structure

```
hr-knowlede-copilot--main/
├── server.js                  # Express app entry point (port 5006)
├── .env                       # Environment variables (see setup)
├── package.json               # Backend dependencies
│
├── routes/
│   ├── authRoutes.js          # POST /api/auth/register, /api/auth/login
│   ├── uploadRoutes.js        # POST /api/upload, GET/DELETE /api/documents
│   └── chatRoutes.js          # POST /api/chat, cache routes
│
├── models/
│   ├── User.js                # { email, password, role }
│   ├── Document.js            # { filename, filepath, uploadedAt }
│   ├── DocumentChunk.js       # { filename, type, content, embedding, section, tableMetadata }
│   └── CacheEntry.js          # LFU cache persistence model
│
├── services/
│   ├── embeddingService.js    # Generates sentence embeddings via @xenova/transformers
│   ├── chatServices.js        # Calls Groq LLM to generate final chat answer
│   ├── groqVisionService.js   # Groq Vision: extractStructuredFromImage, extractTablesFromText, extractFactsFromImage
│   ├── pdfImageExtractor.js   # Converts PDF pages → PNG buffers via pdf-poppler
│   └── lfuCache.js            # LFU in-memory cache with MongoDB persistence
│
├── utils/
│   └── cosineSimilarity.js    # Dot-product cosine similarity for embedding lookup
│
├── config/
│   └── db.js                  # Mongoose connection helper
│
├── uploads/                   # Stores all uploaded documents (served by /api/documents/view/:id)
│
└── hr-frontend/               # React + Vite frontend
    ├── vite.config.js         # Dev server on :3001, proxies /api → localhost:5006
    └── src/
        ├── App.jsx            # Router: /, /hr/login, /hr/dashboard, /user/login, /chat
        ├── main.jsx           # React root with BrowserRouter
        ├── context/
        │   └── AuthContext.jsx    # JWT token + role stored in localStorage
        ├── services/
        │   └── api.js             # All fetch calls to backend API
        ├── pages/
        │   ├── LandingPage.jsx    # Public landing page (HR login / User login)
        │   ├── HRAuthPage.jsx     # HR login/register form
        │   ├── UserAuthPage.jsx   # User login/register form
        │   ├── HRDashboard.jsx    # HR document manager (upload, list, delete, view)
        │   └── UserChat.jsx       # Employee chat interface
        ├── components/
        │   ├── DocumentCard.jsx   # Clickable doc card — opens document in new tab
        │   ├── UploadZone.jsx     # Drag-and-drop file upload area with progress
        │   ├── ChatMessage.jsx    # Renders a single chat bubble (user or AI)
        │   ├── Topbar.jsx         # Top navigation bar with logout
        │   ├── Toast.jsx          # Success/error notification popup
        │   ├── TypingIndicator.jsx # "AI is typing..." animation
        │   └── Icons.jsx          # SVG icon components
        └── styles/
            └── global.css         # Global CSS reset and base styles
```

---

## ⚙️ Environment Setup

Create a `.env` file in the project root:

```env
PORT=5006
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/hr_knowledge_copilot?retryWrites=true&w=majority
GROQ_API_KEY=gsk_...
JWT_SECRET=<your_secret_key>
```

> Only `MONGO_URI`, `GROQ_API_KEY`, and `JWT_SECRET` are required. All other keys in `.env` are optional/legacy.

---

## 🚀 Running the App

### Backend

```bash
# From project root
npm install
npm run dev         # starts nodemon on port 5006
# or
npm start           # production start
```

### Frontend

```bash
cd hr-frontend
npm install
npm run dev         # starts Vite dev server on http://localhost:3001
```

Then open **[http://localhost:3001](http://localhost:3001)** in your browser.

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user `{ email, password, role }` |
| `POST` | `/api/auth/login` | Login → returns `{ token, role }` |

### Documents (HR only)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a document file (multipart/form-data) |
| `GET` | `/api/documents` | List all uploaded documents |
| `GET` | `/api/documents/view/:id` | Stream / open a specific document |
| `DELETE` | `/api/documents/:id` | Delete a document and its embeddings |

### Chat
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | Send `{ question }` → returns `{ answer, sources, multiDoc }` |
| `GET` | `/api/cache/stats` | View LFU cache statistics |
| `POST` | `/api/cache/clear` | Clear all cached answers |

### Debug
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/debug/embeddings` | Summary of all stored embeddings |
| `GET` | `/api/debug/embeddings/:filename` | Embedding details for a specific file |

---

## 🧠 Document Processing Pipeline

When a file is uploaded, the system:

1. **Parses** the file based on MIME type:
   - **PDF** → Extracts text with `pdf-parse`, tables with Groq LLM, and page images with `pdf-poppler` → Groq Vision
   - **DOCX** → Extracts raw text with `mammoth`, HTML tables parsed with custom HTML parser
   - **XLSX/CSV** → Reads tabular data with `xlsx`, stores per-sheet
   - **Images** → Sent to Groq Vision for semantic fact extraction + table extraction
   - **TXT** → Direct text read

2. **Chunks** the content into three types:
   - `text` — split by headings, then overlapping 800-char windows (150-char overlap)
   - `table` — structured 5-row chunks with header metadata preserved
   - `image` — descriptions from vision model, stored as 1500-char overlapping chunks

3. **Embeds** each chunk using `all-MiniLM-L6-v2` (384-dimension vectors)

4. **Stores** chunks in MongoDB with embedding, filename, section, type, and table metadata

### Retrieval (Chat)

1. Query is **expanded** into 2 paraphrased variants via Groq LLM
2. All variants are embedded and **cosine similarity** is computed against every stored chunk
3. Keyword boosting applied (table headers get extra weight)
4. Top results are **deduplicated** and grouped by file
5. **Context** is assembled and sent to Groq LLM for final answer generation
6. Response is **cached** in LFU cache; invalidated per-file on re-upload

---

## 👥 User Roles

| Role | Access |
|---|---|
| `HR` | `/hr/dashboard` — upload, view, delete documents |
| `USER` | `/chat` — ask questions about uploaded documents |

Both roles register/login at `/hr/login` or `/user/login` respectively.