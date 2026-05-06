---
name: scanner-nativo-mlkit
description: Fase 3 — Scanner QR/barcode nativo via @capacitor-mlkit/barcode-scanning, híbrido com fallback web.
type: feature
---
# Fase 3 — Scanner nativo ML Kit

## Hook
- `src/hooks/useNativeScanner.ts` — `{ isAvailable, scanning, scanOnce }`.
  - `isAvailable = Capacitor.isNativePlatform()`. Em web sempre false.
  - `scanOnce()`: pede permissão, garante o módulo Google Play Services Barcode (Android), abre o scanner ML Kit em tela cheia e retorna o primeiro `rawValue` lido (QrCode, Code128, Code39) ou null.
  - Importa `@capacitor-mlkit/barcode-scanning` dinamicamente para não quebrar o bundle web.

## Integração
- `ConferenciaExterna.tsx`:
  - Botão "Scanner Nativo (ML Kit)" aparece **acima** do `CameraScanner` apenas quando `nativeScanner.isAvailable`.
  - Reutiliza `processScan(code)` — toda a lógica de validação, debounce e som permanece no fluxo existente.
- `CameraScanner` (BarcodeDetector web) continua intacto como fallback no APK e como scanner principal na web.

## Permissões Android (manual no AndroidManifest.xml)
- `android.permission.CAMERA`
- O plugin gerencia automaticamente o download do módulo ML Kit via Play Services.

## Pacote
- `@capacitor-mlkit/barcode-scanning@8.0.1`
