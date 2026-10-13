import type { Workspace } from '../model';

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Panels read the active workspace through this, so they never hold a stale one across tab switches. */
export type ActiveWorkspace = () => Workspace;
