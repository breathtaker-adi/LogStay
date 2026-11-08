// src/lib/photo.ts
import { File } from "expo-file-system";
import { supabase } from "./supabase";

/**
 * Uploads an ID photo directly to the Supabase 'id_photos' bucket.
 * Explicitly sets 'contentType: image/jpeg' to adhere to bucket lockdown rules (0011.sql).
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
    // If local file is already gone (e.g. uploaded on a previous attempt before RPC failure),
    // return deterministic path so the subsequent RPC call can succeed.
    if (!file.exists) {
      return path;
    }
  } catch {
    // Non-file scheme URI (e.g. content:// or web blob), proceed to upload
  }

  let uploadData: Uint8Array | Blob;
  try {
    const file = new File(localUri);
    uploadData = await file.bytes();
  } catch {
    // Robust fallback for content:// or non-file scheme URIs
    const response = await fetch(localUri);
    uploadData = await response.blob();
  }

  const { error } = await supabase.storage.from("id_photos").upload(path, uploadData, {
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
    let uploadData: Uint8Array | Blob;
    try {
      const file = new File(localUri);
      uploadData = await file.bytes();
    } catch {
      const response = await fetch(localUri);
      uploadData = await response.blob();
    }

    const { error } = await supabase.storage.from("id_photos").upload(path, uploadData, {
      contentType: "image/jpeg",
      upsert: true,
    });

    if (error) {
      console.warn("Storage upload fallback:", error.message);
      return localUri;
    }

    const { data: signedData } = await supabase.storage
      .from("id_photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    return signedData?.signedUrl || localUri;
  } catch (e) {
    console.warn("Banner photo upload failed, using local URI:", e);
    return localUri;
  }
}

