/**
 * API Client - Axios-based client for the Flask backend
 */
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min timeout for ML inference
  headers: { 'Content-Type': 'application/json' }
})

// Request interceptor
api.interceptors.request.use(config => {
  return config
})

// Response interceptor - normalize errors
api.interceptors.response.use(
  response => response.data,
  error => {
    const message = error.response?.data?.error || error.message || 'Unknown error'
    throw new Error(message)
  }
)

// Dataset endpoints
export const datasetApi = {
  upload: (formData) => axios.post('/api/upload_dataset', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  }).then(r => r.data),
  
  list: () => api.get('/datasets'),
  
  get: (id) => api.get(`/datasets/${id}`),
  
  delete: (id) => api.delete(`/datasets/${id}`),
}

// Analysis endpoints
export const analysisApi = {
  runAnalysis: (datasetId, topic = 'the topic') => api.post('/analyze_posts', {
    dataset_id: datasetId,
    topic
  }),
  
  getMisinfoResults: (datasetId, params = {}) => api.get('/misinformation_results', {
    params: { dataset_id: datasetId, ...params }
  }),
  
  getStanceResults: (datasetId, label = null) => api.get('/stance_results', {
    params: { dataset_id: datasetId, ...(label && { label }) }
  }),
  
  getTopics: (datasetId) => api.get('/topics', {
    params: { dataset_id: datasetId }
  }),
  
  getBotDetection: (datasetId, botsOnly = false) => api.get('/bot_detection', {
    params: { dataset_id: datasetId, bots_only: botsOnly }
  }),
}

// Network endpoints
export const networkApi = {
  getGraph: (datasetId) => api.get('/network_graph', {
    params: { dataset_id: datasetId }
  }),
  
  getTopSpreaders: (datasetId, limit = 10) => api.get('/top_spreaders', {
    params: { dataset_id: datasetId, limit }
  }),
}

export default api
