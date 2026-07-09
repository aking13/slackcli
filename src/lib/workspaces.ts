import { mkdir, readFile, writeFile, exists } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { WorkspacesData, WorkspaceConfig } from '../types/index.ts';
import { error } from './formatter.ts';

const CONFIG_DIR = join(homedir(), '.config', 'slackcli');
const WORKSPACES_FILE = join(CONFIG_DIR, 'workspaces.json');

// Ensure config directory exists
async function ensureConfigDir(): Promise<void> {
  if (!await exists(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// Load workspaces data
export async function loadWorkspaces(): Promise<WorkspacesData> {
  await ensureConfigDir();
  
  if (!await exists(WORKSPACES_FILE)) {
    return { workspaces: {} };
  }
  
  try {
    const data = await readFile(WORKSPACES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading workspaces:', error);
    return { workspaces: {} };
  }
}

// Save workspaces data
export async function saveWorkspaces(data: WorkspacesData): Promise<void> {
  await ensureConfigDir();
  await writeFile(WORKSPACES_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// Add or update a workspace
export async function addWorkspace(config: WorkspaceConfig): Promise<void> {
  const data = await loadWorkspaces();
  
  data.workspaces[config.workspace_id] = config;
  
  // Set as default if it's the first workspace
  if (!data.default_workspace) {
    data.default_workspace = config.workspace_id;
  }
  
  await saveWorkspaces(data);
}

// Remove a workspace
export async function removeWorkspace(workspaceId: string): Promise<void> {
  const data = await loadWorkspaces();
  
  if (!data.workspaces[workspaceId]) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  
  delete data.workspaces[workspaceId];
  
  // Update default if we removed it
  if (data.default_workspace === workspaceId) {
    const remainingIds = Object.keys(data.workspaces);
    data.default_workspace = remainingIds.length > 0 ? remainingIds[0] : undefined;
  }
  
  await saveWorkspaces(data);
}

// Set default workspace
export async function setDefaultWorkspace(workspaceId: string): Promise<void> {
  const data = await loadWorkspaces();
  
  if (!data.workspaces[workspaceId]) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  
  data.default_workspace = workspaceId;
  await saveWorkspaces(data);
}

// Resolve a workspace by id or name against an already-loaded map. Exact
// matches win (id key, then name); a case-insensitive id/name match is the
// fallback so `--workspace launchforce` or a lowercased team id resolves like
// the canonical form — case never disambiguates two real Slack workspaces, so
// this only turns a would-be "not found" into the obvious match. Pure, so the
// resolution rules are unit-tested without touching the config file.
export function matchWorkspace(
  workspaces: Record<string, WorkspaceConfig>,
  identifier: string
): WorkspaceConfig | null {
  // Exact id (the map key) wins.
  if (workspaces[identifier]) {
    return workspaces[identifier];
  }
  const values = Object.values(workspaces);
  // Then an exact name.
  const exactName = values.find(w => w.workspace_name === identifier);
  if (exactName) {
    return exactName;
  }
  // Case-insensitive fallback on id or name.
  const lower = identifier.toLowerCase();
  return values.find(
    w => w.workspace_id.toLowerCase() === lower
      || w.workspace_name.toLowerCase() === lower
  ) ?? null;
}

// Get workspace by ID or name
export async function getWorkspace(identifier?: string): Promise<WorkspaceConfig | null> {
  const data = await loadWorkspaces();
  
  // If no identifier, return default workspace
  if (!identifier) {
    if (!data.default_workspace) {
      return null;
    }
    return data.workspaces[data.default_workspace] || null;
  }
  
  return matchWorkspace(data.workspaces, identifier);
}

// Get all workspaces
export async function getAllWorkspaces(): Promise<WorkspaceConfig[]> {
  const data = await loadWorkspaces();
  return Object.values(data.workspaces);
}

// Clear all workspaces
export async function clearAllWorkspaces(): Promise<void> {
  await saveWorkspaces({ workspaces: {} });
}

// Get default workspace ID
export async function getDefaultWorkspaceId(): Promise<string | undefined> {
  const data = await loadWorkspaces();
  return data.default_workspace;
}

// Writes (sending a message, creating/deleting a draft) are workspace-
// specific. When more than one workspace is authenticated, refuse to silently
// fall back to the default and require an explicit --workspace so the target
// is never ambiguous. No-op with a single workspace or when --workspace is
// provided.
export async function requireExplicitWorkspace(workspace?: string): Promise<void> {
  if (workspace) {
    return;
  }
  const workspaces = await getAllWorkspaces();
  if (workspaces.length > 1) {
    error(
      'Multiple workspaces are authenticated, so --workspace <id|name> is '
      + 'required. Available: '
      + workspaces.map((w) => `${w.workspace_name} (${w.workspace_id})`).join(', ')
    );
    process.exit(1);
  }
}
