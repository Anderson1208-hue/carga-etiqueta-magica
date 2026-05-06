---
name: camera-nativa-hibrida
description: Câmera híbrida — APK usa @capacitor/camera, web cai no <input type=file capture> tradicional. Mesmo File para upload.
type: feature
---
# Câmera Nativa Híbrida (Capacitor)

## Arquitetura
- `src/hooks/useNativeCamera.ts` exporta:
  - `isNativeCameraAvailable()` — true só em `Capacitor.isNativePlatform()`.
  - `takeNativePhoto(source)` — abre câmera/galeria nativa, retorna `{ file: File, previewUrl: string }`.
- Em web: `isNativeCameraAvailable()` é false → caller usa o `<input type="file" capture="environment">` original.

## Onde está plugado
- `src/pages/BaixaEntrega.tsx` — função `handleNativePhoto(source)` decide nativo vs input. Os `<input>` permanecem como fallback web.

## Regras
- Sempre devolve um `File` (não data URL) para reaproveitar o upload existente para o bucket `comprovantes`.
- `quality: 75`, `correctOrientation: true`, `saveToGallery: false`.
- O caller é responsável por `URL.revokeObjectURL(previewUrl)` (regra de RAM mobile já existente).
- Permissões Android no `AndroidManifest.xml`: `CAMERA`, `READ_MEDIA_IMAGES` (Android 13+) / `READ_EXTERNAL_STORAGE` (Android <13).
- iOS (futuro): `NSCameraUsageDescription` e `NSPhotoLibraryUsageDescription` no Info.plist.
- Build: `npm run build && npx cap sync android` antes de gerar APK.
