// Shared plan metadata used across Subscribe, profiles, navbar, admin.
export const PLAN_LABEL = {
  free:    'Gratis',
  amante:  'Amante de la música',
  pro:     'Pro',
  premium: 'Premium',
}

// Badge class + short text (listener/artist paid plans get a badge; free doesn't)
export const PLAN_BADGE = {
  amante:  { cls: 'badge-plan-amante',  text: 'AMANTE' },
  pro:     { cls: 'badge-plan-pro',     text: 'PRO' },
  premium: { cls: 'badge-plan-premium', text: 'PREMIUM' },
}

export const PLANS_ORDER = ['free', 'amante', 'pro', 'premium']
