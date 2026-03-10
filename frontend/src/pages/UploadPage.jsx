import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader, Play, ChevronRight } from 'lucide-react'
import { datasetApi, analysisApi } from '../api/client'

function StatCard({ label, value, color = 'var(--color-accent)' }) {
  return (
    <div className="card p-4 card-glow">
      <div className="text-2xl font-bold mb-1" style={{ color }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  )
}

function AnalysisStep({ number, title, status }) {
  const colors = { pending: '#6b6b8a', active: '#7c3aed', done: '#10b981', error: '#ef4444' }
  const icons = { 
    pending: <span className="w-5 h-5 rounded-full border-2 border-current" />,
    active: <div className="spinner" />,
    done: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />
  }
  
  return (
    <div className="flex items-center gap-3 py-2">
      <div style={{ color: colors[status] }}>{icons[status]}</div>
      <span className="text-sm" style={{ 
        color: status === 'pending' ? 'var(--color-text-muted)' : 'var(--color-text)' 
      }}>{title}</span>
    </div>
  )
}

export default function UploadPage() {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [error, setError] = useState(null)
  const [topic, setTopic] = useState('climate change')
  const fileRef = useRef()
  
  const [steps, setSteps] = useState([
    { id: 'misinfo', title: 'Misinformation Classification', status: 'pending' },
    { id: 'stance', title: 'Stance Detection', status: 'pending' },
    { id: 'topics', title: 'Topic / Narrative Discovery', status: 'pending' },
    { id: 'bots', title: 'Bot Detection', status: 'pending' },
    { id: 'network', title: 'Network Graph Construction', status: 'pending' },
  ])
  
  const updateStep = (id, status) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }
  
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) {
      setFile(dropped)
      setError(null)
    } else {
      setError('Please upload a CSV file')
    }
  }, [])
  
  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await datasetApi.upload(formData)
      setUploadResult(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }
  
  const handleAnalyze = async () => {
    if (!uploadResult) return
    setAnalyzing(true)
    setError(null)
    
    // Animate steps sequentially
    const stepIds = ['misinfo', 'stance', 'topics', 'bots', 'network']
    
    try {
      // Activate first step immediately
      updateStep('misinfo', 'active')
      
      // Start analysis
      const resultPromise = analysisApi.runAnalysis(uploadResult.dataset_id, topic)
      
      // Simulate progressive step animation
      let currentStep = 0
      const stepInterval = setInterval(() => {
        if (currentStep < stepIds.length - 1) {
          updateStep(stepIds[currentStep], 'done')
          currentStep++
          updateStep(stepIds[currentStep], 'active')
        } else {
          clearInterval(stepInterval)
        }
      }, 2500)
      
      const result = await resultPromise
      
      clearInterval(stepInterval)
      stepIds.forEach(id => updateStep(id, 'done'))
      setAnalysisResult(result)
      
    } catch (e) {
      setError(e.message)
      steps.forEach(s => {
        if (s.status === 'active') updateStep(s.id, 'error')
      })
    } finally {
      setAnalyzing(false)
    }
  }
  
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold mb-1">Upload Dataset</h2>
        <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
          Upload a CSV file of social media posts to analyze misinformation patterns
        </p>
      </div>
      
      {/* CSV Format Info */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
          <FileText size={16} style={{ color: 'var(--color-accent)' }} />
          <span>Required CSV Format</span>
        </div>
        <div className="font-mono text-xs rounded-lg p-3 overflow-x-auto"
             style={{ background: 'var(--color-bg)', color: '#a78bfa' }}>
          post_id, user_id, post_text, timestamp, retweet_count, reply_count
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Required: post_id, user_id, post_text &nbsp;|&nbsp; Optional: timestamp, retweet_count, reply_count
        </p>
      </div>
      
      {/* Drop Zone */}
      {!uploadResult && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="card cursor-pointer transition-all duration-300"
          style={{
            padding: '48px',
            textAlign: 'center',
            border: dragOver || file 
              ? '2px dashed rgba(124,58,237,0.6)' 
              : '2px dashed var(--color-border)',
            background: dragOver 
              ? 'rgba(124,58,237,0.05)' 
              : 'var(--color-surface)'
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { setFile(e.target.files[0]); setError(null) }}
          />
          
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
               style={{ background: 'rgba(124,58,237,0.1)' }}>
            <Upload size={28} style={{ color: 'var(--color-accent)' }} />
          </div>
          
          {file ? (
            <div>
              <p className="font-semibold text-green-400 mb-1">✓ {file.name}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {(file.size / 1024).toFixed(1)} KB — Click to change
              </p>
            </div>
          ) : (
            <div>
              <p className="font-semibold mb-1">Drop CSV file here</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                or click to browse files
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#ef4444' }} />
          <span className="text-sm" style={{ color: '#ef4444' }}>{error}</span>
        </div>
      )}
      
      {/* Upload Success */}
      {uploadResult && !analysisResult && (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500/10">
              <CheckCircle size={18} className="text-green-400" />
            </div>
            <div>
              <div className="font-semibold text-green-400">Dataset Uploaded</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {uploadResult.posts_loaded} posts loaded from {uploadResult.filename}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatCard label="Posts Loaded" value={uploadResult.posts_loaded} color="#10b981" />
            <StatCard label="Dataset ID" value={`#${uploadResult.dataset_id}`} color="#7c3aed" />
          </div>
          
          {/* Topic input */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Topic for Stance Detection
            </label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. climate change, vaccines, elections..."
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all"
              style={{ 
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)'
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.6)'}
              onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
            />
          </div>
          
          {/* Analysis Steps */}
          {analyzing && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--color-bg)' }}>
              <p className="text-xs font-semibold mb-3 uppercase tracking-wider" 
                 style={{ color: 'var(--color-text-muted)' }}>
                Running ML Pipeline
              </p>
              {steps.map(step => (
                <AnalysisStep key={step.id} {...step} />
              ))}
            </div>
          )}
          
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="w-full py-3 px-6 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200"
            style={{
              background: analyzing ? 'var(--color-border)' : 'linear-gradient(135deg, #7c3aed, #ec4899)',
              color: 'white',
              cursor: analyzing ? 'not-allowed' : 'pointer'
            }}
          >
            {analyzing ? (
              <><div className="spinner" /><span>Analyzing...</span></>
            ) : (
              <><Play size={16} /><span>Run Analysis</span></>
            )}
          </button>
        </div>
      )}
      
      {/* Analysis Complete */}
      {analysisResult && (
        <div className="card p-6 animate-fade-in card-glow">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(236,72,153,0.2))' }}>
              <CheckCircle size={20} style={{ color: '#10b981' }} />
            </div>
            <div>
              <div className="font-bold">Analysis Complete!</div>
              <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                All ML models have processed the dataset
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Posts Analyzed" value={analysisResult.post_count} />
            <StatCard label="Topics Found" value={analysisResult.topics_found} color="#ec4899" />
            <StatCard label="Bots Detected" value={analysisResult.bot_count} color="#f59e0b" />
            <StatCard 
              label="Misinfo Posts" 
              value={analysisResult.misinfo_distribution?.misinformation || 0}
              color="#ef4444"
            />
          </div>
          
          <a href="/dashboard" 
             className="flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-semibold text-sm transition-all"
             style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa' }}>
            View Analytics Dashboard
            <ChevronRight size={16} />
          </a>
        </div>
      )}
      
      {/* Upload button (before upload result) */}
      {file && !uploadResult && !uploading && (
        <button
          onClick={handleUpload}
          className="w-full py-3 px-6 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)', color: 'white' }}
        >
          <Upload size={16} />
          Upload {file.name}
        </button>
      )}
      
      {uploading && (
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="spinner" />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Uploading and processing CSV...
          </span>
        </div>
      )}
    </div>
  )
}
