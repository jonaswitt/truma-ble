/**
 * Example usage of @jonaswitt/truma-ble
 *
 * Run with: node example.js
 */

const { TrumaClient } = require('./dist');

// Replace with your device address
const DEVICE_ADDRESS = 'EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18';

async function scanExample() {
  console.log('Scanning for Truma devices...');
  const devices = await TrumaClient.scan(5000);
  console.log('Found devices:', JSON.stringify(devices, null, 2));
}

async function readExample() {
  console.log('Reading status from device...');
  const client = new TrumaClient();

  const status = await client.readStatus({
    address: DEVICE_ADDRESS,
    timeout: 10000
  });

  console.log('Status:', JSON.stringify(status, null, 2));
  console.log(`\nVoltage: ${status.voltage}V`);
  console.log(`Current temp: ${status.actualTemp}°C`);
  console.log(`Target temp: ${status.setTemp}°C`);
}

async function monitoringExample() {
  console.log('Starting monitoring (every 60s)...');
  const client = new TrumaClient();

  async function readOnce() {
    try {
      const status = await client.readStatus({ address: DEVICE_ADDRESS });
      console.log(`[${new Date().toISOString()}] Voltage: ${status.voltage}V, Temp: ${status.actualTemp}°C`);
    } catch (error) {
      console.error('Read failed:', error.message);
    }
  }

  // Initial read
  await readOnce();

  // Then every 60 seconds
  setInterval(readOnce, 60000);
}

// Run examples
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'scan':
      await scanExample();
      process.exit(0);
      break;

    case 'read':
      await readExample();
      process.exit(0);
      break;

    case 'monitor':
      await monitoringExample();
      // Keep running
      break;

    default:
      console.log('Usage: node example.js [scan|read|monitor]');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
