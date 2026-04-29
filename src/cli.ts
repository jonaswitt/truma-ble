#!/usr/bin/env node

import * as fs from 'fs';
import { TrumaClient } from './client';

const USAGE = `
Truma BLE CLI

Usage:
  truma-ble scan [--timeout=5000]
  truma-ble read <address> [--timeout=10000]
  truma-ble set <address> <temp> [--timeout=10000]
  truma-ble log <address> <file> [--timeout=10000] [--interval=60000]

Commands:
  scan                    Discover nearby Truma devices
  read <address>          Read current status (one-shot, outputs JSON)
  set <address>           Set target temperature
  log <address> <file>    Poll every 60s and append readings to a CSV file

Options:
  --timeout=<ms>          Connection/scan timeout in milliseconds
  --interval=<ms>         Polling interval in milliseconds (default: 60000)

Examples:
  truma-ble scan
  truma-ble read EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18
  truma-ble read 22:34:12:24:3F:35 --timeout=15000
  truma-ble set EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18 -18
  truma-ble log EBE74C1E-700F-4ADC-B8D4-6D80A0D94C18 truma.csv
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args[0];

  // Parse options
  const timeoutArg = args.find(arg => arg.startsWith('--timeout='));
  const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : undefined;

  const intervalArg = args.find(arg => arg.startsWith('--interval='));
  const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) : 60000;

  try {
    switch (command) {
      case 'scan': {
        const devices = await TrumaClient.scan(timeout || 5000);
        console.log(JSON.stringify(devices, null, 2));
        process.exit(0);
        break;
      }

      case 'read': {
        if (args.length < 2) {
          console.error('Error: Missing device address');
          console.log(USAGE);
          process.exit(1);
        }

        const address = args[1];
        const client = new TrumaClient();
        const status = await client.readStatus({ address, timeout });

        console.log(JSON.stringify(status, null, 2));
        process.exit(0);
        break;
      }

      case 'set': {
        if (args.length < 3) {
          console.error('Error: Missing device address or temperature');
          console.log(USAGE);
          process.exit(1);
        }

        const address = args[1];
        const temp = parseInt(args[2]);

        if (isNaN(temp)) {
          console.error('Error: Temperature must be a number');
          process.exit(1);
        }

        const client = new TrumaClient();
        const status = await client.setTemperature({ address, timeout }, temp);

        console.log(JSON.stringify(status, null, 2));
        process.exit(0);
        break;
      }

      case 'log': {
        if (args.length < 3) {
          console.error('Error: Missing device address or output file');
          console.log(USAGE);
          process.exit(1);
        }

        const address = args[1];
        const file = args[2];
        const CSV_HEADER = 'Time,actual,set,voltage,batteryProtection,errorCode\n';

        const needsHeader = !fs.existsSync(file) || fs.statSync(file).size === 0;
        if (needsHeader) {
          fs.writeFileSync(file, CSV_HEADER);
        }

        const poll = async () => {
          try {
            const client = new TrumaClient();
            const status = await client.readStatus({ address, timeout });
            const line = `${new Date().toISOString()},${status.actualTemp},${status.setTemp},${status.voltage},${status.batteryProtection},${status.errorCode ?? ""}\n`;
            fs.appendFileSync(file, line);
            console.log(line.trimEnd());
          } catch (err) {
            console.error('Read error:', err instanceof Error ? err.message : err);
          }
        };

        await poll();
        setInterval(poll, interval);
        break;
      }

      default:
        console.error(`Error: Unknown command "${command}"`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
