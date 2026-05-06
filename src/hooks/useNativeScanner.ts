import { useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Scanner QR/barcode nativo via @capacitor-mlkit/barcode-scanning.
 *
 * Estratégia híbrida:
 * - APK (Capacitor.isNativePlatform()): usa ML Kit nativo (rápido, offline, com vibração).
 * - Web/PWA: `isAvailable=false` → o caller mantém o `CameraScanner` atual como fallback.
 *
 * Uso:
 *   const { isAvailable, scanOnce } = useNativeScanner();
 *   if (isAvailable) <Button onClick={async () => { const v = await scanOnce(); if (v) onScan(v); }}/>
 */
export function useNativeScanner() {
  const isAvailable = Capacitor.isNativePlatform();
  const [scanning, setScanning] = useState(false);

  const ensurePermission = useCallback(async () => {
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
    const status = await BarcodeScanner.checkPermissions();
    if (status.camera === "granted" || status.camera === "limited") return true;
    const req = await BarcodeScanner.requestPermissions();
    return req.camera === "granted" || req.camera === "limited";
  }, []);

  const ensureGoogleModule = useCallback(async () => {
    if (Capacitor.getPlatform() !== "android") return;
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      }
    } catch (err) {
      // Em alguns devices o módulo já vem embutido; ignorar.
      console.debug("Google barcode module check falhou:", err);
    }
  }, []);

  /**
   * Abre o scanner nativo em tela cheia e retorna o primeiro código lido (ou null se cancelar).
   */
  const scanOnce = useCallback(async (): Promise<string | null> => {
    if (!isAvailable) return null;
    if (scanning) return null;
    setScanning(true);
    try {
      const ok = await ensurePermission();
      if (!ok) {
        console.warn("Permissão de câmera negada");
        return null;
      }
      await ensureGoogleModule();

      const { BarcodeScanner, BarcodeFormat } = await import(
        "@capacitor-mlkit/barcode-scanning"
      );
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode, BarcodeFormat.Code128, BarcodeFormat.Code39],
      });
      const first = barcodes?.[0]?.rawValue ?? null;
      return first || null;
    } catch (err) {
      console.error("Native scanner falhou:", err);
      return null;
    } finally {
      setScanning(false);
    }
  }, [isAvailable, scanning, ensurePermission, ensureGoogleModule]);

  return { isAvailable, scanning, scanOnce };
}
