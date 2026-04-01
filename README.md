# @jonaswitt/truma-ble

TypeScript/JavaScript BLE client for Truma cooler monitoring and control.

Designed for **one-shot data acquisition** - perfect for periodic monitoring systems. Connects, reads data, and immediately disconnects to allow vendor app usage.

## Features

- 🚀 **One-shot readings** - Connect, read, disconnect (vendor app friendly)
- 📊 **JSON output** - Perfect for monitoring systems
- 🔍 **Device scanning** - Discover nearby Truma devices
- 🌡️ **Temperature control** - Set target temperature
- 💻 **Cross-platform** - Works on Linux and macOS
- 📦 **TypeScript types** - Full type safety included
- ⚡ **CLI included** - Command-line tool for quick reads

## Installation

```bash
npm install @jonaswitt/truma-ble
```

## CLI Usage

The package includes a command-line tool:

### Scan for devices

```bash
npx truma-ble scan
```

Output:
```json
[
  {
    "address": "EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18",
    "name": "Truma Cooler"
  }
]
```

### Read current status

```bash
npx truma-ble read EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18
```

Output:
```json
{
  "voltage": 13.12,
  "actualTemp": -13,
  "setTemp": -18,
  "raw": "AA C1 F2 A0 09 01 F3 EE 00 00 05 20 00 00 00 0F"
}
```

### Set temperature

```bash
npx truma-ble set EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18 -18
```

Output:
```json
{
  "voltage": 13.05,
  "actualTemp": -13,
  "setTemp": -18,
  "raw": "AA C1 F2 A0 09 01 F3 EE 00 00 05 19 00 00 00 0E"
}
```

## Library Usage

### TypeScript

```typescript
import { TrumaClient, TrumaStatus } from '@jonaswitt/truma-ble';

// One-shot reading (recommended for periodic monitoring)
async function readTrumaStatus() {
  const client = new TrumaClient();

  const status: TrumaStatus = await client.readStatus({
    address: 'EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18',
    timeout: 10000
  });

  console.log(`Voltage: ${status.voltage}V`);
  console.log(`Current temp: ${status.actualTemp}°C`);
  console.log(`Target temp: ${status.setTemp}°C`);
}

// Set temperature
async function setTemperature() {
  const client = new TrumaClient();

  const status = await client.setTemperature(
    { address: 'EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18' },
    -18
  );

  console.log(`Temperature set to ${status.setTemp}°C`);
}

// Scan for devices
async function findDevices() {
  const devices = await TrumaClient.scan(5000);
  devices.forEach(d => {
    console.log(`Found: ${d.name} at ${d.address}`);
  });
}
```

### JavaScript

```javascript
const { TrumaClient } = require('@jonaswitt/truma-ble');

async function readStatus() {
  const client = new TrumaClient();

  const status = await client.readStatus({
    address: 'EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18'
  });

  console.log(JSON.stringify(status, null, 2));
}

readStatus().catch(console.error);
```

## Monitoring System Integration

Perfect for periodic monitoring (e.g., every 60 seconds):

```typescript
import { TrumaClient } from '@jonaswitt/truma-ble';

async function monitorTruma() {
  const client = new TrumaClient();
  const address = 'EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18';

  setInterval(async () => {
    try {
      const status = await client.readStatus({ address });

      // Send to your monitoring system
      await sendToMonitoring({
        timestamp: new Date().toISOString(),
        device: 'truma_cooler',
        voltage: status.voltage,
        temperature: status.actualTemp,
        target_temperature: status.setTemp
      });
    } catch (error) {
      console.error('Failed to read Truma status:', error);
    }
  }, 60000); // Every 60 seconds
}
```

## API Reference

### `TrumaClient`

#### `readStatus(options)`

Connects, reads current status, and disconnects.

**Parameters:**
- `options.address: string` - Device address (UUID on macOS, MAC on Linux)
- `options.timeout?: number` - Connection timeout in ms (default: 10000)

**Returns:** `Promise<TrumaStatus>`

#### `setTemperature(options, tempC)`

Sets target temperature and waits for confirmation.

**Parameters:**
- `options.address: string` - Device address
- `options.timeout?: number` - Connection timeout in ms
- `tempC: number` - Target temperature in Celsius

**Returns:** `Promise<TrumaStatus>`

#### `TrumaClient.scan(timeoutMs)`

Static method to scan for nearby Truma devices.

**Parameters:**
- `timeoutMs?: number` - Scan duration in ms (default: 5000)

**Returns:** `Promise<Array<{ address: string, name: string | null }>>`

### `TrumaStatus`

```typescript
interface TrumaStatus {
  voltage: number;      // Battery voltage in volts (e.g., 13.12)
  actualTemp: number;   // Current temperature in °C (e.g., -13)
  setTemp: number;      // Target temperature in °C (e.g., -18)
  raw: string;          // Raw packet as hex string
}
```

## Protocol Details

The Truma cooler uses a reverse-engineered BLE protocol with 16-byte packets.

### BLE Characteristics

- **Write**: `0000fff6-0000-1000-8000-00805f9b34fb` (write-without-response)
- **Notify**: `0000fff7-0000-1000-8000-00805f9b34fb` (notifications)

### Status Notification (cooler → app)

16-byte packet format:

```
Byte   0  1  2  3   4  5   6   7      8  9  10 11   12 13 14  15
      [AA C1 F2 A0] [??][??][A] [S]   [00 00][V  V ] [00 00 00][C]
```

| Bytes | Field | Description |
|-------|-------|-------------|
| 0-3 | Header | `AA C1 F2 A0` (fixed) |
| 4-5 | Unknown | Constant in notifications (e.g., `09 01`) |
| 6 | **Actual temp** | Current temperature (signed int8, °C) |
| 7 | **Set temp** | Target temperature (signed int8, °C) |
| 8-9 | Fixed | `00 00` |
| 10-11 | **Voltage** | Battery voltage (uint16 BE ÷ 100 = volts) |
| 12-14 | Fixed | `00 00 00` |
| 15 | Checksum | Varies with packet content |

**Encoding Examples:**
- Voltage: `0x04FD` = 1277 → 12.77V
- Temperature: `0xF5` = -11°C, `0xEE` = -18°C

### Poll Packet (app → cooler)

Sent to request status updates:

```
AA C1 F0 00 00 00 00 00 00 00 00 00 00 12 A8 16
```

### Set Temperature Command (app → cooler)

```
AA C1 F1 00 00 00 00 [T] 00 01 00 00 00 12 A8 [T-0xE8]
```

- `T` = target temperature as signed int8 (e.g., -18°C = `0xEE`)
- Last byte is checksum: `(T - 0xE8) & 0xFF`

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode
npm run watch
```

## Requirements

- Node.js 16+
- Bluetooth 4.0+ adapter
- Linux or macOS

## License

MIT - For educational and personal use. Protocol reverse-engineered through observation.
