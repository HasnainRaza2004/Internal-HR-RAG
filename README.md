# Internal HR RAG System — VentureDive Assessment

A minimal full-stack **Retrieval-Augmented Generation (RAG)** chatbot that helps HR answer candidate questions strictly from the official [**JavaScript Full Stack AI Engineer**](https://venturedive.applytojob.com/apply/jb24by6Z5o/JavaScript-Full-Stack-AI-Engineer) job description.

Built with **100% free / open-source** tooling — no paid API keys required.

## Architecture

```
Job Description (txt)
        ↓
   Ingest script (chunk + embed)
        ↓
   Vector store (ChromaDB via Docker)
        ↓
   Express POST /api/chat  ←→  Next.js chat UI
        ↓
   Ollama (local LLM generation)
```

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Frontend | Next.js (React) |
| Embeddings | `@xenova/transformers` — `all-MiniLM-L6-v2` (runs locally) |
| Vector store | [ChromaDB](https://www.trychroma.com/) (Docker, persistent volume) |
| LLM | Ollama (`llama3.2`, `mistral`, etc.) |
| Streaming | Server-Sent Events (SSE) |
| Citations | Top-k chunk IDs + excerpts in UI |

## Prerequisites

1. **Node.js 18+**
2. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (for ChromaDB)
3. **[Ollama](https://ollama.com/)** installed and running

After installing Ollama on Windows, **open a new PowerShell window** so `ollama` is on your PATH, then:

```powershell
ollama pull llama3.2
```

## Quick Start

### 1. ChromaDB (Docker)

From the project root:

```powershell
# Option A — helper script (works if docker isn't on PATH)
.\scripts\start-chroma.ps1

# Option B — if docker is on PATH
docker compose up -d chroma
```

ChromaDB runs at **http://localhost:8000** with a persistent Docker volume.

> **Docker not recognized?** Docker Desktop is installed but your terminal may not have it on PATH. Start **Docker Desktop** from the Start menu, wait until the whale icon shows **Running**, then open a **new PowerShell window** — or use `.\scripts\start-chroma.ps1`.

### 2. Backend

```powershell
cd backend
copy .env.example .env
npm install
npm run ingest    # chunk JD + embed into ChromaDB
npm run dev       # http://localhost:3001
```

### 3. Frontend

```powershell
cd frontend
copy .env.local.example .env.local
npm install
npm run dev       # http://localhost:3000
```

### 4. Validate test queries

| Query | Expected behavior |
|-------|-------------------|
| "What backend technologies are required?" | Mentions Node.js, Express, Python |
| "Do I need to know how to deploy models locally?" | References Ollama, LM Studio, vLLM |
| "How many days of paid time off…?" | **"I don't have that information."** |

## API

### `POST /api/chat`

Non-streaming JSON response.

```json
{ "question": "What backend technologies are required?" }
```

### `POST /api/chat/stream`

SSE stream: `sources` → `token` × N → `done`

### `GET /health`

Returns chunk count and configured models.

## Project Structure

```
docker-compose.yml           # ChromaDB service
backend/
  data/job-description.txt   # Official VentureDive JD
  scripts/ingest.js
  src/
    services/ chunker, embeddings, vectorStore, rag
    routes/chat.js
    server.js
frontend/
  app/
  components/Chat.jsx
```

## Configuration

See `backend/.env.example` and `frontend/.env.local.example`.

## GitHub submission

```powershell
cd Internal-HR-RAG
git init
git add .
git commit -m "feat: internal HR RAG chatbot for VentureDive assessment"
gh repo create Internal-HR-RAG --public --source=. --push
```

Reviewers must run `docker compose up -d chroma` and `npm run ingest` in `backend/` after cloning.

## Notes

- Source JD: [VentureDive careers page](https://venturedive.applytojob.com/apply/jb24by6Z5o/JavaScript-Full-Stack-AI-Engineer)
- First embedding run downloads the MiniLM model via Hugging Face (cached locally afterward).
- If `ollama` is not recognized, use a new terminal or run: `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull llama3.2`
