import { itemsIn } from './arrange';
import { mapItems } from './model';
import type { Definition, DocState, Item, Style } from './types';

type Defs = NonNullable<DocState['defs']>;

const styleOf = (it: Item): Style | undefined => ('style' in it ? it.style : undefined);

/** Put a definition's value into a style: the fill or the stroke, as a colour or a gradient. */
function applyDef(style: Style, which: 'fill' | 'stroke', def: Definition): Style {
  if (which === 'fill') {
    return def.kind === 'color' ? { ...style, fill: def.color, fillGradient: undefined } : { ...style, fillGradient: def.gradient, fill: undefined };
  }
  return def.kind === 'color' ? { ...style, color: def.color, strokeGradient: undefined } : { ...style, strokeGradient: def.gradient };
}

/** One item with its shared references replaced by their values. */
export function resolveItem(it: Item, defs: Defs): Item {
  if (it.kind === 'group') return { ...it, items: it.items.map((c) => resolveItem(c, defs)) };
  const style = styleOf(it);
  if (!style || (!style.fillRef && !style.strokeRef)) return it;
  let next = style;
  const fillDef = style.fillRef ? defs[style.fillRef] : undefined;
  const strokeDef = style.strokeRef ? defs[style.strokeRef] : undefined;
  if (fillDef) next = applyDef(next, 'fill', fillDef);
  if (strokeDef) next = applyDef(next, 'stroke', strokeDef);
  return { ...it, style: next } as Item;
}

/**
 * Every item's shared references replaced by the values they point to, so
 * drawing and export see plain paint. Returns `s` itself when nothing is shared.
 */
export function resolveDefs(s: DocState): DocState {
  const defs = s.defs;
  if (!defs || Object.keys(defs).length === 0) return s;
  return { ...s, layers: s.layers.map((l) => ({ ...l, items: l.items.map((it) => resolveItem(it, defs)) })) };
}

/** A new definition id that no existing one uses. */
export function newDefId(defs: Defs | undefined): string {
  let n = Object.keys(defs ?? {}).length + 1;
  while (defs && `d${n}` in defs) n++;
  return `d${n}`;
}

/**
 * Make the selection's fill or stroke a shared definition, taken from the first
 * selected item that has one. Items keep working as before, but editing the
 * definition later changes all of them.
 */
export function shareStyle(s: DocState, ids: ReadonlySet<string>, which: 'fill' | 'stroke'): DocState {
  const source = itemsIn(s, ids).find((it) => {
    const st = styleOf(it);
    return st && (which === 'fill' ? st.fill || st.fillGradient : st.color || st.strokeGradient);
  });
  const st = source && styleOf(source);
  if (!st) return s;
  const def: Definition | null =
    which === 'fill'
      ? st.fillGradient
        ? { kind: 'gradient', gradient: st.fillGradient }
        : st.fill
          ? { kind: 'color', color: st.fill }
          : null
      : st.strokeGradient
        ? { kind: 'gradient', gradient: st.strokeGradient }
        : { kind: 'color', color: st.color };
  if (!def) return s;
  const id = newDefId(s.defs);
  const key = which === 'fill' ? 'fillRef' : 'strokeRef';
  const mapped = mapItems(s, ids, (it) => {
    const style = styleOf(it);
    if (!style) return it;
    const plain = which === 'fill' ? { fill: undefined, fillGradient: undefined } : { strokeGradient: undefined };
    return { ...it, style: { ...style, ...plain, [key]: id } } as Item;
  });
  return { ...mapped, defs: { ...s.defs, [id]: def } };
}

/** Replace the selection's shared references with their values, leaving the definitions in place. */
export function unshareStyle(s: DocState, ids: ReadonlySet<string>): DocState {
  const defs = s.defs ?? {};
  return mapItems(s, ids, (it) => {
    const resolved = resolveItem(it, defs);
    const style = styleOf(resolved);
    if (!style || resolved === it) return it;
    return { ...resolved, style: { ...style, fillRef: undefined, strokeRef: undefined } } as Item;
  });
}

/** Change a shared definition; every item that uses it follows. */
export function updateDefinition(s: DocState, id: string, def: Definition): DocState {
  if (!s.defs || !(id in s.defs)) return s;
  return { ...s, defs: { ...s.defs, [id]: def } };
}

/**
 * Instances show their symbol's current content: each instance's children are
 * replaced by the symbol's items, so editing the symbol changes every instance.
 */
export function resolveSymbols(s: DocState): DocState {
  const symbols = s.symbols;
  if (!symbols || Object.keys(symbols).length === 0) return s;
  const show = (it: Item): Item => {
    if (it.kind !== 'group') return it;
    const content = it.symbolId ? symbols[it.symbolId] : undefined;
    return { ...it, items: (content ?? it.items).map(show) };
  };
  return { ...s, layers: s.layers.map((l) => ({ ...l, items: l.items.map(show) })) };
}
