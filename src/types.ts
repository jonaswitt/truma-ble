/**
 * Truma cooler status data
 */
export interface TrumaStatus {
  /** Battery voltage in volts (e.g., 13.12) */
  voltage: number;
  /** Current temperature in Celsius (e.g., -13) */
  actualTemp: number;
  /** Target temperature in Celsius (e.g., -18) */
  setTemp: number;
  /** Raw packet data as hex string */
  raw: string;
}

/**
 * Options for connecting to a Truma device
 */
export interface TrumaConnectOptions {
  /** Device address (UUID on macOS, MAC address on Linux) */
  address: string;
  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Options for reading status
 */
export interface TrumaReadOptions {
  /** Number of times to poll before returning (default: 1) */
  pollCount?: number;
  /** Delay between polls in milliseconds (default: 100) */
  pollDelay?: number;
}
