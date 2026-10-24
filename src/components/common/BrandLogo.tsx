import React from 'react';
import { LiquidMetal } from '@/components/ui/liquid-metal';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'w-7 h-7 rounded-lg',
  md: 'w-10 h-10 sm:w-11 sm:h-11 rounded-xl',
  lg: 'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl',
};

/**
 * CampusConnect Brand Logo Badge
 * Renders the custom interlocked "CC" logo mark (/assets/aistudio/image_80579ee0.png)
 * over a live animated LiquidMetal shader surface so the coastal theme animation
 * flows visibly behind the logo.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className = '' }) => {
  return (
    <div
      className={`relative overflow-hidden isolate flex items-center justify-center shrink-0 border border-white/50 dark:border-cyan-300/35 shadow-[0_6px_20px_-4px_rgba(14,116,144,0.32)] ${SIZE_CLASSES[size]} ${className}`}
    >
      {/* Live Theme Animation Behind Logo */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <LiquidMetal
          variant="oil"
          speed={0.95}
          distortion={1.15}
          pointerInfluence={false}
          className="w-full h-full scale-125"
        />
        {/* Subtle luminous coastal glaze so the dark navy interlocked CC mark stays high-contrast */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-tr from-cyan-100/35 via-white/30 to-sky-200/35"
        />
      </div>

      {/* Interlocked "CC" Brand Mark with Background Knocked Out via Multiply + Contrast Filter */}
      <img
        src="/assets/aistudio/image_80579ee0.png"
        alt="CampusConnect Logo"
        className="relative z-10 w-full h-full object-cover scale-[1.18] select-none pointer-events-none mix-blend-multiply"
        style={{
          filter: 'brightness(1.26) contrast(2.35)',
        }}
      />

      {/* Specular Glass Rim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/45"
      />
    </div>
  );
};
