import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Html } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import type { Building, CrowdLevel, DangerZone, GraphEdge, GraphNode } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useCampusLive } from '../../hooks/useCampusLive';

const ORIGIN = { lat: 37.7748, lon: -122.419 };

function toLocal(lat: number, lon: number): [number, number] {
  const x = (lon - ORIGIN.lon) * 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
  const z = (lat - ORIGIN.lat) * 110_540;
  return [x, -z];
}

function crowdColor(score: number): string {
  if (score < 0.33) return '#3ddeb5';
  if (score < 0.66) return '#f0a35e';
  return '#f07178';
}

function BuildingMesh({ b }: { b: Building }) {
  const [x, z] = toLocal(b.latitude, b.longitude);
  const h = Math.max(4, b.floorsCount * 3.2);
  return (
    <group position={[x, h / 2, z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[14, h, 10]} />
        <meshStandardMaterial color="#1c3a5f" metalness={0.2} roughness={0.65} />
      </mesh>
      <Html distanceFactor={40} position={[0, h / 2 + 1.5, 0]} center>
        <div className="rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap">
          {b.code}
        </div>
      </Html>
    </group>
  );
}

function EdgePath({ from, to, intensity }: { from: GraphNode; to: GraphNode; intensity: number }) {
  const [x1, z1] = toLocal(from.latitude, from.longitude);
  const [x2, z2] = toLocal(to.latitude, to.longitude);
  const mid: [number, number, number] = [(x1 + x2) / 2, 0.4, (z1 + z2) / 2];
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz) || 0.1;
  const angle = Math.atan2(dx, dz);
  return (
    <mesh position={mid} rotation={[0, angle, 0]}>
      <boxGeometry args={[0.6, 0.25, len]} />
      <meshStandardMaterial
        color={crowdColor(intensity)}
        emissive={crowdColor(intensity)}
        emissiveIntensity={0.25}
      />
    </mesh>
  );
}

function HazardMarker({ z }: { z: DangerZone }) {
  const [x, zz] = toLocal(z.latitude, z.longitude);
  const r = Math.max(4, z.radiusM / 4);
  return (
    <mesh position={[x, 0.2, zz]}>
      <cylinderGeometry args={[r, r, 0.3, 24]} />
      <meshStandardMaterial
        color={z.type === 'fire' ? '#f07178' : '#f0a35e'}
        transparent
        opacity={0.35}
      />
    </mesh>
  );
}

function TwinScene({
  buildings,
  nodes,
  edges,
  crowd,
  zones,
}: {
  buildings: Building[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  crowd: CrowdLevel[];
  zones: DangerZone[];
}) {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const crowdByEdge = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of crowd) if (c.edgeId) m.set(c.edgeId, c.intensity);
    for (const e of edges) if (!m.has(e.id)) m.set(e.id, e.crowdScore);
    return m;
  }, [crowd, edges]);

  return (
    <>
      <color attach="background" args={['#070b14']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[40, 60, 20]} intensity={1.1} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#0d1524" />
      </mesh>
      <gridHelper args={[200, 40, '#1e2a40', '#121a2a']} position={[0, 0.05, 0]} />
      {buildings.map((b) => (
        <BuildingMesh key={b.id} b={b} />
      ))}
      {edges.map((e) => {
        const from = nodeById.get(e.fromNodeId);
        const to = nodeById.get(e.toNodeId);
        if (!from || !to) return null;
        return (
          <EdgePath
            key={e.id}
            from={from}
            to={to}
            intensity={crowdByEdge.get(e.id) ?? e.crowdScore}
          />
        );
      })}
      {zones
        .filter((z) => z.active)
        .map((z) => (
          <HazardMarker key={z.id} z={z} />
        ))}
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={20} maxDistance={180} />
    </>
  );
}

export function TwinPage() {
  const token = useAuthStore((s) => s.accessToken);
  const live = useCampusLive();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [crowd, setCrowd] = useState<CrowdLevel[]>([]);

  useEffect(() => {
    Promise.all([
      api.buildings(token),
      api.nodes(token),
      api.edges(token),
      api.zones(),
      api.iotCrowd().catch(() => [] as CrowdLevel[]),
    ]).then(([b, n, e, z, c]) => {
      setBuildings(b);
      setNodes(n);
      setEdges(e);
      setZones(z);
      setCrowd(c);
    });
  }, [token]);

  useEffect(() => {
    if (live.crowd.length) setCrowd(live.crowd);
    if (live.zones.length) setZones(live.zones);
  }, [live.crowd, live.zones]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Digital Twin</h1>
          <p className="text-sm text-white/60">
            Live campus replica with crowd heat and hazard overlays.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg glass px-3 py-2">
            WS: {live.connected ? 'live' : 'reconnecting…'}
          </span>
          <span className="rounded-lg glass px-3 py-2">
            Simulator: {live.status?.running ? 'on' : 'off'}
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-[#3ddeb5]" /> light
            <span className="h-2 w-2 rounded-full bg-[#f0a35e]" /> moderate
            <span className="h-2 w-2 rounded-full bg-[#f07178]" /> heavy
          </span>
        </div>
      </div>
      <div className="h-[70vh] overflow-hidden rounded-3xl border border-white/10 bg-ink-950">
        <Canvas camera={{ position: [45, 55, 55], fov: 45 }} shadows>
          <TwinScene
            buildings={buildings}
            nodes={nodes}
            edges={edges}
            crowd={crowd}
            zones={zones}
          />
          <Text position={[0, 28, -70]} fontSize={3} color="#7ec0ff" anchorX="center">
            Smart Campus Twin
          </Text>
        </Canvas>
      </div>
    </div>
  );
}
