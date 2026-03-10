# Misinformation Propagation Analyzer

A production-quality full-stack system that analyzes social media posts for misinformation, detects bots, discovers narratives, and visualizes how misinformation spreads across networks.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend (Vite + Tailwind + D3.js + Recharts)    │
│  Pages: Upload | Analytics | Network Graph | Bot Det.   │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API (JSON)
┌─────────────────────▼───────────────────────────────────┐
│  Flask Backend                                          │
│  ├── dataset_routes   (upload, list, delete)            │
│  ├── analysis_routes  (analyze, results, topics, bots)  │
│  └── network_routes   (graph, top spreaders)            │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│  ML Pipeline                                            │
│  ├── MisinformationClassifier  (DistilBERT / zero-shot) │
│  ├── StanceDetector            (BERT / zero-shot)       │
│  ├── TopicDetector             (BERTopic)               │
│  ├── BotDetector               (RandomForest)           │
│  └── NetworkAnalyzer           (NetworkX)               │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│  Database (SQLite / PostgreSQL)                         │
│  Tables: posts | users | datasets | topics             │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- Git

### 1. Clone and Setup Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env if needed (SQLite works out of the box)

# Run Flask backend
python app.py
# Server starts at http://localhost:5000
```

### 2. Setup Frontend

```bash
cd frontend

# Install Node dependencies
npm install

# Start development server
npm run dev
# App opens at http://localhost:3000
```

### 3. Use the App

1. Open http://localhost:3000
2. Upload the sample dataset: `data/sample_posts.csv`
3. Set a topic (e.g. "vaccines" or "climate change")
4. Click **Run Analysis** to start the ML pipeline
5. View results in Analytics, Network, and Bot Detection pages

---

## Training Your Own Models

### Train Misinformation Classifier

```bash
cd backend

python training_scripts/train_misinformation_model.py \
  --data ../data/misinfo_training_data.csv \
  --output ../models/misinfo_model \
  --epochs 3 \
  --batch-size 16
```

This fine-tunes DistilBERT on 3 classes: `factual`, `misinformation`, `propaganda`.

### Train Bot Detector

```bash
python training_scripts/train_bot_model.py \
  --data ../data/bot_training_data.csv \
  --output ../models/bot_model.joblib
```

This trains a RandomForest on behavioral features.

### Model Fallbacks

If trained models are not found, the system automatically uses:
- **Misinformation**: `facebook/bart-large-mnli` zero-shot classification
- **Stance**: `facebook/bart-large-mnli` zero-shot with topic-aware prompting
- **Topics**: TF-IDF + KMeans when BERTopic fails
- **Bots**: Rule-based heuristics (post frequency, similarity, retweet ratio)

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/upload_dataset` | POST | Upload CSV dataset |
| `/api/datasets` | GET | List all datasets |
| `/api/analyze_posts` | POST | Run full ML pipeline |
| `/api/misinformation_results` | GET | Get classification results |
| `/api/stance_results` | GET | Get stance detection results |
| `/api/topics` | GET | Get narrative clusters |
| `/api/bot_detection` | GET | Get bot detection results |
| `/api/network_graph` | GET | Get D3-ready graph data |
| `/api/top_spreaders` | GET | Get top misinfo spreaders |
| `/api/health` | GET | Health check |

---

## CSV Dataset Format

```csv
post_id,user_id,post_text,timestamp,retweet_count,reply_count
1,user_001,"Post text here",2024-01-15 08:23:00,245,89
```

**Required columns:** `post_id`, `user_id`, `post_text`  
**Optional columns:** `timestamp`, `retweet_count`, `reply_count`

---

## ML Pipeline Details

### 1. Text Preprocessing
- HTML entity decoding
- URL removal
- Mention/hashtag normalization
- Whitespace normalization
- Repeated character collapsing

### 2. Misinformation Classification
Model: DistilBERT fine-tuned on labeled social media posts  
Labels: `factual` | `misinformation` | `propaganda`  
Fallback: Zero-shot via `facebook/bart-large-mnli`

### 3. Stance Detection
Detects attitude toward a user-specified topic  
Labels: `support` | `oppose` | `neutral`  
Method: Topic-aware zero-shot prompting

### 4. Topic/Narrative Discovery (BERTopic)
1. Generate embeddings with `all-MiniLM-L6-v2`
2. Reduce dimensions with UMAP (n_components=5)
3. Cluster with HDBSCAN (min_cluster_size=3)
4. Extract keywords with c-TF-IDF

### 5. Bot Detection (RandomForest)
Features per user:
- `post_frequency`: posts per day
- `similarity_score`: avg Jaccard similarity between posts
- `retweet_ratio`: retweets / total interactions
- `avg_reply_count`: average replies received

### 6. Network Analysis (NetworkX)
- Nodes = users
- Edges = inferred interactions (retweet patterns)
- Metrics: degree centrality, PageRank, Louvain communities
- Top spreaders: ranked by `misinfo_ratio × pagerank`

---

## Project Structure

```
misinformation-analyzer/
├── backend/
│   ├── app.py                        # Flask app factory
│   ├── requirements.txt
│   ├── .env.example
│   ├── routes/
│   │   ├── dataset_routes.py         # Upload/manage datasets
│   │   ├── analysis_routes.py        # ML analysis endpoints
│   │   └── network_routes.py         # Graph endpoints
│   ├── models/
│   │   └── database_models.py        # SQLAlchemy ORM
│   ├── services/
│   │   ├── text_preprocessor.py      # Text cleaning
│   │   └── analysis_orchestrator.py  # Pipeline coordinator
│   ├── ml_models/
│   │   ├── misinfo_classifier.py     # Misinfo + stance models
│   │   ├── bot_detector.py           # Bot detection
│   │   ├── topic_detector.py         # BERTopic narratives
│   │   └── network_analyzer.py       # NetworkX graph
│   └── training_scripts/
│       ├── train_misinformation_model.py
│       └── train_bot_model.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx                   # Router + layout
│   │   ├── api/client.js             # Axios API client
│   │   └── pages/
│   │       ├── UploadPage.jsx        # Dataset upload
│   │       ├── DashboardPage.jsx     # Analytics charts
│   │       ├── NetworkPage.jsx       # D3 network graph
│   │       └── BotDetectionPage.jsx  # Bot results
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── data/
│   ├── sample_posts.csv              # Example dataset
│   ├── misinfo_training_data.csv     # Training data
│   └── bot_training_data.csv
└── models/                           # Trained model artifacts
```

---

## Using PostgreSQL (Production)

```bash
# Install PostgreSQL and create database
createdb misinfo_db

# Update .env
DATABASE_URL=postgresql://user:password@localhost:5432/misinfo_db
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///misinformation.db` | Database connection string |
| `FLASK_ENV` | `development` | Flask environment |
| `SECRET_KEY` | `dev-secret-key` | Flask secret key |
| `MISINFO_MODEL_PATH` | `../models/misinfo_model` | Fine-tuned misinfo model path |
| `STANCE_MODEL_PATH` | `../models/stance_model` | Fine-tuned stance model path |
| `BOT_MODEL_PATH` | `../models/bot_model.joblib` | Bot detector model path |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, Recharts, D3.js |
| Backend | Python Flask, SQLAlchemy |
| Database | SQLite (dev) / PostgreSQL (prod) |
| NLP | HuggingFace Transformers, Sentence Transformers |
| ML | Scikit-learn, BERTopic, NetworkX |
| Deployment | gunicorn, environment variables |
