import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export function Logo({ className = '', size = 'md', showTagline = false }: LogoProps) {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Clock-hand glyph */}
      <div
        className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/20 via-[#101620] to-teal-500/5 border border-teal-500/40 shadow-glowTeal ${iconSizes[size]}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4/5 h-4/5 text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.6)]"
        >
          {/* Clock face ring */}
          <circle cx="12" cy="12" r="9" strokeOpacity="0.7" />
          
          {/* Ticks at 12, 3, 6, 9 */}
          <line x1="12" y1="3.5" x2="12" y2="5" strokeOpacity="0.5" />
          <line x1="20.5" y1="12" x2="19" y2="12" strokeOpacity="0.5" />
          <line x1="12" y1="20.5" x2="12" y2="19" strokeOpacity="0.5" />
          <line x1="3.5" y1="12" x2="5" y2="12" strokeOpacity="0.5" />

          {/* Clock hands: Hour hand pointing to 9 (back in time), Minute hand pointing to 12 */}
          <line x1="12" y1="12" x2="8" y2="12" stroke="#2dd4bf" strokeWidth="2.4" />
          <line x1="12" y1="12" x2="12" y2="6.5" stroke="#2dd4bf" strokeWidth="2" />

          {/* Pivot center pin */}
          <circle cx="12" cy="12" r="1.5" fill="#2dd4bf" />

          {/* Subtle counter-clockwise arrow indicating temporal rollback */}
          <path
            d="M 6.5 6.5 A 8 8 0 0 0 4 12"
            stroke="#f59e0b"
            strokeWidth="1.2"
            strokeDasharray="2 2"
            strokeOpacity="0.8"
          />
        </svg>
      </div>

      <div className="flex flex-col">
        <div className={`font-semibold tracking-tight leading-none ${textSizes[size]}`}>
          <span className="text-white font-bold">As</span>
          <span className="text-teal-400 font-extrabold ml-[1px]">Of</span>
        </div>
        {showTagline && (
          <span className="text-[11px] text-slate-400 tracking-wide font-normal mt-1">
            Every diagnosis, as it was known.
          </span>
        )}
      </div>
    </div>
  );
}
