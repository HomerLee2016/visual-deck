// Split the active layer into two layers using a reference image.
// Pixels where the reference matches KEY_COLOUR go to the first layer; all other pixels go to a new "Rest" layer.
// Both layers keep the original pixels, transparent where they do not belong.
// The reference must be the same size as the layer.
const KEY_COLOUR = '#000000';
const TOLERANCE = 0; // largest allowed difference per channel (0-255)

const ref = await deck.pickImage();
if (!ref) {
  deck.log('Split cancelled');
  return;
}
const src = deck.getImageData();
if (ref.width !== src.width || ref.height !== src.height) {
  throw new Error(`the reference is ${ref.width}×${ref.height}, but the layer is ${src.width}×${src.height}`);
}
const key = [1, 3, 5].map((i) => parseInt(KEY_COLOUR.slice(i, i + 2), 16));
const a = new ImageData(src.width, src.height);
const b = new ImageData(src.width, src.height);
const s = src.data;
const r = ref.data;
let matched = 0;
for (let i = 0; i < s.length; i += 4) {
  const isKey =
    Math.abs(r[i] - key[0]) <= TOLERANCE &&
    Math.abs(r[i + 1] - key[1]) <= TOLERANCE &&
    Math.abs(r[i + 2] - key[2]) <= TOLERANCE;
  const out = isKey ? a.data : b.data;
  out[i] = s[i];
  out[i + 1] = s[i + 1];
  out[i + 2] = s[i + 2];
  out[i + 3] = s[i + 3];
  if (isKey) matched++;
}
deck.setImageData(deck.activeLayerId, a);
const rest = deck.addLayer('Rest');
deck.setImageData(rest, b);
deck.log(`Split: ${matched} matching pixels`);
