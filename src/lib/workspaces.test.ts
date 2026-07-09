import { describe, expect, test } from "bun:test";
import { matchWorkspace } from "./workspaces.ts";
import type { WorkspaceConfig } from "../types/index.ts";

const ws = (id: string, name: string): WorkspaceConfig => ({
  workspace_id: id,
  workspace_name: name,
  auth_type: "standard",
  token: "xoxb-test",
  token_type: "bot",
});

// Mirrors a real two-workspace setup: a display-cased name (ImpactForesight)
// and a lowercase-pinned one (launchforce).
const WORKSPACES: Record<string, WorkspaceConfig> = {
  T04B4GFNLE8: ws("T04B4GFNLE8", "ImpactForesight"),
  T0BGD8V44G0: ws("T0BGD8V44G0", "launchforce"),
};

describe("matchWorkspace (case-insensitive id/name resolution)", () => {
  test("exact team id (the map key) resolves", () => {
    expect(matchWorkspace(WORKSPACES, "T04B4GFNLE8")?.workspace_name).toBe("ImpactForesight");
  });

  test("exact name resolves", () => {
    expect(matchWorkspace(WORKSPACES, "ImpactForesight")?.workspace_id).toBe("T04B4GFNLE8");
    expect(matchWorkspace(WORKSPACES, "launchforce")?.workspace_id).toBe("T0BGD8V44G0");
  });

  test("case-insensitive NAME match — the footgun this fixes", () => {
    // `--workspace impactforesight` used to return null (exact-only match).
    expect(matchWorkspace(WORKSPACES, "impactforesight")?.workspace_id).toBe("T04B4GFNLE8");
    expect(matchWorkspace(WORKSPACES, "IMPACTFORESIGHT")?.workspace_id).toBe("T04B4GFNLE8");
    expect(matchWorkspace(WORKSPACES, "LaunchForce")?.workspace_id).toBe("T0BGD8V44G0");
  });

  test("case-insensitive team id match", () => {
    expect(matchWorkspace(WORKSPACES, "t04b4gfnle8")?.workspace_name).toBe("ImpactForesight");
  });

  test("unknown identifier returns null", () => {
    expect(matchWorkspace(WORKSPACES, "nope")).toBeNull();
    expect(matchWorkspace({}, "anything")).toBeNull();
  });

  test("exact match wins over a case-insensitive collision", () => {
    // Pathological: one workspace's id upper-cases another's exact name.
    const collide: Record<string, WorkspaceConfig> = {
      PROD: ws("PROD", "team-a"),
      T2: ws("T2", "prod"),
    };
    // Exact name "prod" -> T2, not the case-folded id "PROD".
    expect(matchWorkspace(collide, "prod")?.workspace_id).toBe("T2");
    // Exact id key "PROD" -> team-a.
    expect(matchWorkspace(collide, "PROD")?.workspace_name).toBe("team-a");
  });
});
