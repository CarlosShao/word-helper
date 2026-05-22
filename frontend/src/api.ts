import axios from 'axios'

const api = axios.create({
  baseURL: '/api'
})

export interface Word {
  id: number
  english: string
  part_of_speech: string
  chinese: string
}

export const wordApi = {
  importFile: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/import', formData)
  },
  
  getWords: (page: number = 1, pageSize: number = 20, search: string = '') => {
    return api.get('/words', { params: { page, pageSize, search } })
  },
  
  getWordIndex: (wordId: number) => {
    return api.get(`/words/index/${wordId}`)
  },
  
  getWordsTree: (search: string = '') => {
    return api.get('/words/tree', { params: { search } })
  },

  getWordRelations: (wordId: number) => {
    return api.get(`/words/${wordId}/relations`)
  },
  
  getRootWords: () => {
    return api.get('/words/roots')
  },
  
  addRelation: (rootWordId: number, childWordId: number, relationType: string) => {
    return api.post('/relations', { rootWordId, childWordId, relationType })
  },
  
  deleteRelation: (id: number) => {
    return api.delete(`/relations/${id}`)
  },
  
  removeWordRelations: (wordId: number) => {
    return api.delete(`/relations/word/${wordId}`)
  },
  
  classifyAll: (keepManual: boolean = false) => {
    return api.post('/classify/all', { keepManual })
  },
  
  resetWordClassification: (wordId: number) => {
    return api.post('/classify/reset', { wordId })
  },
  
  addErrorWord: (wordId: number) => {
    return api.post('/error-words', { wordId })
  },
  
  removeErrorWord: (wordId: number) => {
    return api.delete(`/error-words/${wordId}`)
  },
  
  getErrorWords: () => {
    return api.get('/error-words')
  },
  
  getObservationWords: () => {
    return api.get('/observation-words')
  },
  
  markObservationCorrect: (wordId: number) => {
    return api.post(`/observation-words/${wordId}/correct`)
  },
  
  markObservationError: (wordId: number) => {
    return api.post(`/observation-words/${wordId}/error`)
  },
  
  getYesterdayErrors: () => {
    return api.get('/yesterday-errors')
  },
  
  startPractice: () => {
    return api.post('/practice/start')
  },
  
  endPractice: (sessionId?: number) => {
    return api.post('/practice/end', { sessionId })
  },
  
  getSetting: (key: string) => {
    return api.get(`/settings/${key}`)
  },
  
  saveSetting: (key: string, value: any) => {
    return api.post(`/settings/${key}`, { value })
  },
  
  deleteWord: (wordId: number) => {
    return api.delete(`/words/${wordId}`)
  },
  
  batchDeleteWords: (wordIds: number[]) => {
    return api.post('/words/batch-delete', { wordIds })
  },

  updateWord: (wordId: number, data: { english: string, part_of_speech: string, chinese: string }) => {
    return api.put(`/words/${wordId}`, data)
  },

  addWord: (data: { english: string, part_of_speech: string, chinese: string }) => {
    return api.post('/words', data)
  }
}

export const posApi = {
  getAll: () => {
    return api.get('/parts-of-speech').then(res => res.data)
  },
  
  add: (data: { code: string, name: string, description?: string }) => {
    return api.post('/parts-of-speech', data).then(res => res.data)
  },
  
  update: (id: number, data: { code: string, name: string, description?: string }) => {
    return api.put(`/parts-of-speech/${id}`, data).then(res => res.data)
  },
  
  delete: (id: number) => {
    return api.delete(`/parts-of-speech/${id}`).then(res => res.data)
  },
  
  initFromWords: () => {
    return api.post('/parts-of-speech/init-from-words').then(res => res.data)
  }
}
