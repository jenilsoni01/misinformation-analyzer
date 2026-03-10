import { useState, useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { networkApi, datasetApi } from '../api/client'
import { Network, Users, TrendingUp, AlertTriangle, Info } from 'lucide-react'

// Color scheme for nodes
const NODE_COLORS = {
  bot: '#ec4899',
  high_misinfo: '#ef4444',
  medium_misinfo: '#f59e0b',
  low_misinfo: '#10b981'
}

const LEGEND_ITEMS = [
  { color: '#ef4444', label: 'High Misinfo (>70%)' },
  { color: '#f59e0b', label: 'Medium Misinfo (30-70%)' },
  { color: '#10b981', label: 'Low Misinfo (<30%)' },
  { color: '#ec4899', label: 'Bot Account' },
]

function StatBadge({ label, value, color }) {
  return (
    <div className="text-center p-3 rounded-lg" style={{ background: 'var(--color-bg)' }}>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  )
}

function SpreadersTable({ spreaders }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            {['Rank', 'User', 'Misinfo %', 'PageRank', 'Bot', 'Posts'].map(h => (
              <th key={h} className="pb-2 px-2 text-left font-medium"
                  style={{ color: 'var(--color-text-muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spreaders.map((s, i) => (
            <tr key={s.user_id} className="border-b" 
                style={{ borderColor: 'var(--color-border)' }}>
              <td className="py-2 px-2 font-mono"
                  style={{ color: i < 3 ? '#f59e0b' : 'var(--color-text-muted)' }}>
                #{i + 1}
              </td>
              <td className="py-2 px-2 font-medium">{s.user_id}</td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-1">
                  <div className="h-1 rounded-full" 
                       style={{ 
                         width: `${Math.round(s.misinfo_ratio * 40)}px`,
                         background: s.misinfo_ratio > 0.7 ? '#ef4444' : s.misinfo_ratio > 0.3 ? '#f59e0b' : '#10b981'
                       }} />
                  <span>{Math.round(s.misinfo_ratio * 100)}%</span>
                </div>
              </td>
              <td className="py-2 px-2 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {s.pagerank?.toFixed(4)}
              </td>
              <td className="py-2 px-2">
                {s.is_bot 
                  ? <span className="badge badge-bot">BOT</span>
                  : <span className="badge badge-human">human</span>
                }
              </td>
              <td className="py-2 px-2" style={{ color: 'var(--color-text-muted)' }}>
                {s.post_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function D3Graph({ nodes, edges }) {
  const svgRef = useRef()
  const [tooltip, setTooltip] = useState(null)
  
  useEffect(() => {
    if (!nodes?.length || !svgRef.current) return
    
    const container = svgRef.current.parentElement
    const width = container.clientWidth
    const height = Math.max(400, container.clientHeight || 500)
    
    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove()
    
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
    
    // Add zoom behavior
    const g = svg.append('g')
    
    svg.call(d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    )
    
    // Build simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges)
        .id(d => d.id)
        .distance(80)
        .strength(0.3)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(d => (d.size || 6) + 4))
    
    // Draw edges
    const link = g.append('g')
      .selectAll('line')
      .data(edges)
      .enter()
      .append('line')
      .attr('stroke', 'rgba(255,255,255,0.08)')
      .attr('stroke-width', d => Math.min(3, Math.sqrt(d.weight || 1) * 0.3))
    
    // Draw nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('r', d => Math.max(5, Math.min(20, d.size || 6)))
      .attr('fill', d => NODE_COLORS[d.category] || '#6b6b8a')
      .attr('stroke', d => d.is_bot ? '#ec4899' : 'rgba(255,255,255,0.1)')
      .attr('stroke-width', d => d.is_bot ? 2 : 1)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget)
          .attr('stroke', 'white')
          .attr('stroke-width', 2)
        setTooltip({ x: event.offsetX, y: event.offsetY, data: d })
      })
      .on('mouseout', (event, d) => {
        d3.select(event.currentTarget)
          .attr('stroke', d.is_bot ? '#ec4899' : 'rgba(255,255,255,0.1)')
          .attr('stroke-width', d.is_bot ? 2 : 1)
        setTooltip(null)
      })
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null; d.fy = null
        })
      )
    
    // Add user ID labels for larger nodes
    const labels = g.append('g')
      .selectAll('text')
      .data(nodes.filter(d => (d.size || 6) > 12))
      .enter()
      .append('text')
      .text(d => d.id)
      .attr('font-size', '9px')
      .attr('fill', 'rgba(255,255,255,0.6)')
      .attr('text-anchor', 'middle')
      .attr('dy', d => -(d.size || 6) - 4)
    
    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
      
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
      
      labels
        .attr('x', d => d.x)
        .attr('y', d => d.y)
    })
    
    return () => simulation.stop()
  }, [nodes, edges])
  
  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      
      {tooltip && (
        <div className="absolute pointer-events-none card p-3 text-xs z-10 max-w-xs"
             style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          <p className="font-bold mb-1">{tooltip.data.id}</p>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Misinfo: {Math.round(tooltip.data.misinfo_ratio * 100)}%
          </p>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Posts: {tooltip.data.post_count}
          </p>
          <p style={{ color: 'var(--color-text-muted)' }}>
            PageRank: {tooltip.data.pagerank?.toFixed(5)}
          </p>
          {tooltip.data.is_bot && (
            <span className="badge badge-bot mt-1">BOT</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function NetworkPage() {
  const [datasets, setDatasets] = useState([])
  const [selectedDataset, setSelectedDataset] = useState(null)
  const [graphData, setGraphData] = useState(null)
  const [spreadersData, setSpreadersData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [view, setView] = useState('graph') // graph | spreaders
  
  useEffect(() => {
    datasetApi.list().then(data => {
      const analyzed = data.filter(d => d.status === 'analyzed')
      setDatasets(analyzed)
      if (analyzed.length > 0) setSelectedDataset(analyzed[0].id)
    }).catch(() => {})
  }, [])
  
  useEffect(() => {
    if (!selectedDataset) return
    loadNetwork(selectedDataset)
  }, [selectedDataset])
  
  const loadNetwork = async (datasetId) => {
    setLoading(true)
    setError(null)
    
    try {
      const [graph, spreaders] = await Promise.all([
        networkApi.getGraph(datasetId),
        networkApi.getTopSpreaders(datasetId, 15)
      ])
      setGraphData(graph)
      setSpreadersData(spreaders)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  
  const stats = graphData?.stats || {}
  
  return (
    <div className="space-y-4 animate-fade-in h-full">
      {/* Controls */}
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
        
        <div className="flex rounded-lg overflow-hidden border"
             style={{ borderColor: 'var(--color-border)' }}>
          {[['graph', 'Network Graph'], ['spreaders', 'Top Spreaders']].map(([val, label]) => (
            <button key={val}
                    onClick={() => setView(val)}
                    className="px-4 py-2 text-sm transition-colors"
                    style={{
                      background: view === val ? 'rgba(124,58,237,0.2)' : 'var(--color-surface)',
                      color: view === val ? '#a78bfa' : 'var(--color-text-muted)'
                    }}>
              {label}
            </button>
          ))}
        </div>
        
        {loading && <div className="spinner" />}
      </div>
      
      {error && (
        <div className="p-3 rounded-lg text-sm"
             style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}
      
      {/* Stats Row */}
      {stats.total_nodes > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBadge label="Users (Nodes)" value={stats.total_nodes} color="#7c3aed" />
          <StatBadge label="Interactions (Edges)" value={stats.total_edges} color="#ec4899" />
          <StatBadge label="Bots Detected" value={stats.bot_count} color="#f59e0b" />
          <StatBadge label="Communities" value={stats.communities} color="#3b82f6" />
        </div>
      )}
      
      {view === 'graph' && (
        <div className="card" style={{ height: '500px', position: 'relative' }}>
          {/* Legend */}
          <div className="absolute top-3 right-3 z-10 card p-3 text-xs space-y-1.5">
            {LEGEND_ITEMS.map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                <span style={{ color: 'var(--color-text-muted)' }}>{item.label}</span>
              </div>
            ))}
          </div>
          
          <div className="absolute bottom-3 left-3 z-10 text-xs"
               style={{ color: 'var(--color-text-muted)' }}>
            <div className="flex items-center gap-1">
              <Info size={11} />
              <span>Scroll to zoom • Drag to pan • Click nodes to inspect</span>
            </div>
          </div>
          
          {graphData?.nodes?.length > 0 ? (
            <D3Graph nodes={graphData.nodes} edges={graphData.edges} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm"
                 style={{ color: 'var(--color-text-muted)' }}>
              {loading ? 'Loading network...' : 'No network data available'}
            </div>
          )}
        </div>
      )}
      
      {view === 'spreaders' && spreadersData && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4"
              style={{ color: 'var(--color-text-muted)' }}>
            Top Misinformation Spreaders
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Ranked by influence score = misinfo_ratio × pagerank × 1000
          </p>
          <SpreadersTable spreaders={spreadersData.top_spreaders || []} />
        </div>
      )}
    </div>
  )
}
