'use client'

import { MagnifyingGlassIcon, LinkIcon } from '@heroicons/react/24/outline'

export type SearchMode = 'search' | 'url'

interface SearchModeToggleProps {
  mode: SearchMode
  onModeChange: (mode: SearchMode) => void
}

export default function SearchModeToggle({ mode, onModeChange }: SearchModeToggleProps) {
  return (
    <div className="flex items-center bg-slate-100 rounded-lg p-1 mb-4">
      <button
        onClick={() => onModeChange('search')}
        className={`
          flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
          ${mode === 'search'
            ? 'bg-white text-purple-600 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
          }
        `}
      >
        <MagnifyingGlassIcon className="w-4 h-4 mr-2" />
        Search Podcasts
      </button>
      
      <button
        onClick={() => onModeChange('url')}
        className={`
          flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
          ${mode === 'url'
            ? 'bg-white text-purple-600 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
          }
        `}
      >
        <LinkIcon className="w-4 h-4 mr-2" />
        Add YouTube Link
      </button>
    </div>
  )
} 