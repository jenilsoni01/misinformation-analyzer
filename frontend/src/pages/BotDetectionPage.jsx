import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Shield, AlertTriangle, User, Activity, Bot } from 'lucide-react'
import { analysisApi, datasetApi } from '../api/client'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card p-3 text-xs">
      {payload.map((p, i) => (
        <div key={i} className="flex gap-2">
          <span style={{ color: 'var(--color-text-muted)' }}>{p.name}:</span>
          <span className="font-medium">{typeof p.value === 'number' ? p.value.toFixed(3) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

function UserCard({ user }) {
  const isBot = user.is_bot
  
  return (
    <div className="card p-4 transition-all duration-200 hover:border-purple-500/30"
         style={{ borderColor: isBot ? 'rgba(236,72,153,0.3)' : 'var(--color-border)' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
               style={{ 
                 background: isBot ? 'rgba(236,72,153,0.15)' : 'rgba(59,130,246,0.1)'
               }}>
            {isBot ? <Bot size={16} style={{ color: '#ec4899' }} /> 
                   : <User size={16} style={{ color: '#3b82f6' }} />}
          </div>
          <div>
            <div className="text-sm font-medium">{user.user_id}</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {user.post_count} posts
            </div>
          </div>
        </div>
        
        <span className={`badge ${isBot ? 'badge-bot' : 'badge-human'}`}>
          {isBot ? 'BOT' : 'HUMAN'}
        </span>
      </div>
      
      {/* Bot probability bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span style={{ color: 'var(--color-text-muted)' }}>Bot probability</span>
          <span style={{ color: isBot ? '#ec4899' : '#10b981' }}>
            {Math.round((user.bot_probability || 0) * 100)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden"
             style={{ background: 'var(--color-border)' }}>
          <div className="h-full rounded-full transition-all"
               style={{
                 width: `${Math.round((user.bot_probability || 0) * 100)}%`,
                 background: isBot 
                   ? 'linear-gradient(90deg, #f59e0b, #ec4899)' 
                   : '#10b981'
               }} />
        </div>
      </div>
      
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center p-2 rounded" style={{ background: 'var(--color-bg)' }}>
          <div className="font-mono font-medium">{(user.degree_centrality || 0).toFixed(3)}</div>
          <div style={{ color: 'var(--color-text-muted)' }}>Centrality</div>
        </div>
        <div className="text-center p-2 rounded" style={{ background: 'var(--color-bg)' }}>
          <div className="font-mono font-medium">{(user.pagerank || 0).toFixed(4)}</div>
          <div style={{ color: 'var(--color-text-muted)' }}>PageRank</div>
        </div>
        <div className="text-center p-2 rounded" style={{ background: 'var(--color-bg)' }}>
          <div className="font-mono font-medium">{user.community_id ?? '-'}</div>
          <div style={{ color: 'var(--color-text-muted)' }}>Community</div>
        </div>
      </div>
    </div>
  )
}

export default function BotDetectionPage() {
  const [datasets, setDatasets] = useState([])
  const [selectedDataset, setSelectedDataset] = useState(null)
  const [botData, setBotData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filterBots, setFilterBots] = useState(false)
  
  useEffect(() => {
    datasetApi.list().then(data => {
      const analyzed = data.filter(d => d.status === 'analyzed')
      setDatasets(analyzed)
      if (analyzed.length > 0) setSelectedDataset(analyzed[0].id)
    }).catch(() => {})
  }, [])
  
  useEffect(() => {
    if (!selectedDataset) return
    loadBotData(selectedDataset)
  }, [selectedDataset])
  
  const loadBotData = async (datasetId, botsOnly = false) => {
    setLoading(true)
    setError(null)
    try {
      const data = await analysisApi.getBotDetection(datasetId, botsOnly)
      setBotData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  
  const handleFilter = () => {
    const newFilter = !filterBots
    setFilterBots(newFilter)
    loadBotData(selectedDataset, newFilter)
  }
  
  const summary = botData?.summary || {}
  const users = botData?.users || []
  
  const pieData = [
    { name: 'Humans', value: summary.human_count || 0, fill: '#3b82f6' },
    { name: 'Bots', value: summary.bot_count || 0, fill: '#ec4899' },
  ]
  
  // Bar chart: bot probability distribution
  const probBuckets = Array(10).fill(0).map((_, i) => ({
    range: `${i * 10}-${(i + 1) * 10}%`,
    count: 0
  }))
  
  users.forEach(u => {
    const bucket = Math.min(9, Math.floor((u.bot_probability || 0) * 10))
    probBuckets[bucket].count++
  })
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedDataset || ''}
          onChange={e => setSelectedDataset(Number(e.target.value))}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        >
          {datasets.map(d => (
            <option key={d.id} value={d.id}>{d.filename}</option>
          ))}
        </select>
        
        <button
          onClick={handleFilter}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: filterBots ? 'rgba(236,72,153,0.2)' : 'var(--color-surface)',
            border: filterBots ? '1px solid rgba(236,72,153,0.4)' : '1px solid var(--color-border)',
            color: filterBots ? '#ec4899' : 'var(--color-text)'
          }}
        >
          {filterBots ? '🤖 Bots Only' : 'All Users'}
        </button>
        
        {loading && <div className="spinner" />}
      </div>
      
      {error && (
        <div className="p-3 rounded-lg text-sm"
             style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}
      
      {/* Summary Cards */}
      {summary.total_users > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: summary.total_users, color: '#7c3aed', icon: User },
            { label: 'Bots Detected', value: summary.bot_count, color: '#ec4899', icon: Bot },
            { label: 'Human Accounts', value: summary.human_count, color: '#3b82f6', icon: User },
            { label: 'Bot Rate', value: `${summary.bot_percentage || 0}%`, color: '#f59e0b', icon: Activity },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="card card-glow p-4">
              <div className="flex items-center gap-2 mb-3">
                <Icon size={16} style={{ color }} />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
              </div>
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      
      {/* Charts */}
      {users.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie chart */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4"
                style={{ color: 'var(--color-text-muted)' }}>
              Human vs Bot Distribution
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80}
                     paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                     labelLine={{ stroke: 'rgba(255,255,255,0.2)' }}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {/* Bot probability distribution */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4"
                style={{ color: 'var(--color-text-muted)' }}>
              Bot Probability Distribution
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={probBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="range" tick={{ fill: '#6b6b8a', fontSize: 10 }} axisLine={false} />
                <YAxis tick={{ fill: '#6b6b8a', fontSize: 10 }} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      
      {/* User Cards Grid */}
      {users.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4"
              style={{ color: 'var(--color-text-muted)' }}>
            {filterBots ? 'Detected Bot Accounts' : 'All Accounts'} ({users.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {users.map(user => (
              <UserCard key={user.user_id} user={user} />
            ))}
          </div>
        </div>
      )}
      
      {!loading && users.length === 0 && selectedDataset && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Shield size={40} className="mb-3" style={{ color: 'var(--color-text-muted)' }} />
          <p className="font-medium mb-1">No user data found</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Run analysis on the dataset to detect bots
          </p>
        </div>
      )}
    </div>
  )
}
