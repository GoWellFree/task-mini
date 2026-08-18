import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("../repositories/taskAttachmentRepository.js", () => repo);
vi.mock("../lib/supabase.js", () => ({
  supabase: { storage: { from: () => storage } },
}));

const { uploadAttachment, deleteAttachment, getDownloadUrl } = await import("./attachmentService.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploadAttachment", () => {
  it("decodes a UTF-8 filename that multer/busboy handed back as latin1", async () => {
    // Regression test: busboy decodes multipart header fields (including
    // the filename) as latin1 by default per the old RFC 2388 spec, but
    // every real client sends UTF-8 bytes there. Without re-decoding, a
    // Cyrillic filename like "тест файл.txt" comes back as mojibake
    // ("Ð¡Ð¥..." style garbage) — caught via a live upload test against a
    // real backend, not by any of the existing (ASCII-only) test data.
    storage.upload.mockResolvedValue({ error: null });
    repo.create.mockImplementation((row) => Promise.resolve({ ...row, task_id: row.taskId, uploader_id: row.uploaderId, file_name: row.fileName, file_size: row.fileSize, mime_type: row.mimeType, storage_path: row.storagePath, created_at: "now" }));

    // Buffer.from("тест файл.txt", "utf8").toString("latin1") reproduces
    // exactly what busboy would have handed us for this filename.
    const mangled = Buffer.from("тест файл.txt", "utf8").toString("latin1");

    const attachment = await uploadAttachment("task-1", "user-1", {
      buffer: Buffer.from("hello"),
      originalname: mangled,
      size: 5,
      mimetype: "text/plain",
    });

    expect(attachment.file_name).toBe("тест файл.txt");
  });

  it("strips non-ASCII and unsafe characters from the storage key but keeps them in the display name", async () => {
    storage.upload.mockResolvedValue({ error: null });
    repo.create.mockImplementation((row) => Promise.resolve({ id: row.id, task_id: row.taskId, uploader_id: row.uploaderId, file_name: row.fileName, file_size: row.fileSize, mime_type: row.mimeType, storage_path: row.storagePath, created_at: "now" }));

    await uploadAttachment("task-1", "user-1", {
      buffer: Buffer.from("hi"),
      originalname: "report (final)/v2.pdf",
      size: 2,
      mimetype: "application/pdf",
    });

    const [storagePath] = storage.upload.mock.calls[0] as [string, Buffer, unknown];
    expect(storagePath.startsWith("task-1/")).toBe(true);
    expect(storagePath.includes("(")).toBe(false);
    expect(storagePath.includes(")")).toBe(false);
    expect(storagePath.includes("/", "task-1/".length)).toBe(false);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ fileName: "report (final)/v2.pdf" }));
  });

  it("uploads to Storage before writing the DB row, and cleans up the blob if the DB insert fails", async () => {
    storage.upload.mockResolvedValue({ error: null });
    storage.remove.mockResolvedValue({ error: null });
    repo.create.mockRejectedValue(new Error("db unavailable"));

    await expect(
      uploadAttachment("task-1", "user-1", { buffer: Buffer.from("x"), originalname: "a.txt", size: 1, mimetype: "text/plain" }),
    ).rejects.toThrow("db unavailable");

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it("throws if the Storage upload itself fails, without touching the DB", async () => {
    storage.upload.mockResolvedValue({ error: new Error("bucket unavailable") });

    await expect(
      uploadAttachment("task-1", "user-1", { buffer: Buffer.from("x"), originalname: "a.txt", size: 1, mimetype: "text/plain" }),
    ).rejects.toThrow("bucket unavailable");

    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("deleteAttachment", () => {
  it("removes the DB row before best-effort removing the blob", async () => {
    repo.remove.mockResolvedValue(undefined);
    storage.remove.mockResolvedValue({ error: null });

    await deleteAttachment({
      id: "att-1",
      task_id: "task-1",
      uploader_id: "user-1",
      file_name: "a.txt",
      file_size: 1,
      mime_type: "text/plain",
      storage_path: "task-1/att-1-a.txt",
      created_at: "now",
    });

    expect(repo.remove).toHaveBeenCalledWith("att-1");
    expect(storage.remove).toHaveBeenCalledWith(["task-1/att-1-a.txt"]);
  });

  it("does not throw if the Storage cleanup fails after the DB row is already gone", async () => {
    repo.remove.mockResolvedValue(undefined);
    storage.remove.mockRejectedValue(new Error("storage down"));

    await expect(
      deleteAttachment({
        id: "att-1",
        task_id: "task-1",
        uploader_id: "user-1",
        file_name: "a.txt",
        file_size: 1,
        mime_type: "text/plain",
        storage_path: "task-1/att-1-a.txt",
        created_at: "now",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("getDownloadUrl", () => {
  it("returns the signed URL on success", async () => {
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://example.com/signed" }, error: null });

    const url = await getDownloadUrl({
      id: "att-1",
      task_id: "task-1",
      uploader_id: "user-1",
      file_name: "a.txt",
      file_size: 1,
      mime_type: "text/plain",
      storage_path: "task-1/att-1-a.txt",
      created_at: "now",
    });

    expect(url).toBe("https://example.com/signed");
  });

  it("throws ATTACHMENT_NOT_FOUND if signing fails", async () => {
    storage.createSignedUrl.mockResolvedValue({ data: null, error: new Error("not found") });

    await expect(
      getDownloadUrl({
        id: "att-1",
        task_id: "task-1",
        uploader_id: "user-1",
        file_name: "a.txt",
        file_size: 1,
        mime_type: "text/plain",
        storage_path: "task-1/att-1-a.txt",
        created_at: "now",
      }),
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" });
  });
});
