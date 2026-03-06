import React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const liquidbuttonVariants = cva(
  'inline-flex items-center transition-colors justify-center cursor-pointer gap-2 whitespace-nowrap rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50 outline-none',
  {
    variants: {
      variant: {
        default: 'bg-transparent hover:scale-105 duration-300 transition text-white',
        accent: 'bg-transparent hover:scale-105 duration-300 transition text-[var(--accent)]',
      },
      size: {
        default: 'px-5 py-2 min-h-[44px]',
        sm: 'px-4 py-1.5 text-xs gap-1.5 min-h-[44px]',
        lg: 'px-7 py-3 rounded-md min-h-[44px]',
        xl: 'px-8 py-3.5 rounded-md min-h-[44px]',
        xxl: 'px-12 py-4 rounded-lg min-h-[44px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'xxl',
    },
  },
)

function LiquidGlassFilter() {
  return (
    <svg className="hidden">
      <defs>
        <filter
          id="container-glass"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves="1"
            seed="1"
            result="turbulence"
          />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale="70"
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  )
}

export function LiquidButton({ className, variant, size, asChild = false, children, onClick, disabled, ...props }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      className={cn(
        'relative',
        liquidbuttonVariants({ variant, size, className }),
      )}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      <div className="absolute top-0 left-0 z-0 h-full w-full rounded-lg
          shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(255,255,255,0.15),inset_-3px_-3px_0.5px_-3px_rgba(255,255,255,0.1),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.2),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.2),inset_0_0_6px_6px_rgba(255,255,255,0.04),inset_0_0_2px_2px_rgba(255,255,255,0.02),0_0_12px_rgba(0,207,255,0.08)]
      transition-all" />
      <div
        className="absolute top-0 left-0 isolate -z-10 h-full w-full overflow-hidden rounded-lg"
        style={{ backdropFilter: 'url("#container-glass")' }}
      />
      <div className="pointer-events-none z-10">
        {children}
      </div>
      <LiquidGlassFilter />
    </Comp>
  )
}

export { liquidbuttonVariants }
