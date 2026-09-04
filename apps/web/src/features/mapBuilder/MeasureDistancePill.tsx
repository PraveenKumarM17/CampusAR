import { measureLabelRotationDeg } from './indoorArMeasure';

type ScreenPt = { x: number; y: number };

/** iOS Measure-style white pill + chevron, rotated to the segment. */
export function MeasureDistancePill({
  from,
  to,
  label,
}: {
  from: ScreenPt;
  to: ScreenPt;
  label: string;
}) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const rotate = measureLabelRotationDeg(from, to);

  return (
    <div
      className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center"
      style={{ left: midX, top: midY, transform: `translate(-50%, -50%) rotate(${rotate}deg)` }}
    >
      <span className="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink shadow-md">
        {label}
      </span>
      <span
        className="-ml-0.5 h-0 w-0 border-y-[6px] border-l-[8px] border-y-transparent border-l-white drop-shadow-sm"
        aria-hidden
      />
    </div>
  );
}
