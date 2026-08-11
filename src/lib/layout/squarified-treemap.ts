export type Rect = { x: number; y: number; width: number; height: number };
export type WeightedItem<T> = { id: T; weight: number };

/**
 * Squarified treemap: place items proportionally to `weight` inside a
 * container, keeping rectangles as close to square as possible. Used to
 * turn a room's target surface area into a believable rectangle within
 * a level's footprint, without hardcoding a layout template per room count.
 */
export function layoutRects<T>(
  items: WeightedItem<T>[],
  container: Rect
): Map<T, Rect> {
  const result = new Map<T, Rect>();
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (items.length === 0 || totalWeight <= 0) return result;

  const scale = (container.width * container.height) / totalWeight;
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  squarify(sorted.map((i) => ({ id: i.id, area: i.weight * scale })), container, result);
  return result;
}

function squarify<T>(
  items: { id: T; area: number }[],
  container: Rect,
  result: Map<T, Rect>
): void {
  if (items.length === 0) return;

  const shortSide = Math.min(container.width, container.height);
  let row: { id: T; area: number }[] = [items[0]];
  let bestRow = row;
  let bestWorst = worstAspectRatio(row, shortSide);

  let i = 1;
  for (; i < items.length; i++) {
    const candidate = [...row, items[i]];
    const candidateWorst = worstAspectRatio(candidate, shortSide);
    if (candidateWorst <= bestWorst) {
      row = candidate;
      bestWorst = candidateWorst;
      bestRow = row;
    } else {
      break;
    }
  }

  const remaining = items.slice(bestRow.length);
  const rowArea = bestRow.reduce((s, r) => s + r.area, 0);

  const horizontal = container.width >= container.height;
  const rowThickness = horizontal ? rowArea / container.height : rowArea / container.width;

  let offset = 0;
  for (const it of bestRow) {
    const itemLength = horizontal
      ? it.area / rowThickness
      : it.area / rowThickness;
    const rect: Rect = horizontal
      ? { x: container.x, y: container.y + offset, width: rowThickness, height: itemLength }
      : { x: container.x + offset, y: container.y, width: itemLength, height: rowThickness };
    result.set(it.id, rect);
    offset += itemLength;
  }

  const nextContainer: Rect = horizontal
    ? {
        x: container.x + rowThickness,
        y: container.y,
        width: container.width - rowThickness,
        height: container.height,
      }
    : {
        x: container.x,
        y: container.y + rowThickness,
        width: container.width,
        height: container.height - rowThickness,
      };

  squarify(remaining, nextContainer, result);
}

function worstAspectRatio<T>(row: { id: T; area: number }[], shortSide: number): number {
  const sum = row.reduce((s, r) => s + r.area, 0);
  const max = Math.max(...row.map((r) => r.area));
  const min = Math.min(...row.map((r) => r.area));
  return Math.max(
    (shortSide * shortSide * max) / (sum * sum),
    (sum * sum) / (shortSide * shortSide * min)
  );
}
