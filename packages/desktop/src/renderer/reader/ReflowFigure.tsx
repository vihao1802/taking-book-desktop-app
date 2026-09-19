import { memo, useEffect, useRef, useState } from 'react';
import type { PositionedReflowImage } from '@taking-book/core';
import {
  ImageBitmapDecoder,
  ImageUrlCache,
  IMAGE_URL_CACHE_SIZE,
  type ImageDecoder,
} from './reflowImages';

const URL_CACHE = new ImageUrlCache(IMAGE_URL_CACHE_SIZE);
const DEFAULT_DECODER: ImageDecoder = new ImageBitmapDecoder();

interface ReflowFigureProps {
  image: PositionedReflowImage;
  zoom: number;
  fileHash: string;
  getImageData: (pageIndex: number, ref: string) => Promise<unknown>;
  decoder?: ImageDecoder;
}

/**
 * Renders one reflow figure at its PDF size scaled by zoom (never larger than
 * the viewport). Pixel data is fetched and decoded only once the figure is near
 * the viewport, and the decoded object URL is shared through the bounded cache
 * so off-screen figures cost no decoded memory.
 */
export const ReflowFigure = memo(function ReflowFigure({
  image,
  zoom,
  fileHash,
  getImageData,
  decoder = DEFAULT_DECODER,
}: ReflowFigureProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [src, setSrc] = useState<string | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = URL_CACHE.get(fileHash, image.ref);
    if (cached) {
      setSrc(cached);
      setState('ready');
      return;
    }
    const holder = holderRef.current;
    if (!holder) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setState('loading');
        void (async () => {
          try {
            const obj = await getImageData(image.pageIndex, image.ref);
            if (obj === undefined || !decoder.canDecode(obj)) {
              setState('error');
              return;
            }
            const blob = await decoder.decode(obj);
            // The same ref can be on screen twice; if another figure finished
            // first, reuse its URL rather than leaking a second one.
            const url =
              URL_CACHE.get(fileHash, image.ref) ?? URL.createObjectURL(blob);
            URL_CACHE.set(fileHash, image.ref, url);
            setSrc(url);
            setState('ready');
          } catch (err) {
            console.warn(`Reflow figure ${image.ref} failed to load:`, err);
            setState('error');
          }
        })();
      },
      { rootMargin: '300px' },
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [image, fileHash, getImageData, decoder]);

  const boxStyle = {
    width: image.width * zoom,
    aspectRatio: `${image.width} / ${image.height}`,
  };

  return (
    <div ref={holderRef} className="my-6 flex justify-center">
      {state === 'ready' && src ? (
        <img
          src={src}
          alt=""
          className="h-auto max-w-full rounded-sm"
          style={boxStyle}
        />
      ) : (
        <div className="max-w-full bg-muted/60" aria-hidden style={boxStyle} />
      )}
    </div>
  );
});