import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentKind = "revenue" | "expenses" | "ownership" | "analytics" | "other";

export const documentKindLabel: Record<DocumentKind, string> = {
  revenue: "Ingresos y facturación",
  expenses: "Gastos y costos",
  ownership: "Titularidad del negocio",
  analytics: "Usuarios y analíticas",
  other: "Captura del producto o página",
};

const wholeNumberFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function formatUsd(value: number) {
  return `${wholeNumberFormatter.format(Math.round(Number(value) || 0))} USD`;
}

export function formatWholeNumber(value: number) {
  return wholeNumberFormatter.format(Math.round(Number(value) || 0));
}

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_UPLOAD = 6;

const allowedDocumentTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const publicContactPatterns = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /(https?:\/\/|www\.|wa\.me\/|t\.me\/|instagram\.com\/|facebook\.com\/|linkedin\.com\/|tiktok\.com\/|discord\.gg\/)/i,
  /(^|\s)@[a-z0-9._]{3,}/i,
  /(\+?\d{1,3}[\s().-]+\d{2,4}[\s().-]+\d{3,4}[\s().-]+\d{3,4})/,
];

export function containsPublicContactInfo(value: string) {
  return publicContactPatterns.some((pattern) => pattern.test(value));
}

export function validatePublicBusinessText(values: string[]) {
  return values.some(containsPublicContactInfo)
    ? "No incluyas correos, teléfonos, enlaces ni usuarios de redes sociales en los textos públicos. El sitio web tiene su propio campo privado."
    : null;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);

  return normalized || "documento";
}

export function validateDocumentFiles(files: File[]) {
  if (files.length > MAX_DOCUMENTS_PER_UPLOAD) {
    return `Podés subir hasta ${MAX_DOCUMENTS_PER_UPLOAD} archivos por vez.`;
  }

  const invalidType = files.find((file) => !allowedDocumentTypes.has(file.type));
  if (invalidType) return `“${invalidType.name}” no tiene un formato permitido.`;

  const oversized = files.find((file) => file.size > MAX_DOCUMENT_SIZE);
  if (oversized) return `“${oversized.name}” supera el máximo de 10 MB.`;

  return null;
}

export async function uploadBusinessDocuments({
  supabase,
  userId,
  businessId,
  files,
  kind,
}: {
  supabase: SupabaseClient;
  userId: string;
  businessId: string;
  files: File[];
  kind: DocumentKind;
}) {
  const validationError = validateDocumentFiles(files);
  if (validationError) throw new Error(validationError);

  let uploaded = 0;

  for (const file of files) {
    const storagePath = `${userId}/${businessId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: storageError } = await supabase.storage
      .from("business-documents")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (storageError) throw new Error(storageError.message);

    const { error: metadataError } = await supabase.from("business_documents").insert({
      business_id: businessId,
      owner_id: userId,
      storage_path: storagePath,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      document_kind: kind,
    });

    if (metadataError) {
      await supabase.storage.from("business-documents").remove([storagePath]);
      throw new Error(metadataError.message);
    }

    uploaded += 1;
  }

  return uploaded;
}

