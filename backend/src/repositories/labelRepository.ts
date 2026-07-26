import { ERROR_CODES } from "@task-mini/shared";
import { supabase } from "../lib/supabase.js";
import { ApiError } from "../lib/apiError.js";
import type { Label } from "../types/index.js";

/** Raw labels table access. No business logic beyond translating the table's own unique constraint. */

const UNIQUE_VIOLATION = "23505";

export async function listLabelsForWorkspace(workspaceId: string): Promise<Label[]> {
  const { data, error } = await supabase
    .from("labels")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Label[];
}

export async function getLabelById(id: string): Promise<Label | null> {
  const { data } = await supabase.from("labels").select("*").eq("id", id).maybeSingle();
  return (data as Label | null) ?? null;
}

export async function createLabel(workspaceId: string, name: string, color: string | null): Promise<Label> {
  const { data, error } = await supabase
    .from("labels")
    .insert({ workspace_id: workspaceId, name, color })
    .select("*")
    .single();

  if (error) {
    // (workspace_id, name) is unique — surface this as the specific,
    // expected condition it is rather than a generic 500.
    if (error.code === UNIQUE_VIOLATION) throw new ApiError(ERROR_CODES.LABEL_NAME_TAKEN);
    throw error;
  }
  return data as Label;
}

export async function updateLabel(id: string, updates: Partial<Pick<Label, "name" | "color">>): Promise<Label> {
  const { data, error } = await supabase.from("labels").update(updates).eq("id", id).select("*").single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new ApiError(ERROR_CODES.LABEL_NAME_TAKEN);
    throw error;
  }
  if (!data) throw new Error("Update returned no row");
  return data as Label;
}

export async function deleteLabel(id: string): Promise<void> {
  const { error } = await supabase.from("labels").delete().eq("id", id);
  if (error) throw error;
}
