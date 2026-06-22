import type { DriverTiming, BestSectors } from '../hooks/useTimingData'
import type { Lap } from '../types/openf1'
import DriverRow from './DriverRow'
import ColumnToggle, { type ColumnConfig } from './ColumnToggle'

interface Props {
  drivers:            DriverTiming[]
  overallBestLap:     Lap | null
  overallBestSectors: BestSectors
  columns:            ColumnConfig
  onColumnsChange:    (c: ColumnConfig) => void
  onDriverSelect?:    (num: number) => void
}

export default function TimingTower({
  drivers, overallBestLap, overallBestSectors, columns, onColumnsChange, onDriverSelect,
}: Props) {
  return (
    <div className="timing-tower">
      {/* Toolbar */}
      <div className="tower-toolbar">
        <div className="tower-toolbar__left">
          <span className="tower-title">TOWER</span>
          <span className="tower-count">{drivers.length} pilotos</span>
        </div>
        <ColumnToggle config={columns} onChange={onColumnsChange} />
      </div>

      {/* Header */}
      <div className="tower-header-row">
        <div className="th-cell th-pit" />
        <div className="th-cell th-pos-driver">PILOTO</div>
        {columns.interval     && <div className="th-cell th-interval">INTERVAL</div>}
        <div className="th-cell th-tyre">TYRE ↕</div>
        {columns.bestLap      && <div className="th-cell th-lap">BEST LAP ↕</div>}
        {columns.leader       && <div className="th-cell th-lap">LEADER</div>}
        <div className="th-cell th-lap">LAST LAP ↕</div>
        {columns.miniSectors  && <div className="th-cell th-mini">MINI SECTORS</div>}
        {columns.lastSectors  && <div className="th-cell th-secs">LAST SECTORS ↕</div>}
        {columns.bestSectors  && <div className="th-cell th-secs">BEST SECTORS ↕</div>}
        {columns.potential    && <div className="th-cell th-lap">POTENCIAL</div>}
        {columns.stintHistory && <div className="th-cell th-stints-h">STINTS</div>}
        {columns.speedI1      && <div className="th-cell th-spd">I1</div>}
        {columns.speedI2      && <div className="th-cell th-spd">I2</div>}
        {columns.speedST      && <div className="th-cell th-spd">ST</div>}
        {(columns.pitCount || columns.lapCount) && <div className="th-cell th-extra-h" />}
      </div>

      {/* Rows — DNF drivers always at the bottom */}
      <div className="tower-body">
        {[...drivers]
          .sort((a, b) => {
            if (a.isDNF && !b.isDNF) return 1
            if (!a.isDNF && b.isDNF) return -1
            return a.position - b.position
          })
          .map((t, i) => (
            <DriverRow
              key={t.driver.driver_number}
              timing={t}
              overallBest={overallBestLap}
              overallBestSectors={overallBestSectors}
              isEven={i % 2 === 0}
              columns={columns}
              onSelect={onDriverSelect}
            />
          ))}
      </div>

      {drivers.length === 0 && (
        <div className="tower-empty">No driver data available</div>
      )}
    </div>
  )
}
