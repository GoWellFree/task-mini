import { supabase } from "../lib/supabase.js";
import type { TaskAttachment, TaskAttachmentWithUploader } from "../types/index.js";

/** Raw task_attachments table access. No business logic, no auth checks, no Storage I/O — see attachmentService for that. */

export async function listForTask(taskId: string): Promise<TaskAttachmentWithUploader[]> {
  const { data, error } = await supabase
    .from("task_attachments")
    .select("*, uploader:users(id, username, first_name, last_name, telegram_id)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as TaskAttachmentWithUploader[];
}

export async function getById(id: string): Promise<TaskAttachment | null> {
  const { data } = await supabase.from("task_attachments").select("*").eq("id", id).maybeSingle();
  return (data as TaskAttachment | null) ?? null;
}

export async function create(row: {
  id: string;
  taskId: string;
  uploaderId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
}): Promise<TaskAttachment> {
  const { data, error } = await supabase
    .from("task_attachments")
    .insert({
      id: row.id,
      task_id: row.taskId,
      uploader_id: row.uploaderId,
      file_name: row.fileName,
      file_size: row.fileSize,
      mime_type: row.mimeType,
      storage_path: row.storagePath,
    })
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Insert returned no row");
  return data as TaskAttachment;
}

export async function remove(id: string): Promise<void> {
  const { error } = await supabase.from("task_attachments").delete().eq("id", id);
  if (error) throw error;
}
