import { useEffect, useRef, useState, useCallback } from 'react'
import type { SubnetInfo } from '@/types'

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0
}

export function useSubnetGroups() {
  const subnetsRef = useRef<SubnetInfo[]>([])
  const [subnets, setSubnets] = useState<SubnetInfo[]>([])

  useEffect(() => {
    const unsub = window.electron.on.topologyUpdate((data: SubnetInfo[]) => {
      subnetsRef.current = data
      setSubnets(data)
    })
    return unsub
  }, [])

  const getSubnetForIp = useCallback((ip: string): SubnetInfo | undefined => {
    const ipInt = ipToInt(ip)
    return subnetsRef.current.find((subnet) => {
      const netInt = ipToInt(subnet.networkAddress)
      const mask = subnet.prefix === 0 ? 0 : (~0 << (32 - subnet.prefix)) >>> 0
      return (ipInt & mask) === (netInt & mask)
    })
  }, [])

  return { subnets, getSubnetForIp }
}
