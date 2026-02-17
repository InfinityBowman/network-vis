import { useEffect, useRef, useState, useCallback } from "react"
import type { PacketEvent } from "@/types"

const MAX_EVENTS = 10000
const RENDER_THROTTLE_MS = 500

export function usePacketEvents() {
  const eventsRef = useRef<PacketEvent[]>([])
  const [version, setVersion] = useState(0)
  const throttleRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const remove = window.electron.on.packetEvent((event: PacketEvent) => {
      const events = eventsRef.current
      if (events.length >= MAX_EVENTS) events.shift()
      events.push(event)

      // Throttle re-renders to avoid perf issues at high packet rates
      if (!throttleRef.current) {
        throttleRef.current = setTimeout(() => {
          setVersion((v) => v + 1)
          throttleRef.current = null
        }, RENDER_THROTTLE_MS)
      }
    })

    return () => {
      remove()
      if (throttleRef.current) {
        clearTimeout(throttleRef.current)
        throttleRef.current = null
      }
    }
  }, [])

  const getEventsForNode = useCallback(
    (nodeId: string): PacketEvent[] => {
      // version is used to ensure this re-evaluates on updates
      void version
      return eventsRef.current.filter(
        (e) => e.nodeId === nodeId
      )
    },
    [version]
  )

  const getAllEvents = useCallback((): PacketEvent[] => {
    void version
    return [...eventsRef.current]
  }, [version])

  const totalEvents = eventsRef.current.length

  return { getEventsForNode, getAllEvents, totalEvents, version }
}
