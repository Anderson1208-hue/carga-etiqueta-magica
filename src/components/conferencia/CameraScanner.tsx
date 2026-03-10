import { useEffect, useState, useRef, useCallback } from "react";
import { Camera, CameraOff, Volume2, VolumeX, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraScannerProps {
  onScan: (data: string) => void;
  enabled: boolean;
}

function ScannerOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: "20%" }} />
        <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: "20%" }} />
        <div className="absolute bg-black/60" style={{ top: "20%", bottom: "20%", left: 0, width: "10%" }} />
        <div className="absolute bg-black/60" style={{ top: "20%", bottom: "20%", right: 0, width: "10%" }} />
      </div>
      <div className="absolute" style={{ top: "20%", bottom: "20%", left: "10%", right: "10%" }}>
        <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-primary rounded-tl-lg" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-primary rounded-tr-lg" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-primary rounded-bl-lg" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-primary rounded-br-lg" />
        <div className="absolute left-2 right-2 h-0.5 bg-primary/90 animate-pulse top-1/2" />
      </div>
      <div className="absolute bottom-3 left-0 right-0 text-center">
        <span className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
          Aponte para o código
        </span>
      </div>
    </div>
  );
}

export function CameraScanner({ onScan, enabled }: CameraScannerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useNative, setUseNative] = useState(false);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const ScannerRef = useRef<any>(null);
  const [scannerLoaded, setScannerLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sound effects
  const playSound = useCallback((type: "success" | "error" | "warning") => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      if (type === "success") {
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.3;
        oscillator.type = "sine";
      } else if (type === "error") {
        oscillator.frequency.value = 200;
        gainNode.gain.value = 0.3;
        oscillator.type = "square";
      } else {
        oscillator.frequency.value = 440;
        gainNode.gain.value = 0.3;
        oscillator.type = "triangle";
      }
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch {}
  }, [soundEnabled]);

  // Expose playSound to parent
  useEffect(() => {
    (window as any).__cameraScannerPlaySound = playSound;
    return () => { delete (window as any).__cameraScannerPlaySound; };
  }, [playSound]);

  // Check if native BarcodeDetector is available
  const hasNativeBarcodeDetector = typeof (window as any).BarcodeDetector !== "undefined";

  // Debounced scan handler
  const handleDetection = useCallback((data: string) => {
    if (!data || !enabled) return;
    const now = Date.now();
    if (data === lastScannedRef.current && now - lastScanTimeRef.current < 2000) return;
    lastScannedRef.current = data;
    lastScanTimeRef.current = now;
    onScan(data);
  }, [enabled, onScan]);

  // ---- Native BarcodeDetector approach (works offline on Chrome Android) ----
  const startNativeScanner = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      // Set states first so <video> renders, then useEffect will attach the stream
      setUseNative(true);
      setCameraActive(true);
      setLoading(false);
    } catch (err: any) {
      console.error("[CameraScanner] startNativeScanner error:", err.name, err.message, err);
      setLoading(false);
      if (err.name === "NotAllowedError") {
        setError("Permissão de câmera negada. Por favor, permita o acesso à câmera.");
      } else if (err.name === "NotFoundError") {
        setError("Nenhuma câmera encontrada no dispositivo.");
      } else {
        setError("Erro ao acessar a câmera: " + (err.name + " - " + err.message || ""));
      }
    }
  }, []);

  // Attach stream to video element AFTER it renders, fixing the race condition
  useEffect(() => {
    if (!cameraActive || !useNative || !streamRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    video.srcObject = streamRef.current;
    video.play().catch(() => {});

    // Start scanning loop with center crop for faster/more accurate detection
    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "ean_8"] });
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const scan = async () => {
      if (!video || video.readyState < 2) return;
      try {
        // Crop center square from video for focused detection
        if (canvas && ctx) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const size = Math.min(vw, vh) * 0.6;
          const sx = (vw - size) / 2;
          const sy = (vh - size) / 2;
          canvas.width = size;
          canvas.height = size;
          ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) {
            handleDetection(barcodes[0].rawValue);
            return;
          }
        }
        // Fallback: scan full frame
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          handleDetection(barcodes[0].rawValue);
        }
      } catch {}
    };
    // Scan every 250ms for faster response
    const intervalId = window.setInterval(scan, 250);
    animFrameRef.current = intervalId as unknown as number;

    return () => {
      clearInterval(intervalId);
      animFrameRef.current = 0;
    };
  }, [cameraActive, useNative, handleDetection]);

  // ---- Library-based approach (needs WASM / network) ----
  const startLibraryScanner = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Dynamic import with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8000)
      );
      const importPromise = import("@yudiel/react-qr-scanner");
      const module = await Promise.race([importPromise, timeoutPromise]) as any;
      ScannerRef.current = module.Scanner;
      setScannerLoaded(true);
      setCameraActive(true);
      setUseNative(false);
    } catch (err) {
      console.warn("QR Scanner library failed to load, trying native fallback:", err);
      // If native is available, fall back to it
      if (hasNativeBarcodeDetector) {
        await startNativeScanner();
      } else {
        setError("Não foi possível carregar o scanner. Verifique sua conexão ou use a entrada manual.");
      }
    } finally {
      setLoading(false);
    }
  }, [hasNativeBarcodeDetector, startNativeScanner]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      clearInterval(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setCameraActive(false);
    setScannerLoaded(false);
    setUseNative(false);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraActive) {
      stopCamera();
      return;
    }
    setError(null);
    // Prefer native BarcodeDetector (works offline)
    if (hasNativeBarcodeDetector) {
      await startNativeScanner();
    } else {
      await startLibraryScanner();
    }
  }, [cameraActive, hasNativeBarcodeDetector, startNativeScanner, startLibraryScanner, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (animFrameRef.current) {
        clearInterval(animFrameRef.current);
      }
    };
  }, []);

  const handleLibraryScan = useCallback((detectedCodes: any[]) => {
    if (!enabled || !cameraActive || detectedCodes.length === 0) return;
    const code = detectedCodes[0];
    const data = code.rawValue || code.data;
    if (data) handleDetection(data);
  }, [enabled, cameraActive, handleDetection]);

  const handleLibraryError = useCallback((err: any) => {
    console.error("Camera error:", err);
    if (hasNativeBarcodeDetector) {
      console.log("Falling back to native BarcodeDetector...");
      startNativeScanner();
    } else {
      if (err.name === "NotAllowedError") {
        setError("Permissão de câmera negada.");
      } else if (err.name === "NotFoundError") {
        setError("Nenhuma câmera encontrada.");
      } else {
        setError("Erro ao acessar a câmera.");
      }
      setCameraActive(false);
    }
  }, [hasNativeBarcodeDetector, startNativeScanner]);

  if (!enabled) return null;

  const LibraryScanner = ScannerRef.current;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={cameraActive ? "destructive" : "default"}
          onClick={toggleCamera}
          disabled={loading}
          className="flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Abrindo câmera...
            </>
          ) : cameraActive ? (
            <>
              <CameraOff className="w-4 h-4" />
              Desativar Câmera
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              Ativar Câmera
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? "Desativar som" : "Ativar som"}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p>{error}</p>
            {!navigator.onLine && hasNativeBarcodeDetector && (
              <p className="mt-1 text-xs opacity-80">Modo offline detectado. Tentando scanner nativo...</p>
            )}
          </div>
        </div>
      )}

      {/* Scanner container - Native */}
      {cameraActive && !error && useNative && (
        <div className="relative rounded-2xl overflow-hidden bg-black max-w-md mx-auto" style={{ aspectRatio: "3/4" }}>
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
          <canvas ref={canvasRef} className="hidden" />
          <ScannerOverlay />
        </div>
      )}

      {/* Scanner container - Library */}
      {cameraActive && !error && !useNative && scannerLoaded && LibraryScanner && (
        <div className="relative rounded-2xl overflow-hidden bg-black max-w-md mx-auto" style={{ aspectRatio: "3/4" }}>
          <LibraryScanner
            onScan={handleLibraryScan}
            onError={handleLibraryError}
            constraints={{ facingMode: "environment" }}
            scanDelay={250}
            styles={{
              container: { width: "100%", height: "100%" },
              video: { width: "100%", height: "100%", objectFit: "cover" },
            }}
          />
          <ScannerOverlay />
        </div>
      )}
    </div>
  );
}
