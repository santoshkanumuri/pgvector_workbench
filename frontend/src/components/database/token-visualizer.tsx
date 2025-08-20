import React, { useState, useMemo } from 'react';

// Token colors for light and dark themes
const DARK_TOKEN_COLORS = [
  'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  'bg-green-500/20 text-green-700 dark:text-green-300',
  'bg-purple-500/20 text-purple-700 dark:text-purple-300',
  'bg-orange-500/20 text-orange-700 dark:text-orange-300',
  'bg-red-500/20 text-red-700 dark:text-red-300',
  'bg-teal-500/20 text-teal-700 dark:text-teal-300',
  'bg-pink-500/20 text-pink-700 dark:text-pink-300',
  'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
  'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
];

const LIGHT_TOKEN_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-green-100 text-green-800',
  'bg-purple-100 text-purple-800',
  'bg-orange-100 text-orange-800',
  'bg-red-100 text-red-800',
  'bg-teal-100 text-teal-800',
  'bg-pink-100 text-pink-800',
  'bg-indigo-100 text-indigo-800',
  'bg-yellow-100 text-yellow-800',
  'bg-cyan-100 text-cyan-800',
];

type Theme = 'light' | 'dark';

interface TokenVisualizerProps {
  tokens: string[];
  theme?: Theme;
}

const TokenVisualizer: React.FC<TokenVisualizerProps> = ({ tokens, theme = 'light' }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const tokenColors = theme === 'dark' ? DARK_TOKEN_COLORS : LIGHT_TOKEN_COLORS;
  
  const filteredTokens = useMemo(() => {
    if (!searchTerm) return tokens;
    return tokens.filter(token => 
      token.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [tokens, searchTerm]);

  const matchingIndices = useMemo(() => {
    if (!searchTerm) return new Set<number>();
    return new Set(
      tokens
        .map((token, index) => token.toLowerCase().includes(searchTerm.toLowerCase()) ? index : -1)
        .filter(index => index !== -1)
    );
  }, [tokens, searchTerm]);

  return (
    <div className="w-full h-full bg-white/50 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden relative transition-colors duration-300 backdrop-blur-sm flex flex-col">
      {/* Search Bar */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="relative">
          <input
            type="text"
            placeholder="Search tokens..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-white/70 dark:bg-slate-800/70 rounded-md border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all duration-300"
          />
          {searchTerm && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">
              {filteredTokens.length}/{tokens.length}
            </div>
          )}
        </div>
      </div>

      {/* Token Display */}
      <div className="flex-1 p-3 overflow-y-auto">
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono">
          {tokens.length > 0 ? (
            tokens.map((token, index) => {
              const isHighlighted = matchingIndices.has(index);
              const baseClasses = `rounded px-0.5 py-0.5 m-0.5 inline-block transition-colors duration-300 ${tokenColors[index % tokenColors.length]}`;
              const highlightClasses = isHighlighted ? 'ring-1 ring-yellow-400 ring-opacity-75 shadow-sm' : '';
              
              return (
                <span 
                  key={index} 
                  className={`${baseClasses} ${highlightClasses}`}
                  title={`Token ${index + 1}: "${token}"`}
                >
                  {token.replace(/\n/g, '↵\n')}
                </span>
              );
            })
          ) : (
            <div className="text-slate-500 dark:text-slate-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M12 6V4m0 16v-2M8 12a4 4 0 118 0 4 4 0 01-8 0z" /></svg>
              <span>Token visualization appears here</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenVisualizer;
