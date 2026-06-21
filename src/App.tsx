import { useState } from 'react'
import './App.css'
import { useTimingData } from './hooks/useTimingData'
import { useReplay } from './hooks/useReplay'
import { useTrackMap } from './hooks/useTrackMap'
import SessionHeader from './components/SessionHeader'
import TimingTower from './components/TimingTower'
import RaceControl from './components/RaceControl'
import TrackMap from './components/TrackMap'
import SessionPicker from './components/SessionPicker'
import ReplayControls from './components/ReplayControls'
import TelemetryPanel from './components/TelemetryPanel'
import DriverDetailPanel from './components/DriverDetailPanel'
import { DEFAULT_COLUMNS, type ColumnConfig } from './components/ColumnToggle'
import { computeTowerWidth } from './utils/towerWidth'
import type { Session } from './types/openf1'

type AppMode = 'live' | 'replay'

export default function App() {
  const [mode, setMode]               = useState<AppMode>('live')
  const [pickerOpen, setPicker]       = useState(false)
  // Two separate selections:
  // telemDriver → shows the compact telemetry bar (single click on row)
  // detailDriver → shows the full driver detail panel (click on telemetry bar)
  const [telemDriver,  setTelemDriver]  = useState<number | null>(null)
  const [detailDriver, setDetailDriver] = useState<number | null>(null)

  // Column state lives here so App can use it for grid sizing
  const [columns, setColumns]   = useState<ColumnConfig>(DEFAULT_COLUMNS)

  const live   = useTimingData()
  const replay = useReplay()

  const isLive  = mode === 'live'
  const display = isLive ? live : (replay.timing ?? live)

  // In replay mode, pass virtual time so cars move on the circuit in sync
  const replayVirtualTime = mode === 'replay' ? (replay.playback?.virtualTime ?? null) : null

  const { orderedPath, carPositions, hasData, loadingCircuit, drsZones } = useTrackMap(
    display.session?.session_key ?? null,
    display.session?.date_end    ?? null,
    display.session?.date_start  ?? null,
    display.overallBestLap,
    replayVirtualTime,
  )

  const overallBest        = display.overallBestLap
  const overallBestSectors = display.overallBestSectors
  const trackStatus        = display.trackStatus
  const lastUpdate         = display.lastUpdate
  const loading            = isLive ? live.loading : replay.loadState.status === 'loading'
  const error              = isLive ? live.error   : (replay.loadState.status === 'error' ? replay.loadState.error : null)
  const drivers            = display.drivers

  const currentLap = drivers.length > 0
    ? Math.max(...drivers.map(d => d.lapCount).filter(n => n > 0))
    : undefined

  // Total laps: known for replay, inferred for live (same as current when finished)
  const totalLaps = mode === 'replay' ? replay.totalLaps || undefined : undefined

  // Dynamic tower width → map gets the remaining space
  const towerWidth = computeTowerWidth(columns)

  const allLaps = mode === 'replay' ? replay.rawLaps : live.rawLaps

  const handleSelect = async (s: Session) => {
    setPicker(false)
    setMode('replay')
    setTelemDriver(null); setDetailDriver(null)
    await replay.loadSession(s)
  }
  const handleExit = () => { replay.reset(); setMode('live'); setTelemDriver(null); setDetailDriver(null) }

  return (
    <div className="app">
      <SessionHeader
        session={display.session}
        weather={display.weather}
        _lastUpdate={lastUpdate}
        onRefresh={isLive ? live.refresh : () => {}}
        appMode={mode}
        sessionMode={isLive ? live.sessionMode : 'results'}
        trackStatus={trackStatus}
        currentLap={currentLap && currentLap > 0 ? currentLap : undefined}
        totalLaps={totalLaps}
        onOpenPicker={() => setPicker(true)}
        onExitReplay={handleExit}
      />

      {mode === 'replay' && replay.playback && (
        <ReplayControls
          playback={replay.playback}
          onPlay={replay.play}
          onPause={replay.pause}
          onSeek={replay.seek}
          onSpeed={replay.setSpeed}
          onExit={handleExit}
        />
      )}

      {mode === 'replay' && replay.loadState.status === 'loading' && (
        <div className="replay-loading-bar">
          <div className="rlb-track">
            <div className="rlb-fill" style={{ width: `${replay.loadState.progress}%` }} />
          </div>
          <span className="rlb-step">{replay.loadState.step}</span>
        </div>
      )}

      {error && (
        <div className="error-bar">
          <span>⚠ {error}</span>
          {isLive && <button onClick={live.refresh}>Reintentar</button>}
        </div>
      )}

      {loading && drivers.length === 0 ? (
        <div className="loading-screen">
          <div className="loading-spinner" />
          <span>{isLive ? 'Buscando última carrera...' : 'Cargando sesión...'}</span>
        </div>
      ) : (
        <main className="app-main">
          {/* Tower + Map — grid with dynamic tower width */}
          <div
            className="main-grid"
            style={{ gridTemplateColumns: `${towerWidth}px 1fr` }}
          >
            <div className="main-grid__tower">
              <TimingTower
                drivers={drivers}
                overallBestLap={overallBest}
                overallBestSectors={overallBestSectors}
                columns={columns}
                onColumnsChange={setColumns}
                onDriverSelect={(num: number) => {
                  setTelemDriver(prev => prev === num ? null : num)
                  setDetailDriver(null)  // close detail panel when switching driver
                }}
              />
            </div>

            <aside className="main-grid__sidebar">
              <TrackMap
                orderedPath={orderedPath}
                carPositions={carPositions}
                drivers={drivers}
                overallBestLap={overallBest}
                hasData={hasData}
                loadingCircuit={loadingCircuit}
                isLive={isLive}
                sessionDateEnd={display.session?.date_end ?? null}
                drsZones={drsZones}
              />
            </aside>
          </div>

          {/* Telemetry bar — single click on row opens this */}
          {telemDriver !== null && display.session && (
            <TelemetryPanel
              driverNum={telemDriver}
              sessionKey={display.session.session_key}
              sessionYear={display.session.year}
              isLive={isLive}
              virtualTime={replayVirtualTime}
              drivers={drivers}
              onClose={() => { setTelemDriver(null); setDetailDriver(null) }}
              onOpenDetail={() => setDetailDriver(telemDriver)}
            />
          )}

          {/* Race Control — full-width strip at the bottom */}
          {display.raceControl.length > 0 && (
            <div className="race-control-bottom">
              <RaceControl messages={display.raceControl} />
            </div>
          )}
        </main>
      )}

      {pickerOpen && (
        <SessionPicker onSelect={handleSelect} onClose={() => setPicker(false)} />
      )}

      {/* Driver detail panel — opens via "Detalles" button in telemetry bar */}
      {detailDriver !== null && display.session && (
        <DriverDetailPanel
          driverNum={detailDriver}
          drivers={drivers}
          allLaps={allLaps}
          onClose={() => setDetailDriver(null)}
        />
      )}
    </div>
  )
}
