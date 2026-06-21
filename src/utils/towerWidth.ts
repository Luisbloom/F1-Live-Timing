import type { ColumnConfig } from '../components/ColumnToggle'

// Mirror the pixel widths defined in App.css th-* and col-* rules
const ALWAYS_ON =
  3    +  // border-left
  32   +  // col-pit
  118  +  // col-pos-driver
  64   +  // col-tyre
  82      // col-last-lap

const COL_W: Partial<Record<keyof ColumnConfig, number>> = {
  interval:     80,
  leader:       82,
  bestLap:      82,
  miniSectors:  104,
  lastSectors:  166,
  bestSectors:  166,
  potential:    82,
  stintHistory: 120,
  speedI1:      66,
  speedI2:      66,
  speedST:      66,
}

export function computeTowerWidth(columns: ColumnConfig): number {
  let w = ALWAYS_ON

  for (const [key, px] of Object.entries(COL_W)) {
    if (columns[key as keyof ColumnConfig]) w += px as number
  }

  // pitCount / lapCount share one extra cell
  if (columns.pitCount || columns.lapCount) w += 52

  // scrollbar + small padding buffer
  return w + 18
}
