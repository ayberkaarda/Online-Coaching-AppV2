// Grafik renkleri — tema duyarlı. Recharts renkleri SVG sunum özniteliği ve inline stil
// olarak yazar; ikisi de CSS değişkenini çözer, bu yüzden değerler `tokens.ts`ten üretilen
// `--color-*` değişkenlerine bağlanır ve tema değişince grafik de döner.
//
// Seri sırası (marka kararı): Kor → Su → textSecondary (hedef çizgisi / üçüncü seri).

const cssVar = (name: string): string => `rgb(var(${name}))`

export const chartColors = {
  series1: cssVar('--color-accent'),
  series2: cssVar('--color-info'),
  series3: cssVar('--color-fg-muted'),
  axis: cssVar('--color-fg-muted'),
  grid: cssVar('--color-border'),
} as const

export const chartTooltipStyle = {
  backgroundColor: cssVar('--color-surface-raised'),
  border: `1px solid ${cssVar('--color-border')}`,
  borderRadius: '10px',
  color: cssVar('--color-fg'),
} as const
