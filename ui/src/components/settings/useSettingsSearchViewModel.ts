import { useState, useCallback } from 'react'

export const TAB_MATCH_MAP: Record<string, string[]> = {
  video: ['desentrelaçamento', 'deinterlacer', 'bwdif', 'qtgmc', 'video', 'vídeo', 'modo', 'fps', 'interlaced', 'resolução', 'upscale', '1080p', 'codec', 'h264', 'h265', 'hevc'],
  audio: ['áudio', 'audio', 'stereo', 'mono', 'delay', 'atraso', 'sincronização', 'tratamento', 'normalização', 'ebu', 'r128', 'lufs'],
  filters: ['chroma', 'cores', 'filtros', 'denoise', 'ruído', 'dotcrawl', 'comb', 'overscan', 'bordas'],
  advanced: ['crf', 'qualidade', 'avançado', 'bitrate'],
  ai: ['ai', 'ia', 'inteligência', 'deepfilter', 'dropout', 'rife', '60fps', 'upscaler', 'super', 'resolução', 'codeformer', 'face', 'rosto', 'whisper', 'legendas', 'subtitles', 'hardware'],
  storage: ['storage', 'armazenamento', 'disco', 'diretório', 'drive', 'pasta', 'caminho', 'nuvem'],
  presets: ['preset', 'presets', 'modo', 'broadcast', 'master', 'gold', 'speed', 'tbc'],
}

export function useSettingsSearchViewModel() {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('presets')

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val)
    const query = val.trim().toLowerCase()
    if (!query) return

    const currentMatches = TAB_MATCH_MAP[activeTab]?.some(k => k.includes(query) || query.includes(k))
    if (!currentMatches) {
      for (const [tabKey, keywords] of Object.entries(TAB_MATCH_MAP)) {
        if (keywords.some(k => k.includes(query) || query.includes(k))) {
          setActiveTab(tabKey)
          break
        }
      }
    }
  }, [activeTab])

  const matches = useCallback((keywords: string[]) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return keywords.some(k => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()))
  }, [search])

  const isTabMatching = useCallback((tabKey: string) => {
    const q = search.trim().toLowerCase()
    if (!q) return false
    return TAB_MATCH_MAP[tabKey]?.some(k => k.includes(q) || queryIncludes(k, q))
  }, [search])

  return {
    search,
    setSearch,
    activeTab,
    setActiveTab,
    handleSearchChange,
    matches,
    isTabMatching,
  }
}

function queryIncludes(keyword: string, query: string): boolean {
  return query.includes(keyword)
}
