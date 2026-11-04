/** Modo demonstração do front-end (simulação de GPS, mapa desenhado, papéis alternáveis). */
export const isDemoMode = (): boolean =>
  (typeof window !== 'undefined' && window.location.search.includes('demo=true')) ||
  import.meta.env.VITE_DEMO_MODE === 'true';
