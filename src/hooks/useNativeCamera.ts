import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

/**
 * Captura de foto híbrida:
 * - APK (Capacitor) → usa câmera/galeria nativa via @capacitor/camera.
 * - Web → retorna null para indicar que o caller deve usar o <input type="file"> tradicional.
 *
 * Retorna sempre um File (compatível com o upload atual no Supabase Storage)
 * para permitir reutilização total do código de upload em BaixaEntrega.
 */

export type PhotoSource = "camera" | "gallery";

export interface NativeCameraResult {
  file: File;
  previewUrl: string; // URL.createObjectURL(file) — caller precisa fazer revoke depois
}

export function isNativeCameraAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

export async function takeNativePhoto(source: PhotoSource): Promise<NativeCameraResult | null> {
  if (!isNativeCameraAvailable()) return null;

  // Qualidade/resolução calibradas para OCR de canhoto pela IA dos clientes.
  // - quality 92  → mantém detalhe do texto/assinatura sem inflar muito o arquivo.
  // - width 2000  → resolução mínima recomendada para reconhecimento de
  //                 documento; abaixo de 1200 começa a falhar.
  // - correctOrientation → garante que a foto não vai rotacionada (estraga OCR).
  const photo = await Camera.getPhoto({
    quality: 92,
    width: 2000,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    saveToGallery: false,
    correctOrientation: true,
    promptLabelHeader: "Foto do comprovante",
    promptLabelPhoto: "Galeria",
    promptLabelPicture: "Tirar foto",
  });

  if (!photo.dataUrl) return null;

  const ext = photo.format || "jpg";
  const file = await dataUrlToFile(photo.dataUrl, `comprovante_${Date.now()}.${ext}`);
  const previewUrl = URL.createObjectURL(file);
  return { file, previewUrl };
}
