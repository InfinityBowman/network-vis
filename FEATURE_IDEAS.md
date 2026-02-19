# Feature Ideas for NetRadar

A living document of ambitious feature ideas for NetRadar, the macOS Electron app that visualizes real-time network signals as an interactive D3 force graph. Each feature is grounded in the existing architecture: Electron main process running macOS system commands via `execFile`, a `BaseScanner` plugin system, D3-powered SVG rendering, and IPC-based state updates to a React/TypeScript renderer.

---

## Table of Contents

1. [Real-Time Traffic Flow Visualization](#1-real-time-traffic-flow-visualization)
2. [Deep Packet Inspection and Protocol Analysis](#2-deep-packet-inspection-and-protocol-analysis)
3. [IoT Device Fingerprinting](#3-iot-device-fingerprinting)
4. [Per-Device Bandwidth and Speed Monitor](#4-per-device-bandwidth-and-speed-monitor)
5. [DNS Query Visualization](#5-dns-query-visualization)
6. [Security Threat Detection Suite](#6-security-threat-detection-suite)
7. [Network Topology and Subnet Mapper](#7-network-topology-and-subnet-mapper)
8. [Historical Timeline and Time-Travel Replay](#8-historical-timeline-and-time-travel-replay)
9. [Device Profiling with OS Fingerprinting](#9-device-profiling-with-os-fingerprinting)
10. [Latency Heatmap Between Devices](#10-latency-heatmap-between-devices)
11. [Network Anomaly Detection](#11-network-anomaly-detection)
12. [Export, Snapshot, and Reporting](#12-export-snapshot-and-reporting)
13. [Wake-on-LAN and Remote Device Interaction](#13-wake-on-lan-and-remote-device-interaction)
14. [Bandwidth Quota Monitoring and Alerts](#14-bandwidth-quota-monitoring-and-alerts)
15. [3D / Globe Network Visualization Mode](#15-3d--globe-network-visualization-mode)
16. [Geolocation-Aware Connection Mapping](#16-geolocation-aware-connection-mapping)

---

## 1. Real-Time Traffic Flow Visualization

### Description

Transform the static edges between nodes into living, breathing data channels. Animated particles flow along edges proportional to actual throughput between devices, turning the force graph into something that feels like watching blood flow through a circulatory system. Thicker edges mean more bandwidth; faster particles mean higher packet rates. At a glance, you can see which connection is saturating your network.

### Why It's Cool

This converts an informational graph into something genuinely mesmerizing. It answers the question "where is my bandwidth going?" without clicking anything. A single look tells you that your NAS is hammering the gateway, or that your smart TV is streaming 4K.

### Technical Approach

- **New scanner**: Create a `TrafficScanner` extending `BaseScanner` that runs `nettop -P -L 1 -J bytes_in,bytes_out -n` on macOS. This outputs per-process and per-connection byte counts in machine-readable format. Alternatively, parse `netstat -ib` for per-interface stats, or use `nettop -m tcp -t external -L 1` for TCP flow-specific throughput.
- **Edge data extension**: Add `bytesPerSec`, `packetsPerSec`, and `direction` fields to `NetworkEdge` in `src/main/types.ts`. The orchestrator correlates traffic data with existing connection nodes by matching `(remoteHost, remotePort, processName)` tuples.
- **D3 animated edges**: In `src/renderer/src/visualization/renderers.ts`, replace static `<line>` edges with SVG `<path>` elements. Use D3's `transition()` with a dash-offset animation pattern: set `stroke-dasharray` and animate `stroke-dashoffset` at a speed proportional to `bytesPerSec`. For high-bandwidth edges, increase `stroke-width` logarithmically. Alternatively, spawn tiny SVG `<circle>` particles that travel along the path using `getPointAtLength()`.
- **Performance**: Throttle animation updates to 30fps. Use `requestAnimationFrame` gated by a timestamp delta. For graphs with 100+ edges, switch to canvas-rendered particles overlaid on the SVG.
- **IPC flow**: `TrafficScanner` emits `ScanResult` with updated edges. Orchestrator merges traffic metadata into existing edges. Renderer receives them via `scanner:update` and adjusts animations in the D3 tick loop.

### Complexity

**Medium** -- nettop parsing is straightforward; the D3 animation work is the bulk of the effort.

### Dependencies

- macOS `nettop` command (ships with macOS, no install needed)
- Correlation logic to match traffic flows to existing `ActiveConnectionNode` ids

---

## 2. Deep Packet Inspection and Protocol Analysis

### Description

Capture live packets on the network interface and classify them by protocol (HTTP, HTTPS/TLS, DNS, DHCP, SSH, MQTT, CoAP, etc.). Display protocol breakdowns per device as colored rings around nodes, and surface interesting payloads: DNS queries, HTTP hostnames from SNI, mDNS announcements, DHCP negotiations. This turns NetRadar into a lightweight Wireshark with a beautiful graph interface.

### Why It's Cool

Most people have no idea what their devices are actually saying on the network. Seeing that your thermostat is making HTTP requests to a Chinese IP, or that your smart speaker resolves 47 domains per minute, is both revelatory and slightly terrifying. This feature makes the invisible visible.

### Technical Approach

- **Packet capture via tshark**: Use Wireshark's CLI tool `tshark` instead of raw `tcpdump`. tshark provides built-in protocol dissection for hundreds of protocols, eliminating the need to build custom protocol classification logic. Run as a long-lived child process with streaming JSON output: `tshark -i en0 -T ek -l` (Elasticsearch key-value format, line-buffered). Each line is a self-contained JSON object with fully dissected protocol fields.
  - **Why tshark over tcpdump**: tcpdump outputs raw text that requires fragile custom parsers for each protocol. tshark does the protocol dissection natively and outputs structured data. Since users already need Wireshark's ChmodBPF package for BPF device access, tshark comes bundled for free -- it's not an extra dependency.
  - **Field extraction**: Use `-T fields` mode for targeted captures with specific fields: `tshark -i en0 -l -T fields -e frame.protocols -e dns.qry.name -e tls.handshake.extensions_server_name -e http.host -e ip.src -e ip.dst -e eth.src -e eth.dst`. This extracts exactly the data needed without parsing overhead.
  - **Fallback**: If tshark is unavailable, fall back to `tcpdump -i any -nn -l -e -q -tttt` with basic protocol inference from port numbers. This provides degraded but functional coverage using a macOS built-in command.
- **New scanner type**: Create `PacketScanner` that extends `BaseScanner` with the `start(onUpdate)` pattern (like `BonjourScanner`). It spawns a persistent `tshark` child process, parses JSON lines (or tab-separated fields) in real-time, and batches results every 500ms.
- **Protocol classification**: With tshark, protocol classification is largely solved -- the `frame.protocols` field provides the full protocol stack (e.g., `eth:ethertype:ip:tcp:tls:http`). Aggregate protocol counts per source/dest MAC or IP. For focused captures, use tshark display filters: `-Y "dns"` for DNS, `-Y "tls.handshake.type == 1"` for TLS Client Hellos, etc. Display filters are more expressive than tcpdump's BPF filters.
- **Data model**: Add a `protocols: Record<string, number>` field to `NetworkNodeBase` tracking packet counts per protocol. Add a new `PacketEvent` type for interesting captures (DNS queries, TLS SNI hostnames).
- **Renderer**: Draw concentric protocol rings around nodes in `renderNode()`. Use D3 arc generators with each ring segment sized by protocol percentage. Add a packet log panel component that shows a scrolling feed of interesting events.
- **Permissions**: tshark (like tcpdump) requires BPF device access. On macOS, install Wireshark's ChmodBPF package, which grants the user's group read access to `/dev/bpf*` devices. Detect permission failures gracefully and prompt the user with install instructions. No `sudo` or `SMJobBless` privilege elevation needed if ChmodBPF is installed.

### Complexity

**Medium** -- tshark handles the hard part (protocol dissection and structured output), reducing this to child process management, JSON parsing, and renderer work for protocol rings.

### Dependencies

- `tshark` (ships with Wireshark; install via `brew install --cask wireshark` or Wireshark DMG)
- Wireshark ChmodBPF package for BPF access permissions
- Graceful fallback to `tcpdump` (ships with macOS) for basic mode

---

## 3. IoT Device Fingerprinting

### Description

Automatically identify IoT devices on your network: smart bulbs, cameras, thermostats, voice assistants, smart plugs, robot vacuums. Go beyond MAC OUI vendor lookup (which already exists in `arp.ts`) to use multi-signal fingerprinting: MAC prefix, mDNS service types, open ports, HTTP server banners, DHCP hostname patterns, and traffic behavior profiles. Present each device with its actual product icon and name instead of a generic IP address.

### Why It's Cool

Your network has 30 devices but you only recognize 5 of them. This feature names and shames every smart device hiding on your LAN. "Oh, that's my Philips Hue bridge. That's my Roomba. And _that_ is the smart plug my landlord left behind that's phoning home to a server in Shenzhen."

### Technical Approach

- **Cross-reference existing data first** (lowest effort, highest value): The `BonjourScanner` and `ArpScanner` already produce overlapping data that isn't being correlated. Build a `DeviceClassifier` service that matches Bonjour services to ARP entries by IP address. The service type alone identifies the device category with high confidence: `_hap._tcp` → HomeKit device, `_googlecast._tcp` → Chromecast/Google Home, `_airplay._tcp` → Apple TV / AirPlay receiver, `_raop._tcp` → AirPlay speaker, `_ipp._tcp` / `_ipps._tcp` → printer, `_smb._tcp` → NAS / file server, `_ssh._tcp` → SSH server (likely computer), `_companion-link._tcp` → Apple device, `_spotify-connect._tcp` → Spotify speaker. This requires zero new scanners -- just wiring up data that already exists.
- **Dynamic service type discovery**: Replace the hardcoded `COMMON_SERVICE_TYPES` list in `bonjour.ts` with dynamic discovery. Run `dns-sd -B _services._dns-sd._udp` on macOS to enumerate **all** advertised service types on the network, then browse each discovered type. This catches device types the current static list misses (e.g., `_matter._tcp` for Matter devices, `_coap._udp` for CoAP IoT, custom manufacturer service types).
- **Expanded OUI database**: Replace the hardcoded `OUI_MAP` in `src/main/scanners/arp.ts` (~26 entries) with the **Wireshark `manuf` file** -- it's well-curated, actively maintained, and has excellent IoT vendor coverage (Espressif, Tuya, Shelly, Ring, Nest, etc.). Download it at build time and generate a static JSON lookup. This is preferable to the `oui` npm package, which can be stale. The `manuf` file is smaller and updated with each Wireshark release.
- **Port scanning** (opt-in, not automatic): Create a lightweight `PortProbeScanner` that tests a short list of IoT ports on LAN devices: 80/443 (web UI), 8008 (Chromecast), 554 (RTSP cameras). Use Node.js `net.connect()` with **500ms timeouts**. Keep the port list intentionally short -- some cheap IoT devices crash or misbehave when port scanned. Make this opt-in (triggered by user click or a setting) rather than running automatically on every scan cycle. Extract HTTP `Server` headers from port 80 responses, which are surprisingly distinctive (e.g., "Philips Hue Personal WiFi System", "EPSON HTTP Server").
- **Device profile database**: Ship a JSON database mapping `(vendor, services[], openPorts[], hostnamePattern)` tuples to `{ deviceType, productName, icon }`. Start with 50-100 common devices and grow it over time.
- **Type extensions**: Add `deviceType?: string` (e.g., "smart_speaker", "camera", "thermostat"), `productName?: string`, and `iconUrl?: string` to `LanDeviceNode`.
- **Renderer**: In `renderNode()`, render recognized IoT devices with product-specific SVG icons (lightbulb, camera, thermostat, speaker) instead of generic shapes. Use a device-type color palette. Add an "Identified Devices" section to the sidebar.

### Complexity

**Medium** -- The first two steps (cross-referencing existing data + OUI upgrade) are low effort and cover most devices. Port probing and the profile database add incremental value.

### Dependencies

- Wireshark `manuf` file (downloaded at build time, free)
- Device fingerprint database (community-maintained or hand-curated)
- Existing `BonjourScanner` and `ArpScanner` data (already built)

---

## 4. Per-Device Bandwidth and Speed Monitor

### Description

Show real-time upload/download speed for every device on the network, and measure link quality (latency, jitter, packet loss) to any device with a single click. Render bandwidth as animated gauge arcs around each node. Include a "speed test" button that measures internet throughput through the gateway.

### Why It's Cool

It answers the eternal household question: "Who is using all the bandwidth?" Directly on the graph, you can see that one node is pulling 50 Mbps while everyone else gets 2 Mbps.

### Technical Approach

- **Interface-level stats**: Run `netstat -ib` periodically to get per-interface byte counters. Diff consecutive readings to compute bytes/sec. This gives aggregate throughput per network interface (en0, en1, etc.).
- **Per-connection bandwidth**: Use `nettop -P -L 1 -J bytes_in,bytes_out -n` which reports per-process, per-connection throughput. Parse and correlate with `ActiveConnectionNode` entries.
- **Per-LAN-device bandwidth** (advanced): For true per-device monitoring on the LAN, this requires router-level data or packet capture. As a practical alternative, use the packet capture from Feature 2 to count bytes per source/dest MAC address pair, aggregated over time windows.
- **Latency measurement**: On click, spawn `ping -c 5 <ip>` for the selected device and parse min/avg/max/stddev. Display as a small sparkline in the node tooltip.
- **Internet speed test**: Implement a simple download speed test by fetching a known large file (e.g., Cloudflare's speed test endpoint) via Node.js `https.get` and measuring throughput. Run in the main process to avoid renderer blocking.
- **Renderer**: Add a `bandwidth` field to `SimNode`. In `renderNode()`, draw an animated arc (D3 arc generator) around each node where arc length represents current throughput as a percentage of the maximum observed. Use green-yellow-red color scale. Show the numeric value (e.g., "12.4 Mbps") as a secondary label beneath the node name.

### Complexity

**Medium** -- Interface-level stats are easy; per-device granularity requires packet capture or router integration.

### Dependencies

- `nettop`, `netstat` (macOS built-in)
- Packet capture capability (for per-device LAN stats)
- Speed test endpoint (Cloudflare, Fast.com API, or self-hosted)

---

## 5. DNS Query Visualization

### Description

Capture and visualize every DNS query made by devices on the network. Each resolved domain appears as a small satellite node orbiting the device that queried it, forming constellations of domains around each device. Cluster domains by category (advertising, tracking, CDN, social media, known malware). Highlight suspicious or unexpected lookups.

### Why It's Cool

DNS is the address book of the internet, and every device consults it constantly. Seeing that your "offline" security camera resolves 12 unique tracking domains, or that your kid's tablet hits ad networks 300 times per hour, is powerful knowledge. It is network transparency made beautiful.

### Technical Approach

- **DNS capture**: Run `tcpdump -i any -nn -l 'udp port 53' -tttt` as a long-lived child process. Parse DNS query/response lines to extract: timestamp, source IP, queried domain, response IPs, and query type (A, AAAA, CNAME, etc.).
- **Alternative approach**: If the machine runs a local DNS resolver (common with macOS Private Relay or Pi-hole), parse `/var/log/system.log` or `log stream --predicate 'subsystem == "com.apple.dnssd"'` for DNS resolution events without packet capture permissions.
- **Domain categorization**: Ship a categorized domain list (use open-source blocklists like Steven Black's hosts file or the Disconnect tracking protection list). Categories: advertising, tracking, analytics, social media, CDN, malware, adult, streaming, productivity.
- **Data model**: New type `DnsQueryNode` with fields: `domain`, `category`, `queryCount`, `firstQueried`, `lastQueried`, `sourceDeviceId`. New edge type `'dns_query'` connecting a device node to its queried domains.
- **Renderer**: DNS nodes render as tiny dots (radius 3-4px) orbiting their parent device at a configurable orbital radius. Color-code by category (red for tracking/malware, gray for CDN, blue for productive). On hover, expand the constellation to show domain names. Add a "DNS Activity" panel showing top queried domains ranked by frequency, filterable by device.
- **D3 layout**: Use a custom force that positions DNS nodes in a tight cluster near their parent device. Apply a weak radial force from the parent node with angular jitter to spread them into a ring.

### Complexity

**Medium-High** -- DNS parsing is well-understood but the constellation rendering and categorization database require significant effort.

### Dependencies

- `tcpdump` with BPF access, or macOS unified log access
- Domain categorization database (open-source blocklists)
- New node/edge types in the type system

---

## 6. Security Threat Detection Suite

### Description

A multi-layered security monitor that detects common network attacks and suspicious behavior in real-time: ARP spoofing (duplicate MACs), rogue access points (unexpected SSIDs), port scan detection (many connection attempts from one source), DNS spoofing indicators, and unusual traffic patterns. Flagged threats pulse red on the graph with an alert panel showing details and remediation steps.

### Why It's Cool

This turns NetRadar from a passive observer into an active guardian. Most home users have zero visibility into network attacks. Seeing a red pulsing node with the label "POSSIBLE ARP SPOOF: two devices claim to be your gateway" is both alarming and actionable.

### Technical Approach

- **ARP spoof detection**: In `ArpScanner`, track MAC-to-IP mappings over time. If the gateway IP (typically `*.*.*.1`) suddenly maps to a different MAC address, flag it. Store a `previousMacForIp: Map<string, string>` in the scanner state.
- **Rogue AP detection**: In `WifiScanner`, maintain a list of "known" SSIDs. Alert when a new SSID appears that is similar to (but not identical to) a known SSID (Levenshtein distance check), or when a known SSID appears with a different BSSID than previously seen (evil twin attack).
- **Port scan detection**: In `ConnectionsScanner`, track inbound connection attempts per source IP over a sliding window. If a single source IP attempts connections to more than N distinct ports within M seconds, flag as a potential port scan.
- **New service**: Create a `ThreatDetector` service in `src/main/services/` that subscribes to scan results from all scanners. It maintains historical state and runs detection heuristics after each scan cycle. Emits a new IPC channel `scanner:threat` with threat details.
- **Type additions**: New `ThreatAlert` interface: `{ id, severity: 'info'|'warning'|'critical', type: string, message: string, involvedNodeIds: string[], timestamp, dismissed: boolean }`.
- **Renderer**: Nodes involved in threats get a red pulsing ring animation (CSS `@keyframes` + SVG filter). A threat panel component (slide-out from right edge) lists active alerts with severity badges, timestamps, and "Dismiss" / "Learn More" actions.

### Complexity

**Medium** -- Each individual detection is simple; the value is in combining them into a cohesive system with good UX.

### Dependencies

- Historical state tracking across scan cycles
- Existing scanner data (no new system commands required)
- String similarity library for rogue AP detection (or simple Levenshtein implementation)

---

## 7. Network Topology and Subnet Mapper

### Description

Discover and render the full network topology: subnets, VLANs, gateways, and routing paths. Instead of every device connecting to "this device," show the actual network hierarchy. Devices group into their subnets; subnets connect through routers; the internet cloud sits at the edge. Visualize multiple network interfaces (Wi-Fi + Ethernet + VPN) as distinct network zones.

### Why It's Cool

Most network tools show a flat list of devices. This shows the actual shape of your network. You can see at a glance that you have three subnets, a VPN tunnel, and a guest network -- and which devices are on which.

### Technical Approach

- **Route table parsing**: Run `netstat -rn` to get the full routing table. Parse to identify gateways, subnets (by network/mask), and interfaces. Each unique subnet becomes a visual group.
- **Traceroute to devices**: For LAN devices on different subnets, run `traceroute -n -m 5 -q 1 <ip>` to discover intermediate hops. This reveals routers and L3 switches between subnets.
- **Interface enumeration**: The existing `ThisDeviceNode` already has `interfaces[]`. Use this to create multiple "network zone" containers. Each interface represents a different network (e.g., en0 = home Wi-Fi, utun0 = VPN, en5 = Ethernet).
- **Subnet grouping**: Classify each discovered device into a subnet by ANDing its IP with known subnet masks from the routing table. Create `SubnetNode` entities that act as visual containers.
- **D3 rendering**: Use D3's `d3.forceCluster()` (custom) or nested radial layouts to group nodes by subnet. Draw translucent rounded rectangles around each subnet cluster with labels like "192.168.1.0/24 (Home Wi-Fi)" and "10.8.0.0/24 (VPN)". Connect subnet groups through gateway nodes.
- **Type additions**: New `SubnetNode` type with fields: `cidr`, `interface`, `gatewayId`, `deviceCount`. New edge type `'routes_through'`.

### Complexity

**Medium** -- Route table parsing and subnet classification are well-defined problems; the D3 cluster layout is the interesting challenge.

### Dependencies

- `netstat -rn`, `traceroute` (macOS built-in)
- Modified force layout to support group containment

---

## 8. Historical Timeline and Time-Travel Replay

### Description

Record all network state changes to a local database and let the user scrub through time with a timeline slider. Watch devices appear and disappear, connections form and break, traffic ebb and flow. Replay the last hour, day, or week of network activity like a DVR. Annotate interesting moments ("internet outage at 3:14 AM", "new device appeared").

### Why It's Cool

Networks are dynamic systems, but we only ever see the present moment. Time-travel reveals patterns: the smart home devices that wake up at 2 AM, the brief appearance of an unknown device, the slow degradation of Wi-Fi signal strength over weeks. It turns ephemeral data into durable insight.

### Technical Approach

- **Storage**: Use `better-sqlite3` (native module, fast, zero-config) in the main process. Schema: `snapshots(id, timestamp, nodes_json, edges_json)` table with snapshots every 10-30 seconds. A `events(id, timestamp, type, data_json)` table for discrete events (device appeared, device disappeared, threat detected). SQLite handles millions of rows trivially.
- **Recording**: In `Orchestrator.pushUpdate()`, also write the current state to SQLite. Debounce writes to every 10 seconds to avoid excessive I/O. Store only diffs after the initial snapshot to save space.
- **Replay API**: New IPC handlers: `history:get-range(startTime, endTime)` returns snapshots, `history:get-events(startTime, endTime)` returns events. Main process queries SQLite and returns results.
- **Renderer**: Add a timeline bar component at the bottom of the screen (similar to video player scrubber). When the user drags the scrubber, pause live scanning and render historical state. Show a density plot along the timeline indicating periods of high activity. Allow zooming into specific time ranges.
- **Data retention**: Auto-prune snapshots older than a configurable duration (default 7 days). Offer export of historical data as JSON.

### Complexity

**High** -- Database integration, efficient diffing, and the timeline UI are all substantial pieces of work.

### Dependencies

- `better-sqlite3` npm package (requires native compilation for Electron)
- Significant renderer work for the timeline component
- Electron rebuild step for native modules

---

## 9. Device Profiling with OS Fingerprinting

### Description

Determine the operating system and device type of every device on the network using passive and active fingerprinting techniques. Display OS icons (Apple, Windows, Linux, Android, ChromeOS) on each node. Combine TCP stack fingerprinting, mDNS hostnames, HTTP User-Agent sniffing, and DHCP options to build a rich device profile.

### Why It's Cool

Knowing "there's a device at 192.168.1.42" is mildly useful. Knowing "there's a Windows 11 Dell laptop at 192.168.1.42 running Chrome and Discord" is genuinely powerful. Device profiling transforms anonymous dots into recognizable entities.

### Technical Approach

- **Passive hostname analysis**: Many devices broadcast identifying hostnames via mDNS or DHCP. Parse patterns: `*-iPhone` (iOS), `*-PC` (Windows), `*-MacBook*` (macOS), `android-*` (Android), `ESP_*`/`esp32-*` (IoT). The existing `BonjourScanner` already captures hostnames.
- **TCP/IP stack fingerprinting**: Use `nmap -O --osscan-guess <ip>` for active OS detection on selected devices. Run on demand (not automatically for all devices, since it's slow and noisy). Parse nmap's OS guess output.
- **MAC OUI + device type heuristics**: Combine the expanded OUI database from Feature 3 with known device-type mappings. Apple MACs on ARP but not in Bonjour as a Mac = likely iPhone/iPad. Espressif/Tuya MACs = IoT device.
- **User-Agent capture**: If packet capture is available (Feature 2), extract HTTP `User-Agent` headers and TLS `ClientHello` JA3 fingerprints from unencrypted traffic. Match JA3 hashes against known databases.
- **Data model**: Add `osFamily?: string`, `osVersion?: string`, `deviceCategory?: 'computer'|'phone'|'tablet'|'iot'|'infrastructure'|'unknown'` to `NetworkNodeBase`.
- **Renderer**: Show OS family icons as small badge overlays on node shapes. Differentiate node shapes by device category (phones as rounded pills, infrastructure as hexagons, IoT as small circles, computers as rectangles).

### Complexity

**Medium-High** -- Passive fingerprinting is easy; active (nmap) requires installation and permissions; UI integration is moderate.

### Dependencies

- `nmap` for active fingerprinting (user must install via Homebrew)
- OUI database (same as Feature 3)
- Optionally, JA3 fingerprint database

---

## 10. Latency Heatmap Between Devices

### Description

Measure round-trip latency from your machine to every discovered device and render it as a color-coded heatmap overlay on the graph. Nodes glow green (low latency) through yellow to red (high latency). Edges pulse at a rate matching actual round-trip time. Optionally display a correlation matrix showing latency between all device pairs.

### Why It's Cool

Wi-Fi signal strength does not tell the whole story. A device can have full bars but 200ms latency because of channel congestion, interference, or a misconfigured QoS rule. This feature reveals the actual responsiveness of every network path.

### Technical Approach

- **Ping sweep**: Create a `LatencyScanner` that runs `fping -c 3 -q -t 500 <ip1> <ip2> ... <ipN>` (or sequential `ping -c 1 -t 1 <ip>` if fping is unavailable). Parse the min/avg/max/loss output for each device. Run every 15 seconds for all active LAN device IPs.
- **macOS alternative**: Use `ping -c 3 -W 1000 <ip>` per device. Parallelize with `Promise.allSettled()` across all discovered IPs. Cap concurrency at 10 to avoid ICMP flood.
- **Data model**: Add `latencyMs?: number`, `packetLoss?: number`, `jitter?: number` to `NetworkNodeBase`.
- **Renderer heatmap**: Map `latencyMs` to a D3 sequential color scale (`d3.interpolateRdYlGn` inverted: green=0ms, red=200ms+). Apply as the fill color or as a glow filter hue on each node. Add a color scale legend to the legend component.
- **Edge animation**: Animate edge dash-offset at a speed inversely proportional to latency (low latency = fast flow, high latency = slow crawl). This creates an intuitive visual metaphor.
- **Matrix view**: Add an optional heatmap matrix component (toggled from controls) showing latency between all device pairs. Rendered with D3 as a grid of colored cells with tooltips showing exact values.

### Complexity

**Low-Medium** -- Ping is simple; the primary work is in the renderer color mapping and the optional matrix view.

### Dependencies

- `ping` (macOS built-in) or `fping` (Homebrew)
- New scanner following existing `BaseScanner` pattern

---

## 11. Network Anomaly Detection

### Description

Use statistical analysis and lightweight machine learning to detect deviations from normal network behavior: unusual traffic volumes, new devices at odd hours, sudden changes in connection patterns, bandwidth spikes, devices contacting new external IPs. Score each anomaly by severity and surface them as subtle visual distortions on the graph -- like nodes vibrating or edges flickering.

### Why It's Cool

Rule-based threat detection (Feature 6) catches known attacks. Anomaly detection catches the unknown unknowns. It learns what "normal" looks like for your specific network and alerts you when something breaks the pattern, whether it is a compromised IoT device, an unauthorized user, or a misconfigured service.

### Technical Approach

- **Baseline collection**: For the first 24-48 hours, the system operates in "learning mode," collecting statistics: typical device count per hour, average bandwidth per device, normal set of external IPs contacted, usual connection patterns. Store baselines in SQLite (from Feature 8) or a simple JSON file.
- **Statistical anomaly scoring**: Use z-score analysis on time-series metrics. If current bandwidth is more than 3 standard deviations above the rolling 24-hour mean, flag it. If a device that normally makes 5 connections suddenly makes 50, flag it. Use exponential moving averages for adaptive baselines.
- **Implementation**: Create an `AnomalyDetector` service in `src/main/services/`. It subscribes to `Orchestrator` updates and maintains rolling statistics in memory. Compute anomaly scores after each scan cycle. No external ML libraries needed -- basic statistics in pure TypeScript handles this well.
- **For advanced ML** (optional): Use `onnxruntime-node` to run a pre-trained isolation forest or autoencoder model. Train offline on collected data, export to ONNX format, load in Electron. This catches more subtle multi-dimensional anomalies.
- **Renderer**: Anomalous nodes get a subtle "vibration" effect (rapid small random translations in the D3 tick function). Severity maps to vibration amplitude. High-severity anomalies also trigger the threat alert panel from Feature 6.

### Complexity

**High** -- Statistical baselines are moderate; ML integration is advanced; tuning false positive rates requires iteration.

### Dependencies

- Historical data collection (benefits from Feature 8's SQLite storage)
- Optionally `onnxruntime-node` for ML models
- Feature 6's alert UI for surfacing detections

---

## 12. Export, Snapshot, and Reporting

### Description

Capture the current network state as a beautiful, shareable artifact. Export the live graph as a high-resolution SVG or PNG. Generate a PDF network audit report with device inventory, security findings, bandwidth stats, and topology diagram. Save and load network snapshots for comparison ("how does my network today compare to last month?").

### Why It's Cool

Visualization is powerful, but sometimes you need to share what you see with someone who doesn't have the app. A network admin wants a PDF for a client. A security auditor wants a before/after comparison. A curious user wants to post their network graph on Reddit.

### Technical Approach

- **SVG export**: The graph is already rendered as SVG in the `NetworkCanvas` component. Use `XMLSerializer` to serialize the SVG DOM, inject inline styles (since CSS won't travel with the file), and trigger a download via Electron's `dialog.showSaveDialog()` + `fs.writeFile()`.
- **PNG export**: Use the `canvas` element approach: draw the SVG to a `<canvas>` via `canvg` or `Image` + `canvas.drawImage()`, then `canvas.toBlob('image/png')`. Or use Electron's `webContents.capturePage()` for a quick screenshot of the entire window.
- **PDF report**: Use the `pdfkit` npm package in the main process. Programmatically build a report with sections: Network Overview (device count, topology summary), Device Inventory (table of all nodes with type, IP, MAC, vendor, OS, first/last seen), Security Findings (from Feature 6), Traffic Summary (if Feature 1 is implemented). Embed the graph SVG as a vector image.
- **Snapshot save/load**: Serialize `ScannerFullState` to JSON. Save to `~/Documents/NetRadar/snapshots/` with a timestamp filename. Load replays the saved state into the renderer. Add a "Compare" mode that overlays two snapshots with additions in green and removals in red.
- **IPC**: New handlers: `export:svg`, `export:png`, `export:pdf`, `snapshot:save`, `snapshot:load`, `snapshot:list`.

### Complexity

**Medium** -- SVG/PNG export is straightforward; PDF generation and snapshot comparison add complexity.

### Dependencies

- `pdfkit` npm package (for PDF generation)
- Electron `dialog` API for save dialogs
- Existing SVG DOM for graph export

---

## 13. Wake-on-LAN and Remote Device Interaction

### Description

Right-click any LAN device on the graph and interact with it: send a Wake-on-LAN magic packet, ping it, open its web interface in a browser, copy its IP/MAC, or SSH into it (opening Terminal.app). Turn the visualization into an actionable network management tool, not just a passive viewer.

### Why It's Cool

The graph already shows you every device. Being able to act on them without switching to Terminal or another app makes NetRadar a genuine network tool rather than just eye candy. Wake-on-LAN is especially useful -- wake your NAS or media server with one click from a beautiful graph.

### Technical Approach

- **Context menu**: Use Electron's `Menu.buildFromTemplate()` triggered by right-click on a node. The renderer sends the clicked node's data to the main process via IPC. The main process builds a context menu with actions based on node type.
- **Wake-on-LAN**: Construct a WoL magic packet (6 bytes of 0xFF followed by the target MAC repeated 16 times). Send via Node.js `dgram` UDP socket to the broadcast address (255.255.255.255) on port 9. Pure Node.js, no external dependencies.
- **Open web UI**: For devices with port 80/443 open (detected by Feature 3's port probe, or simply attempted), open `http://<ip>` in the default browser via Electron's `shell.openExternal()`.
- **SSH**: Open Terminal.app with an SSH command via `execFile('open', ['-a', 'Terminal', 'ssh', user@ip])` or use `osascript` to run an AppleScript that opens Terminal with the SSH command.
- **Copy to clipboard**: Use Electron's `clipboard.writeText()` to copy IP, MAC, or hostname.
- **Ping**: Spawn `ping -c 5 <ip>` and show results in a floating panel near the node.

### Complexity

**Low** -- Each action is simple; the context menu integration is the main architectural work.

### Dependencies

- Electron `Menu`, `shell`, `clipboard` APIs
- Node.js `dgram` module for WoL
- Existing node data (IP, MAC)

---

## 14. Bandwidth Quota Monitoring and Alerts

### Description

Set bandwidth budgets for the overall network or individual devices and get notified when thresholds are approached or exceeded. Track cumulative daily/weekly/monthly data usage. Useful for metered connections, parental controls, or just understanding your data consumption patterns over time.

### Why It's Cool

ISPs with data caps are common. Knowing you have used 800GB of your 1TB monthly cap -- and that 400GB of it came from one device streaming 4K -- lets you take action before overage charges hit.

### Technical Approach

- **Data collection**: Build on Feature 4's bandwidth monitoring. Accumulate per-device byte counters in a persistent store (SQLite from Feature 8, or a simple JSON file in `app.getPath('userData')`). Reset counters at configurable intervals (daily/weekly/monthly).
- **Quota configuration**: Store quota rules as JSON: `{ scope: 'global' | deviceId, limitBytes: number, period: 'daily'|'weekly'|'monthly', alertThresholds: [0.75, 0.9, 1.0] }`. Expose configuration through a settings panel in the renderer.
- **Alert system**: Use Electron's `Notification` API to send native macOS notifications when thresholds are crossed. Also display alerts in-app with a notification bell icon and badge count.
- **Renderer**: Add a usage dashboard component showing: progress bars for each quota (green/yellow/red), a line chart of cumulative usage over the current period, and a projection line estimating end-of-period usage based on current rate.
- **Tray integration**: Show current usage percentage in the macOS menu bar tray icon (if a tray icon is added). Quick glance at data usage without opening the full app.

### Complexity

**Medium** -- Requires persistent storage, configuration UI, and the notification system.

### Dependencies

- Bandwidth monitoring (Feature 4)
- Persistent storage (Feature 8's SQLite or simpler JSON file)
- Electron `Notification` API

---

## 15. 3D / Globe Network Visualization Mode

### Description

Switch from the 2D force graph to an immersive 3D visualization. Local devices orbit in a 3D sphere around your machine at the center. External connections extend outward to a surrounding globe showing their geographic locations. Rotate, zoom, and fly through your network. Think "mission control meets network monitor."

### Why It's Cool

3D visualization is not just aesthetic -- it solves a real information density problem. In 2D, networks with 100+ nodes become cluttered. In 3D, you gain an entire extra axis for separation. Mapping external connections to a globe also adds geographic context that is impossible in 2D. And honestly, it looks incredible.

### Technical Approach

- **3D library**: Use `three.js` (mature, well-supported) or `@react-three/fiber` (React bindings for Three.js) for the 3D scene. This runs in the renderer process alongside the existing 2D D3 visualization. Add a toggle to switch between 2D and 3D modes.
- **Force layout in 3D**: Use `d3-force-3d` (npm package extending D3 force simulation to three dimensions) to compute 3D node positions. Same force model (charge, links, collision) but with x, y, and z coordinates.
- **Rendering**: Each node becomes a Three.js `Mesh` with a `SphereGeometry` or custom geometry. Edges become `Line` objects. Use instanced meshes for performance with many nodes. Add bloom post-processing for the glow effect matching the current 2D aesthetic.
- **Camera controls**: Use Three.js `OrbitControls` for mouse-drag rotation, scroll-to-zoom, and middle-click-to-pan. Add smooth camera transitions when focusing on a specific node.
- **Geographic globe**: For `ActiveConnectionNode` entries, resolve remote IPs to geographic coordinates using a local GeoIP database (MaxMind GeoLite2, free tier). Render a translucent globe using Three.js with connection lines arcing from the center to geographic points.
- **Performance**: Use `InstancedMesh` for nodes, `LineSegments` for edges (single draw call). Target 60fps with up to 500 nodes. Use Level-of-Detail (LOD) to simplify distant nodes.

### Complexity

**High** -- Introducing Three.js is a significant addition to the renderer; the 3D force layout, camera system, and globe rendering are each non-trivial.

### Dependencies

- `three` and `@react-three/fiber` npm packages
- `d3-force-3d` npm package
- MaxMind GeoLite2 database (for IP geolocation)
- Significant new renderer code (separate from existing D3 SVG pipeline)

---

## 16. Geolocation-Aware Connection Mapping

### Description

Resolve the geographic location of every external IP your machine communicates with and display it on an integrated world map. See arcs sweeping from your location to servers in Virginia, Frankfurt, Tokyo, and Sao Paulo. Color-code arcs by latency or traffic volume. Cluster endpoints by country or hosting provider (AWS, Google Cloud, Cloudflare).

### Why It's Cool

You think you are just browsing the web, but your machine is talking to 40 servers across 12 countries. Seeing the physical geography of your digital life is eye-opening. It also reveals unexpected connections -- why is my machine sending data to a server in a country I have no business relationship with?

### Technical Approach

- **GeoIP resolution**: Bundle the MaxMind GeoLite2 City database (~30MB) or use the `geoip-lite` npm package (which embeds a compressed database). Resolve each `ActiveConnectionNode.remoteHost` IP to `{ latitude, longitude, country, city, asn, orgName }`.
- **Map rendering**: Use D3's geographic projection capabilities (`d3.geoNaturalEarth1()` or `d3.geoMercator()`) to render a world map as an SVG layer. Draw great-circle arcs from the user's approximate location to each resolved endpoint using `d3.geoInterpolate()`. Alternatively, use a lightweight map tile renderer or a static SVG world map.
- **Integration with existing graph**: Add a "Map View" tab or a split-pane mode where the force graph sits on the left and the map sits on the right. Hovering a connection node in the graph highlights the corresponding arc on the map (and vice versa). Or overlay the map as a background behind the force graph in a dedicated layout mode.
- **Clustering**: Group connections by country or ASN. Clicking a country cluster expands to show individual endpoints. Show aggregate stats: "United States: 23 connections, 450 Mbps total, avg latency 34ms."
- **Data enrichment**: Look up ASN organization names to label connections with their provider ("Cloudflare", "Amazon AWS", "Google LLC") rather than raw IPs. Use the `asn` field from GeoLite2 or the `whois` command.
- **Type extension**: Add `geo?: { lat: number, lon: number, country: string, city: string, org: string }` to `ActiveConnectionNode`.

### Complexity

**Medium** -- GeoIP lookup is a solved problem; D3 map projection is well-documented; the main effort is the split-view UI and interaction linking.

### Dependencies

- `geoip-lite` npm package or MaxMind GeoLite2 database
- D3 geo projections (already included in `d3` package)
- World map TopoJSON data (publicly available, ~100KB compressed)

---

## Priority Matrix

A rough guide for sequencing these features based on impact vs. effort:

| Priority | Feature                       | Effort   | Impact    | Why This Order                                                                               |
| -------- | ----------------------------- | -------- | --------- | -------------------------------------------------------------------------------------------- |
| 1        | Real-Time Traffic Flow (1)    | Medium   | Very High | Transforms the core visualization; builds on existing connections scanner                    |
| 2        | IoT Device Fingerprinting (3) | Medium   | High      | Immediate "wow" factor; mostly extends existing ARP + Bonjour data                           |
| 3        | Device Interaction (13)       | Low      | High      | Low effort, high utility; makes the app actionable                                           |
| 4        | Latency Heatmap (10)          | Low-Med  | High      | Simple to implement, adds rich new data dimension                                            |
| 5        | Per-Device Bandwidth (4)      | Medium   | High      | Core request; natural next step after traffic flow                                           |
| 6        | Security Threats (6)          | Medium   | High      | High perceived value; mostly logic on existing data                                          |
| 7        | Device Profiling / OS (9)     | Medium   | Medium    | Enriches every node; builds on OUI and Bonjour                                               |
| 8        | DNS Visualization (5)         | Med-High | High      | Visually stunning; requires packet capture                                                   |
| 9        | Export / Reporting (12)       | Medium   | Medium    | Practical utility; makes the app shareable                                                   |
| 10       | Historical Timeline (8)       | High     | Very High | Game-changing feature but significant infrastructure                                         |
| 11       | Subnet Topology (7)           | Medium   | Medium    | Valuable for complex networks                                                                |
| 12       | Packet Inspection (2)         | Medium   | High      | Deep technical feature; foundation for 5, 9, 11. tshark handles protocol dissection natively |
| 13       | Bandwidth Quotas (14)         | Medium   | Medium    | Niche but useful; depends on Feature 4                                                       |
| 14       | Anomaly Detection (11)        | High     | High      | Requires historical data and tuning                                                          |
| 15       | Geo Connection Map (16)       | Medium   | Medium    | Beautiful and informative; standalone feature                                                |
| 16       | 3D Visualization (15)         | High     | Medium    | Impressive but not essential; large dependency surface                                       |

---

## Implementation Notes

### Extending the Scanner System

Every feature that collects new data follows the same pattern established in `src/main/scanners/base.ts`:

```typescript
// Example: new scanner following existing patterns
export class LatencyScanner extends BaseScanner {
  name = 'latency';

  async scan(): Promise<ScanResult> {
    // 1. Get current LAN device IPs from shared state
    // 2. Run ping in parallel with concurrency limit
    // 3. Parse results, update node latency fields
    // 4. Return updated nodes (no new nodes created, just enrichment)
    return { nodes: enrichedNodes, edges: [] };
  }
}
```

Register new scanners in `src/main/services/orchestrator.ts` by adding the scanner instance, a scan interval, and including it in `scanNow()`.

### Extending the Type System

New node fields go in `src/main/types.ts` on the appropriate interface. After modifying, update the renderer copy at `src/renderer/src/types.ts` to match. New signal types require updating the `SignalType` union, the `NetworkNode` discriminated union, the color scale in `visualization/colors.ts`, the angle map in `visualization/force-layout.ts`, and the renderer shapes in `visualization/renderers.ts`.

### Renderer Architecture

D3 owns SVG manipulation. React owns chrome. New visualizations (heatmap overlay, traffic flow animation, map view) should follow this boundary. If a new visualization needs its own SVG layer, add it as a sibling `<svg>` element managed by a dedicated D3 hook, not as React-rendered SVG.

### Permission Model

Features requiring elevated privileges (packet capture, nmap scanning) should degrade gracefully. Detect permission failures, show a clear explanation to the user, and offer the minimum viable alternative (e.g., "Install Wireshark's ChmodBPF package for packet capture, or use basic mode with system commands only").
