import { useEffect, useId, useRef } from 'react';
import type { RefObject } from 'react';

const MAP_SCALE = 2;
const DISPLACEMENT = 38;

function displacementMap(width: number, height: number, radius: number, bevel: number): string | undefined {
  const map = document.createElement('canvas');
  map.width = Math.ceil(width / MAP_SCALE);
  map.height = Math.ceil(height / MAP_SCALE);
  const context = map.getContext('2d');
  if (!context) return;
  const pixels = context.createImageData(map.width, map.height);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corner = Math.min(radius, halfWidth, halfHeight);

  for (let row = 0; row < map.height; row++) {
    const y = (row + .5) * height / map.height - halfHeight;
    for (let col = 0; col < map.width; col++) {
      const x = (col + .5) * width / map.width - halfWidth;
      const dx = Math.abs(x) - halfWidth + corner;
      const dy = Math.abs(y) - halfHeight + corner;
      const cornerX = Math.max(dx, 0);
      const cornerY = Math.max(dy, 0);
      const length = Math.hypot(cornerX, cornerY);
      const distance = corner - length - Math.min(Math.max(dx, dy), 0);
      const offset = (row * map.width + col) * 4;
      pixels.data[offset] = 128;
      pixels.data[offset + 1] = 128;
      pixels.data[offset + 3] = 255;

      if (distance < 0 || distance >= bevel) continue;
      // The rounded rectangle's normal follows the straight sides and rotates
      // through each corner. The bevel pulls the sample inward, then eases to neutral.
      const normalX = length ? cornerX / length : Number(dx > dy);
      const normalY = length ? cornerY / length : Number(dy >= dx);
      const depth = 1 - distance / bevel;
      const bend = 126 * depth * depth * (3 - 2 * depth);
      pixels.data[offset] -= Math.sign(x) * normalX * bend;
      pixels.data[offset + 1] -= Math.sign(y) * normalY * bend;
    }
  }
  context.putImageData(pixels, 0, 0);
  return map.toDataURL();
}

/**
 * SVG backdrop displacement currently composites reliably in Chromium.
 * Canvas holds only the geometry map. The compositor supplies live backdrop pixels.
 */
export function GlassLens({ surface, enabled, bevel = 17 }: {
  surface: RefObject<HTMLElement | null>;
  enabled: boolean;
  bevel?: number;
}) {
  const id = `glass-${useId().replace(/[^\w-]/g, '')}`;
  const image = useRef<SVGFEImageElement>(null);
  const active = enabled && /\b(?:Chrome|HeadlessChrome|Chromium)\//.test(navigator.userAgent) &&
    CSS.supports('backdrop-filter', 'url("#lens") blur(2px)');

  useEffect(() => {
    const target = surface.current;
    const mapImage = image.current;
    if (!active || !target || !mapImage) return;

    let previous = '';
    const observer = new ResizeObserver(() => {
      const { offsetWidth: width, offsetHeight: height } = target;
      if (!width || !height) return;
      const radius = Number.parseFloat(getComputedStyle(target).borderTopLeftRadius);
      const key = `${width}:${height}:${radius}`;
      if (key === previous) return;
      previous = key;
      const source = displacementMap(width, height, radius, bevel);
      if (!source) return;
      mapImage.setAttribute('href', source);
      target.style.setProperty('--glass-lens', `url("#${id}")`);
    });
    observer.observe(target, { box: 'border-box' });
    return () => {
      observer.disconnect();
      target.style.removeProperty('--glass-lens');
    };
  }, [surface, active, id, bevel]);

  if (!active) return null;
  return (
    <svg className="glass-filter-definitions" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage ref={image} width="100%" height="100%" preserveAspectRatio="none" result="bevel" />
          <feDisplacementMap in="SourceGraphic" in2="bevel" scale={DISPLACEMENT} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
