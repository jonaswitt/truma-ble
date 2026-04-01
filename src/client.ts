import noble from '@abandonware/noble';
import { TrumaStatus, TrumaConnectOptions, TrumaReadOptions } from './types';
import { WRITE_CHAR_UUID, NOTIFY_CHAR_UUID, POLL_PACKET, buildSetTempPacket, parseNotification } from './protocol';

/**
 * Truma BLE Client for one-shot data acquisition
 *
 * Designed for periodic monitoring - connects, reads data, disconnects.
 * This allows the vendor app to connect when needed.
 *
 * @example
 * ```typescript
 * const client = new TrumaClient();
 * const status = await client.readStatus({ address: 'EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18' });
 * console.log(`Voltage: ${status.voltage}V, Temp: ${status.actualTemp}°C`);
 * ```
 */
export class TrumaClient {
  private peripheral: noble.Peripheral | null = null;
  private writeCharacteristic: noble.Characteristic | null = null;
  private notifyCharacteristic: noble.Characteristic | null = null;

  /**
   * Read current status from the device (one-shot)
   *
   * Connects to the device, sends a poll request, waits for response,
   * then immediately disconnects.
   */
  async readStatus(options: TrumaConnectOptions, readOptions?: TrumaReadOptions): Promise<TrumaStatus> {
    const timeout = options.timeout || 10000;
    const pollCount = readOptions?.pollCount || 1;
    const pollDelay = readOptions?.pollDelay || 100;

    try {
      // Ensure noble is powered on
      await this.ensureNobleReady();

      // Connect to device
      await this.connect(options.address, timeout);

      // Setup characteristics
      await this.setupCharacteristics();

      // Subscribe to notifications
      const statusPromise = this.waitForNotification(timeout);

      // Send poll packet(s)
      for (let i = 0; i < pollCount; i++) {
        await this.writeCharacteristic!.writeAsync(POLL_PACKET, false);
        if (i < pollCount - 1) {
          await this.sleep(pollDelay);
        }
      }

      // Wait for response
      const status = await statusPromise;

      return status;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Set target temperature and verify
   *
   * Sends a set-temperature command and waits for confirmation.
   */
  async setTemperature(options: TrumaConnectOptions, tempC: number): Promise<TrumaStatus> {
    const timeout = options.timeout || 10000;

    try {
      await this.ensureNobleReady();
      await this.connect(options.address, timeout);
      await this.setupCharacteristics();

      // Wait for confirmation that temp was set
      const statusPromise = this.waitForNotification(timeout, (status) => status.setTemp === tempC);

      // Send set-temp command
      const packet = buildSetTempPacket(tempC);
      await this.writeCharacteristic!.writeAsync(packet, false);

      // Also send a poll to trigger immediate response
      await this.sleep(100);
      await this.writeCharacteristic!.writeAsync(POLL_PACKET, false);

      const status = await statusPromise;
      return status;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Scan for nearby Truma devices
   */
  static async scan(timeoutMs: number = 5000): Promise<Array<{ address: string; name: string | null }>> {
    return new Promise((resolve, reject) => {
      const deviceMap = new Map<string, { address: string; name: string | null }>();
      const timeout = setTimeout(() => {
        noble.stopScanning();
        resolve(Array.from(deviceMap.values()));
      }, timeoutMs);

      noble.on('stateChange', (state) => {
        if (state === 'poweredOn') {
          noble.startScanning([], true);
        }
      });

      noble.on('discover', (peripheral) => {
        const name = peripheral.advertisement?.localName || null;
        if (name && name.toLowerCase().includes('truma')) {
          // Use peripheral.id (works on both macOS and Linux)
          const id = peripheral.id;
          const address = this.formatAddress(id);

          if (!deviceMap.has(id)) {
            deviceMap.set(id, { address, name });
          }
        }
      });

      // Handle errors
      noble.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Start scanning if already powered on
      if (noble._state === 'poweredOn') {
        noble.startScanning([], true);
      }
    });
  }

  /**
   * Format address for display (add dashes for UUID format on macOS)
   */
  private static formatAddress(id: string): string {
    // If it's a 32-char hex string (macOS UUID without dashes), add dashes
    if (id.length === 32 && /^[0-9a-f]+$/i.test(id)) {
      return `${id.substring(0, 8)}-${id.substring(8, 12)}-${id.substring(12, 16)}-${id.substring(16, 20)}-${id.substring(20)}`.toUpperCase();
    }
    return id;
  }

  /**
   * Normalize address for comparison (remove dashes, lowercase)
   */
  private static normalizeAddress(address: string): string {
    return address.replace(/[-:]/g, '').toLowerCase();
  }

  private async ensureNobleReady(): Promise<void> {
    return new Promise((resolve) => {
      if (noble._state === 'poweredOn') {
        resolve();
      } else {
        noble.once('stateChange', (state) => {
          if (state === 'poweredOn') {
            resolve();
          }
        });
      }
    });
  }

  private async connect(address: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        noble.stopScanning();
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);

      const normalizedTarget = TrumaClient.normalizeAddress(address);

      noble.on('discover', async (peripheral) => {
        const normalizedId = TrumaClient.normalizeAddress(peripheral.id);

        if (normalizedId === normalizedTarget) {
          noble.stopScanning();
          this.peripheral = peripheral;

          peripheral.once('connect', () => {
            clearTimeout(timer);
            resolve();
          });

          peripheral.once('disconnect', () => {
            this.peripheral = null;
          });

          await peripheral.connectAsync();
        }
      });

      noble.startScanning([], true);
    });
  }

  private async setupCharacteristics(): Promise<void> {
    if (!this.peripheral) {
      throw new Error('Not connected');
    }

    const { characteristics } = await this.peripheral.discoverAllServicesAndCharacteristicsAsync();

    // Normalize UUIDs for comparison (remove dashes, lowercase)
    const normalizeUuid = (uuid: string) => uuid.replace(/-/g, '').toLowerCase();
    const writeUuid = normalizeUuid(WRITE_CHAR_UUID);
    const notifyUuid = normalizeUuid(NOTIFY_CHAR_UUID);

    this.writeCharacteristic = characteristics.find(c => normalizeUuid(c.uuid) === writeUuid) || null;
    this.notifyCharacteristic = characteristics.find(c => normalizeUuid(c.uuid) === notifyUuid) || null;

    if (!this.writeCharacteristic || !this.notifyCharacteristic) {
      const availableUuids = characteristics.map(c => c.uuid).join(', ');
      throw new Error(`Required characteristics not found. Available: ${availableUuids}`);
    }

    await this.notifyCharacteristic.subscribeAsync();
  }

  private async waitForNotification(
    timeout: number,
    filter?: (status: TrumaStatus) => boolean
  ): Promise<TrumaStatus> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`No notification received within ${timeout}ms`));
      }, timeout);

      const handler = (data: Buffer) => {
        const status = parseNotification(data);
        if (status && (!filter || filter(status))) {
          clearTimeout(timer);
          this.notifyCharacteristic?.removeListener('data', handler);
          resolve(status);
        }
      };

      this.notifyCharacteristic?.on('data', handler);
    });
  }

  private async disconnect(): Promise<void> {
    if (this.peripheral?.state === 'connected') {
      await this.peripheral.disconnectAsync();
    }
    this.peripheral = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
