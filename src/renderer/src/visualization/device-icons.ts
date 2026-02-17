// SVG path data for device type icon badges, rendered inside D3 node groups.
// Paths are from Lucide icons (MIT license), designed for a 24x24 viewBox.
// In the renderer, these are scaled down to fit as small badges on LAN nodes.

const DEVICE_ICON_PATHS: Record<string, string> = {
  monitor:
    'M2 3h20v14H2z M8 21h8 M12 17v4',
  tv:
    'M2 7h20v13H2z M17 2l-5 5-5-5',
  printer:
    'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
  speaker:
    'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 6v.01',
  home:
    'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z M9 22V12h6v10',
  lightbulb:
    'M9 18h6 M10 22h4 M12 2a7 7 0 0 0-5 11.95V15a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.05A7 7 0 0 0 12 2z',
  'hard-drive':
    'M22 12H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z M6 16h.01 M10 16h.01',
  server:
    'M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z M2 15a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4z M6 7h.01 M6 17h.01',
  router:
    'M5 12.55a11 11 0 0 1 14.08 0 M1.42 9a16 16 0 0 1 21.16 0 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01',
  camera:
    'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
}

export function getDeviceIconPath(iconKey: string | undefined): string | null {
  if (!iconKey) return null
  return DEVICE_ICON_PATHS[iconKey] ?? null
}
