import { useState, useEffect } from 'react'
import { 
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { analysisApi, datasetApi } from '../api/client'
import { AlertTriangle, TrendingUp, Hash, Users, RefreshCw } from 'lucide-react'

const MISINFO_COLORS = {
  factual: '#10b981',
  misinformation: '#ef4444',
  propaganda: '#f59e0b'
}

const STANCE_COLORS = {
  support: '#3b82f6',
  oppose: '#ef4444',
  neutral: '#6b7280'
}

function MetricCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card card-glow p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: `${color}20` }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-sm font-medium mb-1">{label}</div>
      {sub && <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </h3>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card p-3 text-xs">
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.fill || p.color }} />
          <span style={{ color: 'var(--color-text-muted)' }}>{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [datasets, setDatasets] = useState([])
  const [selectedDataset, setSelectedDataset] = useState(null)
  const [misinfoData, setMisinfoData] = useState(null)
  const [stanceData, setStanceData] = useState(null)
  const [topicsData, setTopicsData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    datasetApi.list().then(data => {
      const analyzed = data.filter(d => d.status === 'analyzed')
      setDatasets(analyzed)
      if (analyzed.length > 0) setSelectedDataset(analyzed[0].id)
    }).catch(() => {})
  }, [])
  
  useEffect(() => {
    if (!selectedDataset) return
    loadData(selectedDataset)
  }, [selectedDataset])
  
  const loadData = async (datasetId) => {
    setLoading(true)
    setError(null)
    
    try {
      const [misinfo, stance, topics] = await Promise.all([
        analysisApi.getMisinfoResults(datasetId),
        analysisApi.getStanceResults(datasetId),
        analysisApi.getTopics(datasetId)
      ])
      
      setMisinfoData(misinfo)
      setStanceData(stance)
      setTopicsData(topics)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  
  // Prepare chart data
  const misinfoDistribution = misinfoData ? 
    Object.entries(misinfoData.summary?.label_distribution || {})
      .filter(([k]) => k !== 'unanalyzed')
      .map(([name, value]) => ({ name, value, fill: MISINFO_COLORS[name] || '#888' }))
    : []
  
  const stanceDistribution = stanceData ?
    Object.entries(stanceData.summary?.stance_distribution || {})
      .filter(([k]) => k !== 'unanalyzed')
      .map(([name, value]) => ({ name, value, fill: STANCE_COLORS[name] || '#888' }))
    : []
  
  const timeline = misinfoData?.summary?.timeline || []
  
  const topicsChartData = topicsData?.topics?.slice(0, 8).map(t => ({
    name: `Topic ${t.topic_id}`,
    posts: t.post_count,
    keywords: t.keywords?.slice(0, 3).join(', '),
    misinfo_ratio: Math.round((t.misinfo_ratio || 0) * 100)
  })) || []
  
  const totalPosts = misinfoData?.total || 0
  const misinfoCount = misinfoData?.summary?.label_distribution?.misinformation || 0
  const misinfoPercent = totalPosts > 0 ? Math.round(misinfoCount / totalPosts * 100) : 0
  
  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
             style={{ background: 'rgba(124,58,237,0.1)' }}>
          <AlertTriangle size={28} style={{ color: 'var(--color-accent)' }} />
        </div>
        <p className="font-semibold mb-2">No Analyzed Datasets</p>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Upload and analyze a CSV dataset to see analytics
        </p>
        <a href="/" className="mt-4 text-sm px-4 py-2 rounded-lg"
           style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}>
          Go to Upload →
        </a>
      </div>
    )
  }
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Dataset selector */}
      <div className="flex items-center gap-4">
        <select
          value={selectedDataset || ''}
          onChange={e => setSelectedDataset(Number(e.target.value))}
          className="px-4 py-2 rounded-lg text-sm outline-none"
          style={{ 
            background: 'var(--color-surface)', 
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)'
          }}
        >
          {datasets.map(d => (
            <option key={d.id} value={d.id}>{d.filename} ({d.post_count} posts)</option>
          ))}
        </select>
        
        <button onClick={() => loadData(selectedDataset)}
                className="p-2 rounded-lg transition-colors hover:bg-white/5">
          <RefreshCw size={16} style={{ color: 'var(--color-text-muted)' }} />
        </button>
        
        {loading && <div className="spinner" />}
      </div>
      
      {error && (
        <div className="p-3 rounded-lg text-sm"
             style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}
      
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={AlertTriangle}
          label="Total Posts"
          value={totalPosts.toLocaleString()}
          sub="In dataset"
          color="#7c3aed"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Misinformation"
          value={`${misinfoPercent}%`}
          sub={`${misinfoCount} posts flagged`}
          color="#ef4444"
        />
        <MetricCard
          icon={Hash}
          label="Topics Found"
          value={topicsData?.total_topics || 0}
          sub="Narrative clusters"
          color="#ec4899"
        />
        <MetricCard
          icon={TrendingUp}
          label="Avg Confidence"
          value={`${Math.round((misinfoData?.summary?.avg_confidence || 0) * 100)}%`}
          sub="Classification score"
          color="#10b981"
        />
      </div>
      
      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Misinformation Distribution */}
        <div className="card p-5">
          <SectionTitle>Misinformation Distribution</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={misinfoDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {misinfoDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={(value) => (
                  <span style={{ color: 'var(--color-text)', fontSize: 12 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Stance Distribution */}
        <div className="card p-5">
          <SectionTitle>Stance Distribution</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stanceDistribution} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: '#6b6b8a', fontSize: 12 }} axisLine={false} />
              <YAxis tick={{ fill: '#6b6b8a', fontSize: 12 }} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {stanceDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Timeline Chart */}
      {timeline.length > 0 && (
        <div className="card p-5">
          <SectionTitle>Misinformation Timeline</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#6b6b8a', fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: '#6b6b8a', fontSize: 11 }} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={v => <span style={{ color: 'var(--color-text)', fontSize: 11 }}>{v}</span>} />
              <Line type="monotone" dataKey="factual" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="misinformation" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="propaganda" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      
      {/* Topics / Narratives */}
      {topicsChartData.length > 0 && (
        <div className="card p-5">
          <SectionTitle>Topic Clusters</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topicsChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" tick={{ fill: '#6b6b8a', fontSize: 11 }} axisLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: '#6b6b8a', fontSize: 11 }} axisLine={false} width={60} />
              <Tooltip 
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="card p-3 text-xs max-w-xs">
                      <p className="font-semibold mb-1">{d?.name}</p>
                      <p style={{ color: 'var(--color-text-muted)' }}>Posts: {d?.posts}</p>
                      <p style={{ color: 'var(--color-text-muted)' }}>Keywords: {d?.keywords}</p>
                      <p style={{ color: '#ef4444' }}>Misinfo ratio: {d?.misinfo_ratio}%</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="posts" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          
          {/* Topic keyword pills */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {topicsData?.topics?.slice(0, 6).map(topic => (
              <div key={topic.topic_id} className="flex items-start gap-2 p-3 rounded-lg"
                   style={{ background: 'var(--color-bg)' }}>
                <span className="text-xs px-2 py-0.5 rounded font-mono"
                      style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}>
                  T{topic.topic_id}
                </span>
                <div className="flex flex-wrap gap-1">
                  {topic.keywords?.slice(0, 5).map(kw => (
                    <span key={kw} className="text-xs px-2 py-0.5 rounded"
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
