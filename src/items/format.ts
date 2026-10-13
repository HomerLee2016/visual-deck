/** SVG number and text formatting shared by the item modules. */
export const num = (v: number) => String(Math.round(v * 1000) / 1000);
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
