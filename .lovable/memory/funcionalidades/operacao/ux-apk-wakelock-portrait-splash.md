---
name: ux-apk-wakelock-portrait-splash
description: UX final do APK — Wake Lock web, lock portrait via @capacitor/screen-orientation, splash via @capacitor/splash-screen.
type: feature
---
# Fase 6 — UX final do APK

## Hooks novos
- `src/hooks/useWakeLock.ts` — `useWakeLock(enabled)`. Usa Screen Wake Lock API. Reaplica ao voltar do background. No-op em iOS Safari sem suporte.
- `src/hooks/useLockPortrait.ts` — chama `ScreenOrientation.lock({ orientation: 'portrait' })` apenas em `Capacitor.isNativePlatform()`. No-op em web. Não desbloqueia ao desmontar (todas as telas operacionais querem retrato).

## Onde estão plugados
- `BaixaEntrega.tsx` — `useWakeLock(!!selectedVeiculoId)` + `useLockPortrait()`.
- `ConferenciaExterna.tsx` — `useWakeLock(true)` + `useLockPortrait()`.
- `ConferenciaInterna.tsx` — só `useLockPortrait()` (galpão não precisa de tela acesa permanente).

## Splash + Capacitor config
`capacitor.config.ts` ganhou bloco `plugins.SplashScreen`:
- launchShowDuration 2000ms, autoHide, fullscreen + immersive.
- backgroundColor `#0f172a` (consistente com tema escuro).
- spinner branco, large.

## Assets que devem ser gerados pelo usuário (no PC, fora do Lovable)
- Ícone do app: `npx @capacitor/assets generate --iconBackgroundColor '#0f172a' --iconBackgroundColorDark '#0f172a' --splashBackgroundColor '#0f172a'`.
- Source files esperados em `assets/`:
  - `assets/icon-only.png` (1024x1024)
  - `assets/icon-foreground.png` (1024x1024)
  - `assets/icon-background.png` (1024x1024)
  - `assets/splash.png` (2732x2732)
- Após gerar: `npx cap sync android`.

## Pacotes adicionados
- `@capacitor/screen-orientation@8`
- `@capacitor/splash-screen@8`
