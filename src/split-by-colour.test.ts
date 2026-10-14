import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRIPTS } from './scripting';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;
const code = DEFAULT_SCRIPTS.find((s) => s.id === 'builtin-split-colour')!.code;

class FakeImageData {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

const image = (w: number, h: number, px: number[][]): { width: number; height: number; data: Uint8ClampedArray } => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(px.flat()),
});

/** A fake deck with one layer, returning the given source and reference images. */
function fakeDeck(src: ReturnType<typeof image>, ref: ReturnType<typeof image> | null) {
  return {
    activeLayerId: 'L1',
    getImageData: () => src,
    pickImage: vi.fn(async () => ref),
    setImageData: vi.fn(),
    addLayer: vi.fn(() => 'L2'),
    log: vi.fn(),
  };
}

const run = (deck: unknown) => new AsyncFunction('deck', code)(deck);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Split by colour (built-in script)', () => {
  it('sends pixels matching the black reference to layer 1 and the rest to a new layer', async () => {
    vi.stubGlobal('ImageData', FakeImageData);
    // Two pixels: the first is red in the source, black in the reference; the second is blue, white in the reference.
    const src = image(2, 1, [[255, 0, 0, 255], [0, 0, 255, 255]]);
    const ref = image(2, 1, [[0, 0, 0, 255], [255, 255, 255, 255]]);
    const deck = fakeDeck(src, ref);
    await run(deck);

    const [, first] = deck.setImageData.mock.calls[0] as unknown as [string, FakeImageData];
    const [, second] = deck.setImageData.mock.calls[1] as unknown as [string, FakeImageData];
    expect(deck.setImageData.mock.calls[0][0]).toBe('L1');
    expect(deck.setImageData.mock.calls[1][0]).toBe('L2');
    expect(Array.from(first.data)).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
    expect(Array.from(second.data)).toEqual([0, 0, 0, 0, 0, 0, 255, 255]);
    expect(deck.log).toHaveBeenCalledWith('Split: 1 matching pixels');
  });

  it('stops without changing the layer when the picker is cancelled', async () => {
    const deck = fakeDeck(image(1, 1, [[0, 0, 0, 255]]), null);
    await run(deck);
    expect(deck.setImageData).not.toHaveBeenCalled();
    expect(deck.log).toHaveBeenCalledWith('Split cancelled');
  });

  it('refuses a reference of a different size', async () => {
    const deck = fakeDeck(image(2, 1, [[0, 0, 0, 255], [0, 0, 0, 255]]), image(1, 1, [[0, 0, 0, 255]]));
    await expect(run(deck)).rejects.toThrow(/reference is 1×1, but the layer is 2×1/);
    expect(deck.setImageData).not.toHaveBeenCalled();
  });
});
