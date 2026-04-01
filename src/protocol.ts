import { TrumaStatus } from './types';

/**
 * BLE characteristic UUIDs (short form for noble compatibility)
 */
export const WRITE_CHAR_UUID = 'fff6';
export const NOTIFY_CHAR_UUID = 'fff7';

/**
 * Poll packet sent to request status updates
 */
export const POLL_PACKET = Buffer.from([
  0xAA, 0xC1, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x12, 0xA8, 0x16
]);

/**
 * Convert signed byte to temperature in Celsius
 */
function byteToTemp(byte: number): number {
  return byte < 128 ? byte : byte - 256;
}

/**
 * Convert temperature in Celsius to signed byte
 */
function tempToByte(tempC: number): number {
  if (tempC < -128 || tempC > 127) {
    throw new Error(`Temperature ${tempC}°C out of range (-128 to 127)`);
  }
  return tempC & 0xFF;
}

/**
 * Build a set-temperature command packet
 */
export function buildSetTempPacket(tempC: number): Buffer {
  const t = tempToByte(tempC);
  const checksum = (t - 0xE8) & 0xFF;

  return Buffer.from([
    0xAA, 0xC1, 0xF1, 0x00, 0x00, 0x00, 0x00, t,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x12, 0xA8, checksum
  ]);
}

/**
 * Parse a status notification packet
 *
 * Packet layout (16 bytes):
 * [0-3]   Header: AA C1 F2 A0
 * [4-5]   Unknown (constant: 09 01)
 * [6]     Actual temp (signed int8, °C)
 * [7]     Set temp (signed int8, °C)
 * [8-9]   Fixed: 00 00
 * [10-11] Voltage (uint16 BE ÷ 100 = volts)
 * [12-14] Fixed: 00 00 00
 * [15]    Checksum
 */
export function parseNotification(data: Buffer): TrumaStatus | null {
  if (data.length !== 16) {
    return null;
  }

  // Check header
  if (data[0] !== 0xAA || data[1] !== 0xC1 || data[2] !== 0xF2) {
    return null;
  }

  // Parse fields
  const voltageRaw = (data[10] << 8) | data[11]; // uint16 big-endian
  const voltage = voltageRaw / 100.0;
  const actualTemp = byteToTemp(data[6]);
  const setTemp = byteToTemp(data[7]);
  const raw = data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';

  return {
    voltage,
    actualTemp,
    setTemp,
    raw
  };
}
