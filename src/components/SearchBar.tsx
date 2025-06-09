'use client'

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  isLoading?: boolean
}

export default function SearchBar({ value, onChange, placeholder = "Search...", isLoading = false }: SearchBarProps) {
  return (
    <div className="relative w-full">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-4 py-4 text-lg bg-white border border-purple-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
      />
      {isLoading && (
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
        </div>
      )}
    </div>
  )
} 