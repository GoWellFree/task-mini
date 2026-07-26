import { supabase } from "../lib/supabase.js";
import type { Project } from "../types/index.js";

/** Raw projects table access. No business logic, no auth checks. */

export async function listProjectsForWorkspace(workspaceId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { data } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  return (data as Project | null) ?? null;
}

export interface NewProjectInput {
  workspace_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  owner_id: string;
  status?: Project["status"];
  start_at: string | null;
  due_at: string | null;
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...input, status: input.status ?? "planning" })
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Insert returned no row");
  return data as Project;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Update returned no row");
  return data as Project;
}
