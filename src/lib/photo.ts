// src/lib/photo.ts
import { File } from "expo-file-system";
import { supabase } from "./supabase";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB max per statutory security rules
export const SIGNED_URL_TTL = 3600; // 1 hour max signed URL lifetime (remediated from 1-2 years)

/**
 * Validates that image data does not exceed 5MB and matches standard JPEG magic bytes (FF D8 FF).
 */
export function validateImageBytes(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new Error(`File size exceeds 5MB limit (${bytes.byteLength} bytes)`);
  }
  if (bytes.byteLength < 3 || bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) {
    throw new Error("Invalid image format: Must be a valid JPEG image (magic bytes FF D8 FF)");
  }
}

async function resolveBytes(localUri: string): Promise<Uint8Array> {
  try {
    const file = new File(localUri);
    return await file.bytes();
  } catch {
    const response = await fetch(localUri);
    const blob = await response.blob();
    return new Uint8Array(await blob.arrayBuffer());
  }
}

/**
 * Uploads an ID photo directly to the Supabase 'id_photos' bucket.
 * Explicitly sets 'contentType: image/jpeg' to adhere to bucket lockdown rules (0011.sql).
 * Enforces magic-byte verification and 5MB size limit.
 * Safe against already-deleted files on outbox retries.
 */
export async function uploadIdPhoto(
  propertyId: string,
  guestId: string,
  localUri: string
): Promise<string> {
  const path = `${propertyId}/${guestId}.jpg`;

  try {
    const file = new File(localUri);
    if (!file.exists) {
      return path;
    }
  } catch {
    // Non-file scheme URI (e.g. content:// or web blob), proceed to upload
  }

  const uploadBytes = await resolveBytes(localUri);
  validateImageBytes(uploadBytes);

  const { error } = await supabase.storage.from("id_photos").upload(path, uploadBytes, {
    contentType: "image/jpeg",
    upsert: true,
  });

  if (error) throw error;

  return path;
}

/**
 * Uploads a property banner image to the storage bucket and returns a signed URL.
 * Falls back to local URI gracefully if network or storage bucket permissions fail.
 */
export async function uploadBannerPhoto(
  propertyId: string,
  localUri: string,
  isPending: boolean = false
): Promise<string> {
  const filename = isPending ? `pending_banner_${Date.now()}.jpg` : 'property_banner.jpg';
  const path = `${propertyId}/${filename}`;

  try {
    const uploadBytes = await resolveBytes(localUri);
    validateImageBytes(uploadBytes);

    const { error } = await supabase.storage.from("id_photos").upload(path, uploadBytes, {
      contentType: "image/jpeg",
      upsert: true,
    });

    if (error) {
      if (__DEV__) console.warn("Storage upload fallback:", error.message);
      return localUri;
    }

    const { data: signedData } = await supabase.storage
      .from("id_photos")
      .createSignedUrl(path, SIGNED_URL_TTL);

    return signedData?.signedUrl || localUri;
  } catch (e) {
    if (__DEV__) console.warn("Banner photo upload failed, using local URI:", e);
    return localUri;
  }
}

/**
 * Uploads a UPI barcode/QR photo to the storage bucket and returns a signed URL.
 */
export async function uploadUpiQrPhoto(
  propertyId: string,
  localUri: string
): Promise<string> {
  const filename = `upi_qr_${Date.now()}.jpg`;
  const path = `${propertyId}/${filename}`;

  try {
    const uploadBytes = await resolveBytes(localUri);
    validateImageBytes(uploadBytes);

    const { error } = await supabase.storage.from("id_photos").upload(path, uploadBytes, {
      contentType: "image/jpeg",
      upsert: true,
    });

    if (error) {
      if (__DEV__) console.warn("UPI QR storage upload fallback:", error.message);
      return localUri;
    }

    const { data: signedData } = await supabase.storage
      .from("id_photos")
      .createSignedUrl(path, SIGNED_URL_TTL);

    return signedData?.signedUrl || localUri;
  } catch (e) {
    if (__DEV__) console.warn("UPI QR photo upload failed, using local URI:", e);
    return localUri;
  }
}


