import { useEffect, useState } from 'react'

// Motion tokens — the JS mirror of the --ease-* variables in index.css, for
// animations driven from code (element.animate). Keep the two in sync.
export const EASE = {
  out:    'cubic-bezier(0.23, 1, 0.32, 1)',     // enter / exit
  inOut:  'cubic-bezier(0.77, 0, 0.175, 1)',    // on-screen movement
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',     // sheets and the full player
}

// Spring as a CSS/WAAPI easing: the closed-form step response of a damped
// spring (natural frequency w, damping ratio z), sampled into linear().
// z < 1 gives a small overshoot (0.8 ≈ 1.5 %), z = 1 none. Browsers without
// linear() get the drawer curve instead.
const _springCache = {}
export function spring(w, z = 1) {
  const key = `${w}/${z}`
  if (_springCache[key]) return _springCache[key]
  const x = t => {
    if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t)
    const wd = w * Math.sqrt(1 - z * z)
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t))
  }
  let dur = 0.05
  while (dur < 2 && Math.abs(1 - x(dur)) + Math.abs(1 - x(dur + 0.03)) > 0.002) dur += 0.01
  let easing = EASE.drawer
  try {
    if (CSS.supports('transition-timing-function', 'linear(0, 1)')) {
      const n = 48
      easing = `linear(${Array.from({ length: n + 1 }, (_, i) => (i === n ? 1 : x((i / n) * dur)).toFixed(4)).join(', ')})`
    }
  } catch {}
  return (_springCache[key] = { easing, duration: Math.round(dur * 1000) })
}

// Spring-driven number for things that move continuously and can be
// re-targeted mid-flight (keeps its velocity). Calls onUpdate each frame.
export function springTo(state, target, { w = 22, z = 0.85, onUpdate }) {
  cancelAnimationFrame(state.raf)
  if (prefersReducedMotion() || state.value == null) {
    state.value = target; state.v = 0; onUpdate(target); return
  }
  state.v = state.v || 0
  let last = performance.now()
  const tick = now => {
    const dt = Math.min(0.032, (now - last) / 1000); last = now
    for (let i = 0; i < 4; i++) {           // substeps keep stiff springs stable
      const h = dt / 4
      state.v += (-w * w * (state.value - target) - 2 * z * w * state.v) * h
      state.value += state.v * h
    }
    if (Math.abs(state.value - target) < 0.05 && Math.abs(state.v) < 0.5) { state.value = target; state.v = 0 }
    onUpdate(state.value)
    if (state.value !== target) state.raf = requestAnimationFrame(tick)
  }
  state.raf = requestAnimationFrame(tick)
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
