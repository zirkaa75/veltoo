"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ProductImageView = {
  id: string;
  storagePath: string;
  signedUrl: string;
  isPrimary: boolean;
};

const bucket = "velto-product-images";
const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxFileSize = 5 * 1024 * 1024;

export default function ProductImageManager({
  businessId,
  productId,
  initialImages,
  canManage,
}: {
  businessId: string;
  productId: string;
  initialImages: ProductImageView[];
  canManage: boolean;
}) {
  const [images, setImages] = useState(initialImages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    const supabase = createClient("business");
    let hasPrimaryImage = images.some((image) => image.isPrimary);

    try {
      for (const file of Array.from(files)) {
        const extension = allowedTypes.get(file.type);
        if (!extension || file.size > maxFileSize || file.size === 0) {
          setError("Sawir kastaa ha noqdo JPEG, PNG ama WebP, kana yaraado 5 MB.");
          return;
        }

        const storagePath = `${businessId}/${productId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) {
          setError(`Sawirka lama soo gelin: ${uploadError.message}`);
          return;
        }

        const { data: image, error: insertError } = await supabase.from("product_images").insert({
          business_id: businessId,
          product_id: productId,
          storage_path: storagePath,
          is_primary: !hasPrimaryImage,
        }).select("id,is_primary").single();
        if (insertError || !image) {
          const { error: cleanupError } = await supabase.storage.from(bucket).remove([storagePath]);
          setError(
            cleanupError
              ? `Sawirka lama diiwaangelin, faylkiina si toos ah looma nadiifin: ${cleanupError.message}`
              : `Sawirka lama diiwaangelin: ${insertError?.message ?? "Xogta sawirka lama helin."}`,
          );
          return;
        }

        const { data: signedImage, error: signedUrlError } = await supabase.storage.from(bucket)
          .createSignedUrl(storagePath, 300);
        if (signedUrlError || !signedImage) {
          setError(`Sawirka waa la kaydiyey, laakiin preview-ga lama samayn: ${signedUrlError?.message ?? "URL ma helin."}`);
          window.location.reload();
          return;
        }

        setImages((current) => [...current, {
          id: image.id,
          storagePath,
          signedUrl: signedImage.signedUrl,
          isPrimary: image.is_primary,
        }]);
        hasPrimaryImage = true;
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? `Sawirka lama soo gelin: ${uploadError.message}` : "Sawirka lama soo gelin.");
    } finally {
      setBusy(false);
    }
  }

  async function makePrimary(imageId: string) {
    setError("");
    setBusy(true);
    const supabase = createClient("business");
    const { error: clearError } = await supabase.from("product_images")
      .update({ is_primary: false }).eq("business_id", businessId).eq("product_id", productId);
    if (clearError) {
      setError(`Sawirka koowaad lama beddelin: ${clearError.message}`);
      setBusy(false);
      return;
    }
    const { error: updateError } = await supabase.from("product_images")
      .update({ is_primary: true }).eq("id", imageId).eq("business_id", businessId);
    if (updateError) {
      setError(`Sawirka koowaad lama beddelin: ${updateError.message}`);
      setBusy(false);
      return;
    }
    setImages((current) => current.map((image) => ({ ...image, isPrimary: image.id === imageId })));
    setBusy(false);
  }

  async function removeImage(image: ProductImageView) {
    setError("");
    setBusy(true);
    const supabase = createClient("business");
    const { error: storageError } = await supabase.storage.from(bucket).remove([image.storagePath]);
    if (storageError) {
      setError(`Sawirka lama tirtirin: ${storageError.message}`);
      setBusy(false);
      return;
    }
    const { error: rowError } = await supabase.from("product_images")
      .delete().eq("id", image.id).eq("business_id", businessId);
    if (rowError) {
      setError(`Faylka sawirka waa la tirtiray, laakiin diiwaanka lama nadiifin: ${rowError.message}`);
      setBusy(false);
      return;
    }
    setImages((current) => current.filter((item) => item.id !== image.id));
    setBusy(false);
  }

  return (
    <div className="product-image-manager">
      {canManage && (
        <label className="workspace-module-field">
          <span>Sawirro (JPEG, PNG, WebP · ugu badnaan 5 MB midkiiba)</span>
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            multiple
            onChange={(event) => {
              void uploadFiles(event.target.files);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {images.length > 0 && (
        <div className="product-image-gallery">
          {images.map((image) => (
            <figure key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Sawirka alaabta" src={image.signedUrl} />
              {image.isPrimary && <figcaption>Sawirka koowaad</figcaption>}
              {canManage && <div>
                {!image.isPrimary && <button className="action-button" disabled={busy} onClick={() => void makePrimary(image.id)} type="button">Ka dhig koowaad</button>}
                <button className="action-button action-danger" disabled={busy} onClick={() => void removeImage(image)} type="button">Ka saar</button>
              </div>}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
