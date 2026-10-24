import { useRef, useState, useCallback, type ReactNode } from 'react'
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'

/** macOS Dock — magnifying command dock. Cursor distance drives per-icon size
 *  (raised-cosine springs), a hairline tooltip chip sits above the
 *  hovered tool, icons bounce on click and cast a soft floor reflection,
 *  running apps get a dot, and a ⌘K slot at the end opens a small command
 *  menu. Icons and tray are crystal-transparent so background animations
 *  shine through. */

const EASE = [0.22, 1, 0.36, 1] as const
const SANS = 'inherit'
const FAR = 99999
const RADIUS = 92 // px of cursor influence on either side of an icon
const PLATE = '84%'
const ICON_SHADOW = 'drop-shadow(0 3px 6px rgba(8, 47, 73, 0.28))'

export type DockApp = {
  id: string
  label: string
  /** any node — an <img>, an svg, or the built-in transparent glass tiles */
  icon: ReactNode
}

/** Transparent glass app tile — lets the live background animation show through the icon */
export function Tile({ c, children }: { c: [number, number, number]; children: ReactNode }) {
  const up = c.map((v) => Math.min(255, v + 45))
  return (
    <div
      className="relative grid place-items-center overflow-hidden rounded-[24%] transform-gpu"
      style={{
        width: PLATE,
        height: PLATE,
        background: `linear-gradient(145deg, rgba(255, 255, 255, 0.20) 0%, rgba(${c.join(',')}, 0.14) 52%, rgba(${up.join(',')}, 0.06) 100%)`,
        boxShadow:
          'inset 0 1px 0.5px rgba(255, 255, 255, 0.55), inset 0 -1px 1px rgba(14, 116, 144, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.24)',
      }}
    >
      {children}
      <div
        className="pointer-events-none absolute inset-0 rounded-[24%]"
        style={{
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0.02) 48%, transparent 100%)',
        }}
      />
    </div>
  )
}

