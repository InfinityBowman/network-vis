import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import type { OsFamily } from '../types';

const execFileAsync = promisify(execFile);

export interface NmapOsResult {
  osFamily: OsFamily;
  osVersion: string;
  confidence: number;
  raw: string;
}

const OS_FAMILY_MAP: Array<[RegExp, OsFamily]> = [
  [/windows/i, 'windows'],
  [/mac os x|macos/i, 'macos'],
  [/ios|iphone os/i, 'ios'],
  [/android/i, 'android'],
  [/freebsd/i, 'freebsd'],
  [/linux/i, 'linux'],
];

/**
 * On-demand nmap OS detection for a specific IP.
 * Not scheduled — invoked via IPC when the user clicks "Scan with nmap".
 * Requires nmap installed (brew install nmap) and root or setuid for -O flag.
 */
export class OsNmapScanner {
  private _available: boolean | null = null;

  async checkAvailability(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      await execFileAsync('nmap', ['--version'], { timeout: 3000 });
      this._available = true;
    } catch {
      this._available = false;
    }
    return this._available;
  }

  async scan(ip: string): Promise<NmapOsResult | null> {
    const available = await this.checkAvailability();
    if (!available) return null;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn('nmap', ['-O', '--osscan-guess', '-T4', '--max-os-tries', '1', '-n', ip], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const killTimer = setTimeout(() => {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, 2000);
        resolve(null);
      }, 15000);

      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('exit', (code) => {
        clearTimeout(killTimer);
        if (code !== 0 && !stdout) {
          console.warn(`[NmapScanner] nmap exited ${code}: ${stderr.slice(0, 200)}`);
          resolve(null);
          return;
        }
        resolve(this.parseOutput(stdout));
      });

      proc.on('error', (err) => {
        clearTimeout(killTimer);
        console.error('[NmapScanner] spawn error:', err.message);
        resolve(null);
      });
    });
  }

  private parseOutput(stdout: string): NmapOsResult | null {
    // nmap outputs lines like:
    //   "OS details: Microsoft Windows 10 1607"
    //   "Running (JUST GUESSING): Apple iOS 14.X (97%)"
    const osDetailsMatch = stdout.match(/OS details:\s*(.+)/i);
    const runningMatch = stdout.match(/Running(?:\s*\(JUST GUESSING\))?:\s*(.+)/i);
    const raw = osDetailsMatch?.[1] ?? runningMatch?.[1] ?? '';
    if (!raw) return null;

    let osFamily: OsFamily = 'unknown';
    for (const [regex, family] of OS_FAMILY_MAP) {
      if (regex.test(raw)) {
        osFamily = family;
        break;
      }
    }

    // Extract confidence percentage if present (from first entry)
    const confidenceMatch = raw.match(/\((\d+)%\)/);
    const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.9;

    // Take only the first entry when nmap returns multiple guesses
    // e.g., "Linux 3.X (92%), Linux 4.X (92%)" → "Linux 3.X"
    const firstEntry = raw.split(',')[0].trim();
    const osVersion = firstEntry.replace(/\s*\(\d+%\)\s*/g, '').trim().slice(0, 80);

    return {
      osFamily,
      osVersion,
      confidence,
      raw,
    };
  }
}
