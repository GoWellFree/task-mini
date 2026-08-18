import crypto from "node:crypto";
import { ERROR_CODES } from "@task-mini/shared";
import { supabase } from "../lib/supabase.js";
import { ApiError } from "../lib/apiError.js";
import * as taskAttachmentRepository from "../repositories/taskAttachmentRepository.js";
import type { TaskAttachment } from "../types/index.js";

const BUCKET = "task-attachments";
const SIGNED_URL_TTL_SECONDS = 60;
const UNSAFE_STORAGE_KEY_CHARS = /[^A-Za-z0-9._]/g;

/** Strip anything that isn't a safe filename character so the original name can't inject path segments into the storage key. */
function sanitizeFileName(name: string): string {
  const trimmed = name.trim().slice(-180);
  return trimmed.replace(UNSAFE_STORAGE_KEY_CHARS, "_");
}

/**
 * Multer/busboy decode multipart header fields (including the filename) as
 * latin1 per the old RFC 2388 default, but every real client actually sends
 * UTF-8 bytes there — without this round-trip, any non-ASCII filename (e.g.
 * Cyrillic) comes out as mojibake.
 */
function decodeOriginalName(name: string): string {
  return Buffer.from(name, "latin1").toString("utf8");
}

/**
 * Uploads to Storage first, then records the metadata row — if the DB
 * insert fails we're left with an orphaned blob (harmless, just unused
 * space) rather than a DB row pointing at a file that was never written.
 */
export async function uploadAttachment(
  taskId: string,
  uploaderId: string,
  file: { buffer: Buffer; originalname: string; size: number; mimetype: string },
): Promise<TaskAttachment> {
  const id = crypto.randomUUID();
  const originalName = decodeOriginalName(file.originalname);
  const storagePath = `${taskId}/${id}-${sanitizeFileName(originalName)}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  try {
    return await taskAttachmentRepository.create({
      id,
      taskId,
      uploaderId,
      fileName: originalName,
      fileSize: file.size,
      mimeType: file.mimetype,
      storagePath,
    });
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
    throw err;
  }
}

/**
 * Deletes the DB row first, then best-effort removes the blob — the row is
 * what makes an attachment visible/downloadable, so once it's gone the file
 * is already invisible to users even if the Storage cleanup itself fails.
 * The alternative order risks a dangling row that 404s on download if the
 * process dies between the two steps.
 */
export async function deleteAttachment(attachment: TaskAttachment): Promise<void> {
  await taskAttachmentRepository.remove(attachment.id);
  await supabase.storage.from(BUCKET).remove([attachment.storage_path]).catch(() => undefined);
}

export async function getDownloadUrl(attachment: TaskAttachment): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS, {
    download: attachment.file_name,
  });
  if (error || !data) {
    throw new ApiError(ERROR_CODES.ATTACHMENT_NOT_FOUND);
  }
  return data.signedUrl;
}
