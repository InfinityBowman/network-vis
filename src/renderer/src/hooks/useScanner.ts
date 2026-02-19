import { useEffect, useCallback, useState } from "react"
import type { ScannerMessage } from "@/types"

declare global {
  interface Window {
    electron: {
      scanner: {
        pause: () => Promise<any>
        resume: () => Promise<any>
        scanNow: (name?: string) => Promise<any>
        getFullState: () => Promise<any>
      }
      packet: {
        start: (options?: { interface?: string }) => Promise<{ success: boolean; error?: string }>
        stop: () => Promise<{ success: boolean }>
        status: () => Promise<import("@/types").PacketScannerStatus>
        getEvents: () => Promise<import("@/types").PacketEvent[]>
      }
      os: {
        nmapScan: (ip: string) => Promise<import("@/types").NmapScanResult>
        nmapStatus: () => Promise<{ available: boolean }>
      }
      on: {
        scannerUpdate: (cb: (data: any) => void) => () => void
        scannerFullState: (cb: (data: any) => void) => () => void
        packetEvent: (cb: (data: import("@/types").PacketEvent) => void) => () => void
        topologyUpdate: (cb: (data: import("@/types").SubnetInfo[]) => void) => () => void
      }
    }
  }
}

export function useScanner(onMessage: (msg: ScannerMessage) => void) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    // Request full state on mount
    window.electron.scanner.getFullState().then((state) => {
      if (state) {
        onMessage(state)
        setConnected(true)
      }
    })

    // Listen for incremental updates
    const removeUpdate = window.electron.on.scannerUpdate((data) => {
      onMessage(data)
      setConnected(true)
    })

    // Listen for full state pushes (e.g. on reconnect)
    const removeFullState = window.electron.on.scannerFullState((data) => {
      onMessage(data)
      setConnected(true)
    })

    return () => {
      removeUpdate()
      removeFullState()
    }
  }, [onMessage])

  const pause = useCallback(() => {
    window.electron.scanner.pause()
  }, [])

  const resume = useCallback(() => {
    window.electron.scanner.resume()
  }, [])

  const scanNow = useCallback((name?: string) => {
    window.electron.scanner.scanNow(name)
  }, [])

  return { connected, pause, resume, scanNow }
}
