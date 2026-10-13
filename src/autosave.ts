import { parseProject, serializeProject, type ImageCodec, type Project, type Saveable } from './project';

/** Where the open tabs are kept between page loads. Browser-only, so storage can fail. */
export const AUTOSAVE_KEY = 'visual-deck:autosave';

const FORMAT = 'visual-deck-autosave';
const VERSION = 1;

interface SessionFile {
  format: typeof FORMAT;
  version: number;
  /** Index of the tab that was active. */
  active: number;
  /** Each open workspace as a project file (see project.ts). */
  projects: string[];
}

/** Every open workspace, as project files, plus which tab was active. */
export function serializeSession(workspaces: Saveable[], active: number, codec: ImageCodec): string {
  const file: SessionFile = {
    format: FORMAT,
    version: VERSION,
    active,
    projects: workspaces.map((ws) => serializeProject(ws, codec)),
  };
  return JSON.stringify(file);
}

export async function parseSession(text: string, codec: ImageCodec): Promise<{ projects: Project[]; active: number }> {
  let file: Partial<SessionFile>;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('Not an autosaved session');
  }
  if (file.format !== FORMAT || !Array.isArray(file.projects) || file.projects.length === 0) {
    throw new Error('Not an autosaved session');
  }
  if ((file.version ?? 0) > VERSION) throw new Error('The autosaved session was written by a newer version');

  const projects = await Promise.all(file.projects.map((p) => parseProject(p, codec)));
  const active = Math.min(Math.max(file.active ?? 0, 0), projects.length - 1);
  return { projects, active };
}
