import { IOT_TICK_MS, type CrowdLevel, type IotStatus, type SensorReading } from '@campusar/shared';
import { campusRepository } from '../repositories/campusRepository';
import { siteRepository } from '../repositories/siteRepository';
import { broadcast } from '../realtime/wsHub';
import { env } from '../config/env';
import { diurnalCrowdFactor } from '../../domain/prediction/diurnal';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function noise(scale = 0.08): number {
  return (Math.random() - 0.5) * 2 * scale;
}

function labelFor(intensity: number): string {
  if (intensity < 0.33) return 'light';
  if (intensity < 0.66) return 'moderate';
  return 'heavy';
}

class IoTSimulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastTickAt: string | null = null;
  private ewma = new Map<string, number>();

  status(): IotStatus {
    return {
      running: this.timer !== null,
      intervalMs: IOT_TICK_MS,
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
    };
  }

  start(): IotStatus {
    if (this.timer) return this.status();
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, IOT_TICK_MS);
    broadcast('iot_status', this.status());
    return this.status();
  }

  stop(): IotStatus {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    broadcast('iot_status', this.status());
    return this.status();
  }

  async tick(): Promise<void> {
    const sites = await siteRepository.listActive();
    const targets = sites.length > 0 ? sites : [];
    this.tickCount += 1;
    this.lastTickAt = new Date().toISOString();
    if (targets.length === 0) {
      broadcast('iot_status', this.status());
      return;
    }

    for (const site of targets) {
      const edges = await campusRepository.listEdges(site.id);
      const buildings = await campusRepository.listBuildings(site.id);
      const base = diurnalCrowdFactor();
      const levels: Array<{
        edgeId: string | null;
        nodeId: string | null;
        intensity: number;
        label: string | null;
      }> = [];

      for (const edge of edges) {
        const bias = (edge.id.charCodeAt(0) % 7) / 20;
        const raw = clamp01(base + bias + noise());
        const prev = this.ewma.get(edge.id) ?? raw;
        const smoothed = clamp01(0.65 * prev + 0.35 * raw);
        this.ewma.set(edge.id, smoothed);
        const label = labelFor(smoothed);
        await campusRepository.upsertCrowdByEdge(edge.id, smoothed, label);
        levels.push({ edgeId: edge.id, nodeId: null, intensity: smoothed, label });
      }

      const sensors: SensorReading[] = [];
      for (const b of buildings) {
        const zoneKey = b.code;
        const occupancy = clamp01(base + noise(0.1));
        const temp = 22 + base * 4 + noise(1.2);
        const humidity = 45 + base * 15 + noise(3);
        const aqi = 35 + base * 40 + noise(5);
        const batch: Array<{ kind: SensorReading['kind']; value: number }> = [
          { kind: 'occupancy', value: Math.round(occupancy * 100) / 100 },
          { kind: 'temperature', value: Math.round(temp * 10) / 10 },
          { kind: 'humidity', value: Math.round(humidity * 10) / 10 },
          { kind: 'aqi', value: Math.round(aqi) },
        ];
        for (const s of batch) {
          const reading = await campusRepository.insertSensorReading({
            zoneKey,
            buildingId: b.id,
            kind: s.kind,
            value: s.value,
          });
          sensors.push(reading);
        }
      }

      broadcast('crowd', { levels }, site.id);
      broadcast('sensors', { readings: sensors.slice(-Math.max(buildings.length, 1) * 4) }, site.id);
    }
    broadcast('iot_status', this.status());
  }

  getEwma(edgeId: string): number | undefined {
    return this.ewma.get(edgeId);
  }

  getAllEwma(): Map<string, number> {
    return new Map(this.ewma);
  }
}

export const iotSimulator = new IoTSimulator();

export function maybeStartIotSimulator(): void {
  if (env.iotSimulator) {
    iotSimulator.start();
    console.log(`IoT simulator started (every ${IOT_TICK_MS}ms)`);
  }
}

export type { CrowdLevel };
