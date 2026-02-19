// SVG path data for OS family icon badges, designed for a 24x24 viewBox.
// Rendered as small badges on node top-left corners (opposite the device type badge).

const OS_ICON_PATHS: Record<string, string> = {
  // Apple — simplified apple shape (used for both macOS and iOS)
  macos:
    'M18.7 8.6C17.5 9.5 17 10.7 17 12.2c0 1.7.9 3.2 2.3 3.8-.3 1-1 2.4-2 3.7-1 1.4-2 2.3-3.3 2.3s-1.8-.7-3.5-.7-2.2.7-3.5.7-2.1-.9-3.2-2.5C2.6 17.1 2 14.6 2 12.2c0-3.5 2.3-5.5 4.5-5.5 1.2 0 2.1.8 2.9.8s1.7-.8 3.1-.8c.9 0 2.6.3 3.7 1.6zM14 5.5C14.5 4.8 15 3.7 15 2.5c0-.2 0-.3-.1-.5-1 .1-2.2.7-2.9 1.5-.6.6-1.2 1.7-1.2 2.8 0 .2 0 .4.1.4h.2c.9 0 2-.6 2.8-1.5z',
  ios:
    'M18.7 8.6C17.5 9.5 17 10.7 17 12.2c0 1.7.9 3.2 2.3 3.8-.3 1-1 2.4-2 3.7-1 1.4-2 2.3-3.3 2.3s-1.8-.7-3.5-.7-2.2.7-3.5.7-2.1-.9-3.2-2.5C2.6 17.1 2 14.6 2 12.2c0-3.5 2.3-5.5 4.5-5.5 1.2 0 2.1.8 2.9.8s1.7-.8 3.1-.8c.9 0 2.6.3 3.7 1.6zM14 5.5C14.5 4.8 15 3.7 15 2.5c0-.2 0-.3-.1-.5-1 .1-2.2.7-2.9 1.5-.6.6-1.2 1.7-1.2 2.8 0 .2 0 .4.1.4h.2c.9 0 2-.6 2.8-1.5z',
  // Windows — four panes
  windows:
    'M3 5l8-1.5v8H3V5zm0 8.5h8v8L3 20v-6.5zM13 3l9-1.5v10H13V3zm0 11.5h9V23l-9-1.5v-7z',
  // Linux — simplified Tux (penguin)
  linux:
    'M12 2C10.3 2 9 3.8 9 5c0 .7.3 1.3.7 1.8C8.6 7.8 7 9.7 7 12c0 2.5 1.2 4.5 2.5 6H9l-1 2h8l-1-2h-.5c1.3-1.5 2.5-3.5 2.5-6 0-2.3-1.6-4.2-2.7-5.2.4-.5.7-1.1.7-1.8 0-1.2-1.3-3-3-3zm-1.5 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm3 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-3 4h3l-.5 1.5h-2L10.5 12.5z',
  // Android — robot head
  android:
    'M6 12v5a1 1 0 0 0 1 1h1v3a1.5 1.5 0 0 0 3 0v-3h2v3a1.5 1.5 0 0 0 3 0v-3h1a1 1 0 0 0 1-1v-5H6zM4 12a1.5 1.5 0 0 0-1.5 1.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 4 12zm16 0a1.5 1.5 0 0 0-1.5 1.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 20 12zM7 11h10a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4zM10 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM7.5 5l-1-2M16.5 5l1-2',
  // FreeBSD — daemon/devil horns
  freebsd:
    'M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3zm-2 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-5 4s1.5 2 3 2 3-2 3-2M7 5L5 2M17 5l2-3',
};

export function getOsIconPath(osFamily: string | undefined): string | null {
  if (!osFamily || osFamily === 'unknown') return null;
  return OS_ICON_PATHS[osFamily] ?? null;
}

export const OS_FAMILY_COLORS: Record<string, string> = {
  windows: '#00a4ef',
  macos: '#a3a3a3',
  ios: '#a3a3a3',
  linux: '#f8b900',
  android: '#3ddc84',
  freebsd: '#ab1829',
  unknown: '#64748b',
};

export function getOsFamilyColor(osFamily: string | undefined): string {
  if (!osFamily) return OS_FAMILY_COLORS.unknown;
  return OS_FAMILY_COLORS[osFamily] ?? OS_FAMILY_COLORS.unknown;
}