const g = {
  width: '54%',
  height: '54%',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const DEFAULT_APPS: DockApp[] = [
  {
    id: 'finder',
    label: 'Finder',
    icon: (
      <Tile c={[52, 130, 246]}>
        <svg {...g}>
          <path d="M10 4c-2 4-2 12 0 16M14 4c2 4 2 12 0 16" />
          <path d="M7.5 15.5c2.5 2 6.5 2 9 0" />
          <circle cx="8" cy="10" r="0.6" fill="currentColor" />
          <circle cx="16" cy="10" r="0.6" fill="currentColor" />
        </svg>
      </Tile>
    ),
  },
  {
    id: 'code',
    label: 'Editor',
    icon: (
      <Tile c={[36, 41, 56]}>
        <svg {...g}>
          <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" />
        </svg>
      </Tile>
    ),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: (
      <Tile c={[24, 24, 28]}>
        <svg {...g}>
          <path d="m6 8 5 4-5 4M13 16h5" />
        </svg>
      </Tile>
    ),
  },
  {
    id: 'browser',
    label: 'Arc',
    icon: (
      <Tile c={[244, 93, 128]}>
        <svg {...g}>
          <circle cx="12" cy="12" r="8" />
          <polygon points="14.8,9.2 13,14.8 9.2,14.8 11,9.2" fill="currentColor" stroke="none" />
        </svg>
      </Tile>
    ),
  },
  {
    id: 'design',
    label: 'Canvas',
    icon: (
      <Tile c={[139, 92, 246]}>
        <svg {...g}>
          <path d="M12 3v18M12 3a4.5 4.5 0 1 0 0 9M12 3a4.5 4.5 0 1 1 0 9M12 12a4.5 4.5 0 1 0 0 9" />
        </svg>
      </Tile>
    ),
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: (
      <Tile c={[245, 168, 36]}>
        <svg {...g}>
          <path d="M6 7h12M6 12h12M6 17h7" />
        </svg>
      </Tile>
    ),
  },
  {
    id: 'music',
    label: 'Synth',
    icon: (
      <Tile c={[239, 68, 84]}>
        <svg {...g}>
          <path d="M9 17V6l10-2v11" />
          <circle cx="7" cy="17" r="2.3" />
          <circle cx="17" cy="15" r="2.3" />
        </svg>
      </Tile>
    ),
  },
  {
    id: 'mail',
    label: 'Mail',
    icon: (
      <Tile c={[20, 184, 166]}>
        <svg {...g}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
          <path d="m4.5 7 7.5 5.5L19.5 7" />
        </svg>
      </Tile>
    ),
  },
]

export type DockCommand = { label: string; kbd: string }

const DEFAULT_COMMANDS: DockCommand[] = [
  { label: 'New Workspace', kbd: '⌘N' },
  { label: 'Switch Theme', kbd: '⌘T' },
  { label: 'Quick Open…', kbd: '⌘P' },
]

const SPRING_CONFIG = { stiffness: 220, damping: 23, mass: 0.38 }

function DockSlot({
  app,
  index,
  restSize,
  peakSize,
  gap,
  padX,
  mouseX,
  running,
  reduced,
  onPick,
}: {
  app: DockApp
  index: number
  restSize: number
  peakSize: number
  gap: number
  padX: number
  /** Cursor X relative to the left edge of the dock shelf */
  mouseX: MotionValue<number>
  running: boolean
  reduced: boolean | null
  onPick: () => void
}) {
  const [hover, setHover] = useState(false)
  const bounce = useAnimationControls()

  /** Compute center X mathematically from index — zero DOM reflows on mousemove */
  const slotCenterX = padX + index * (restSize + gap) + restSize / 2

  /** Raised-cosine bell curve driven by relative cursor X */
  const raw = useTransform(mouseX, (relX) => {
    if (reduced || relX === FAR) return restSize
    const d = relX - slotCenterX
    if (Math.abs(d) >= RADIUS) return restSize
    const t = (1 + Math.cos((d / RADIUS) * Math.PI)) / 2
    return restSize + (peakSize - restSize) * t
  })

  const size = useSpring(raw, SPRING_CONFIG)
  const lift = useTransform(size, [restSize, peakSize], [0, -5])

  const click = () => {
    onPick()
    if (!reduced) {
      bounce.start({
        y: [0, -10, 0, -4, 0],
        transition: {
          duration: 0.46,
          times: [0, 0.28, 0.58, 0.8, 1],
          ease: ['easeOut', 'easeIn', 'easeOut', 'easeIn'],
        },
      })
    }
  }

  return (
    <motion.button
      type="button"
      aria-label={app.label}
      onClick={click}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{ width: size, height: size }}
      className="relative flex shrink-0 select-none flex-col items-center justify-end text-[color:var(--foreground)] focus:outline-none transform-gpu will-change-[width,height,transform]"
    >
      <AnimatePresence>
        {hover && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.96 }}
            transition={{ duration: 0.14, ease: EASE }}
            style={{
              y: lift,
              background: 'color-mix(in oklch, var(--card) 58%, transparent)',
              boxShadow:
                '0 8px 20px -4px var(--card-shadow), 0 0 0 1px color-mix(in oklch, var(--foreground) 14%, transparent), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
            className="pointer-events-none absolute -top-8 z-30 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[-0.01em] text-[color:var(--foreground)] backdrop-blur-md"
          >
            {app.label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* main glyph */}
      <motion.div
        animate={bounce}
        style={{ y: lift, filter: ICON_SHADOW }}
        whileTap={{ scale: 0.91 }}
        className="relative grid h-full w-full place-items-center transform-gpu [&>img]:h-full [&>img]:w-full [&>img]:object-contain [&>svg]:h-full [&>svg]:w-full"
      >
        {app.icon}
      </motion.div>

      {/* floor reflection — inverted copy fading into the tray lip */}
      <motion.div
        aria-hidden
        style={{
          y: lift,
          transform: 'scaleY(-1)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.34) 0%, transparent 58%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.34) 0%, transparent 58%)',
        }}
        className="pointer-events-none absolute top-full mt-[2px] grid h-full w-full place-items-center opacity-40 transform-gpu [&>img]:h-full [&>img]:w-full [&>img]:object-contain [&>svg]:h-full [&>svg]:w-full"
      >
        {app.icon}
      </motion.div>

      {/* running indicator dot */}
      <span className="pointer-events-none absolute -bottom-1 flex h-1 w-1 items-center justify-center">
        <AnimatePresence>
          {running && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              style={{
                background: 'color-mix(in oklch, var(--foreground) 85%, transparent)',
                boxShadow: '0 0 6px color-mix(in oklch, var(--foreground) 55%, transparent)',
              }}
              className="h-1 w-1 rounded-full"
            />
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  )
}

export type MacOsDockProps = {
  /** the dock's items — defaults to the 8 built-in gradient tiles */
  apps?: DockApp[]
  /** ids of apps that start with a running indicator dot */
  initialRunning?: string[]
  /** controlled active/running ids (if provided, overrides internal toggle state) */
  runningIds?: string[]
  /** fired when an icon is clicked; receives the app id and whether it's now running */
  onAppClick?: (id: string, running: boolean) => void
  /** rows in the ⌘K pop-up; pass `false` to hide the launcher slot entirely */
  commands?: DockCommand[] | false
  /** fired when a row in the ⌘K menu is picked */
  onCommand?: (cmd: DockCommand) => void
  className?: string
}

export function MacOsDock({
  apps = DEFAULT_APPS,
  initialRunning = ['finder', 'code', 'browser'],
  runningIds,
  onAppClick,
  commands = DEFAULT_COMMANDS,
  onCommand,
  className = '',
}: MacOsDockProps) {
  const reduced = useReducedMotion()
  const shelfRef = useRef<HTMLDivElement>(null)
  const shelfLeftRef = useRef<number | null>(null)
  const mouseX = useMotionValue(FAR)
  const [running, setRunning] = useState<Set<string>>(() => new Set(initialRunning))
  const [launcher, setLauncher] = useState(false)

  /** Proportion icon & shelf dimensions so the dock sits centered with generous mobile margins */
  const isDense = apps.length > 5
  const restSize = isDense ? 32 : 36
  const peakSize = isDense ? 42 : 46
  const gap = isDense ? 4 : 6
  const padX = isDense ? 10 : 12
  const shelfHeight = isDense ? 52 : 56

  const activeSet = runningIds ? new Set(runningIds) : running

  const toggle = (id: string) => {
    setRunning((prev) => {
      const next = new Set(prev)
      const nowRunning = !next.has(id)
      if (nowRunning) next.add(id)
      else next.delete(id)
      onAppClick?.(id, nowRunning)
      return next
    })
  }

  const updatePointerX = useCallback(
    (clientX: number) => {
      if (shelfLeftRef.current === null && shelfRef.current) {
        shelfLeftRef.current = shelfRef.current.getBoundingClientRect().left
      }
      if (shelfLeftRef.current !== null) {
        mouseX.set(clientX - shelfLeftRef.current)
      }
    },
    [mouseX]
  )

  return (
    <div
      style={{ fontFamily: SANS }}
      className={`relative inline-flex flex-col items-center select-none ${className}`}
    >
      {/* mini command menu popped from the trailing ⌘K tile */}
      <AnimatePresence>
        {commands !== false && launcher && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: EASE }}
            style={{
              background: 'color-mix(in oklch, var(--card) 55%, transparent)',
              boxShadow:
                '0 20px 44px -12px var(--card-shadow), 0 0 0 1px color-mix(in oklch, var(--foreground) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
            className="mb-2.5 w-56 overflow-hidden rounded-xl p-1.5 text-[12px] backdrop-blur-lg"
          >
            <div
              style={{ color: 'color-mix(in oklch, var(--foreground) 55%, transparent)' }}
              className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
            >
              Quick Launch
            </div>
            {commands.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  onCommand?.(it)
                  setLauncher(false)
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[color:var(--foreground)] transition-colors hover:bg-[color:color-mix(in_oklch,var(--foreground)_10%,transparent)]"
              >
                <span>{it.label}</span>
                <kbd
                  style={{
                    background: 'color-mix(in oklch, var(--foreground) 8%, transparent)',
                    color: 'color-mix(in oklch, var(--foreground) 65%, transparent)',
                  }}
                  className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {it.kbd}
                </kbd>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* the transparent glass shelf — compact ratio centered on mobile */}
      <div
        ref={shelfRef}
        role="toolbar"
        aria-label="Application dock"
        onMouseEnter={() => {
          if (shelfRef.current) {
            shelfLeftRef.current = shelfRef.current.getBoundingClientRect().left
          }
        }}
        onMouseMove={(e) => updatePointerX(e.clientX)}
        onMouseLeave={() => {
          shelfLeftRef.current = null
          mouseX.set(FAR)
        }}
        onTouchStart={(e) => {
          if (shelfRef.current) {
            shelfLeftRef.current = shelfRef.current.getBoundingClientRect().left
          }
          if (e.touches[0]) updatePointerX(e.touches[0].clientX)
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) updatePointerX(e.touches[0].clientX)
        }}
        onTouchEnd={() => {
          shelfLeftRef.current = null
          mouseX.set(FAR)
        }}
        style={{
          height: shelfHeight,
          paddingLeft: padX,
          paddingRight: padX,
          gap,
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.10) 100%)',
          boxShadow: [
            '0 18px 36px -10px var(--card-shadow)',
            '0 4px 10px -2px var(--card-shadow)',
            '0 0 0 1px rgba(255, 255, 255, 0.32)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.48)',
            'inset 0 -1px 0 rgba(14, 116, 144, 0.14)',
          ].join(','),
        }}
        className="relative flex items-end rounded-[20px] pb-2 pt-1.5 backdrop-blur-md transform-gpu"
      >
        {/* top specular highlight along the glass lip */}
        <div
          aria-hidden
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55) 30%, rgba(255, 255, 255, 0.55) 70%, transparent)',
          }}
          className="pointer-events-none absolute inset-x-5 top-0 h-px"
        />

        {apps.map((app, index) => (
          <DockSlot
            key={app.id}
            app={app}
            index={index}
            restSize={restSize}
            peakSize={peakSize}
            gap={gap}
            padX={padX}
            mouseX={mouseX}
            running={activeSet.has(app.id)}
            reduced={reduced}
            onPick={() => toggle(app.id)}
          />
        ))}

        {commands !== false && (
          <>
            {/* hairline divider before the utility side of the dock */}
            <div
              aria-hidden
              style={{ background: 'color-mix(in oklch, var(--foreground) 18%, transparent)' }}
              className="mx-0.5 mb-1 h-7 w-px shrink-0 self-end"
            />

            {/* ⌘K launcher tile — transparent glass */}
            <button
              type="button"
              aria-label="Quick Launch"
              aria-expanded={launcher}
              onClick={() => setLauncher((v) => !v)}
              style={{ width: restSize, height: restSize }}
              className="relative grid shrink-0 place-items-center focus:outline-none"
            >
              <motion.span
                whileHover={{ scale: 1.08, y: -2 }}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.16, ease: EASE }}
                style={{
                  width: PLATE,
                  height: PLATE,
                  background: launcher
                    ? 'linear-gradient(145deg, rgba(255, 255, 255, 0.30) 0%, rgba(14, 116, 144, 0.22) 100%)'
                    : 'linear-gradient(145deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.06) 100%)',
                  boxShadow:
                    'inset 0 1px 0.5px rgba(255, 255, 255, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.24)',
                  color: 'var(--foreground)',
                  filter: ICON_SHADOW,
                }}
                className="grid place-items-center rounded-[24%] font-mono text-[10px] font-bold tracking-tight transform-gpu"
              >
                ⌘K
              </motion.span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default MacOsDock

/* ── demo wrapper — the component itself is just <MacOsDock /> ── */
export function Demo() {
  return (
    <div className="grid min-h-[220px] w-full place-items-center p-6">
      <MacOsDock />
    </div>
  )
}
