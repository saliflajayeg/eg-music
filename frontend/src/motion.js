import { useEffect, useState } from 'react'

// Motion tokens — the JS mirror of the --ease-* variables in index.css, for
// animations driven from code (element.animate). Keep the two in sync.
export const EASE = {
  out:    'cubic-bezier(0.23, 1, 0.32, 1)',     // enter / exit
  inOut:  'cubic-bezier(0.77, 0, 0.175, 1)',    // on-screen movement
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',     // sheets and the full player
}

export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// Keeps an overlay mounted long enough to play its exit transition.
// `closing` is true while it animates out — put it on the element as
// data-closing and let the CSS in index.css do the rest.
export function usePresence(open, exitMs) {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  useEffect(() => {
    if (open) return
    const t = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : exitMs)
    return () => clearTimeout(t)
  }, [open, exitMs])
  return { mounted: mounted || open, closing: mounted && !open }
}
