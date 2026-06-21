// OpenF1 API types — https://openf1.org

export interface Driver {
  driver_number: number
  broadcast_name: string
  full_name: string
  name_acronym: string
  team_name: string
  team_colour: string
  headshot_url: string
  country_code: string
  session_key: number
  meeting_key: number
}

export interface Position {
  driver_number: number
  date: string
  position: number
  session_key: number
  meeting_key: number
}

export interface Lap {
  driver_number: number
  lap_number: number
  lap_duration: number | null
  date_start: string | null           // ISO – when the lap began
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
  segments_sector_1: (number | null)[] | null   // mini-sector flags (2048=yellow, 2049=green/purple)
  segments_sector_2: (number | null)[] | null
  segments_sector_3: (number | null)[] | null
  i1_speed: number | null
  i2_speed: number | null
  st_speed: number | null
  is_pit_out_lap: boolean
  session_key: number
  meeting_key: number
}

export interface Meeting {
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  location: string
  country_key: number
  country_code: string
  country_name: string
  circuit_key: number
  circuit_short_name: string
  date_start: string
  year: number
}

export interface Stint {
  driver_number: number
  stint_number: number
  lap_start: number
  lap_end: number | null
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET'
  tyre_age_at_start: number
  session_key: number
  meeting_key: number
}

export interface CarData {
  driver_number: number
  date: string
  speed: number
  rpm: number
  gear: number
  throttle: number
  brake: number
  drs: number
  session_key: number
  meeting_key: number
}

export interface RaceControlMessage {
  date: string
  lap_number: number | null
  category: string
  flag: string | null
  scope: string | null
  message: string
  session_key: number
  meeting_key: number
}

export interface Session {
  session_key: number
  session_name: string
  session_type: string
  status: string
  date_start: string
  date_end: string
  gmt_offset: string
  location: string
  country_name: string
  circuit_short_name: string
  meeting_key: number
  year: number
}

export interface Weather {
  date: string
  air_temperature: number
  track_temperature: number
  humidity: number
  pressure: number
  rainfall: number
  wind_speed: number
  wind_direction: number
  session_key: number
  meeting_key: number
}
