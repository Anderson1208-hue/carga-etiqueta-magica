import { useEffect, useState, useRef } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Camera, CameraOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraScannerProps {
  onScan: (data: string) => void;
  enabled: boolean;
}

export function CameraScanner({ onScan, enabled }: CameraScannerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  // Sound effects
  const playSound = (type: "success" | "error" | "warning") => {
    if (!soundEnabled) return;
    
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
  };

  const handleScan = (detectedCodes: any[]) => {
    if (!enabled || !cameraActive || detectedCodes.length === 0) return;
    
    const code = detectedCodes[0];
    const data = code.rawValue || code.data;
    
    if (!data) return;
    
    // Debounce: prevent reading the same code within 2 seconds
    const now = Date.now();
    if (data === lastScannedRef.current && now - lastScanTimeRef.current < 2000) {
      return;
    }
    
    lastScannedRef.current = data;
    lastScanTimeRef.current = now;
    
    onScan(data);
  };

  const handleError = (err: any) => {
    console.error("Camera error:", err);
    if (err.name === "NotAllowedError") {
      setError("Permissão de câmera negada. Por favor, permita o acesso à câmera.");
    } else if (err.name === "NotFoundError") {
      setError("Nenhuma câmera encontrada no dispositivo.");
    } else {
      setError("Erro ao acessar a câmera.");
    }
    setCameraActive(false);
  };

  // Expose playSound to parent via callback
  useEffect(() => {
    (window as any).__cameraScannerPlaySound = playSound;
    return () => {
      delete (window as any).__cameraScannerPlaySound;
    };
  }, [soundEnabled]);

  if (!enabled) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={cameraActive ? "destructive" : "default"}
          onClick={() => {
            setError(null);
            setCameraActive(!cameraActive);
          }}
          className="flex items-center gap-2"
        >
          {cameraActive ? (
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
          {soundEnabled ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {cameraActive && !error && (
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-w-md">
          <Scanner
            onScan={handleScan}
            onError={handleError}
            constraints={{
              facingMode: "environment",
            }}
            scanDelay={300}
            styles={{
              container: {
                width: "100%",
                height: "100%",
              },
              video: {
                width: "100%",
                height: "100%",
                objectFit: "cover",
              },
            }}
          />
          <div className="absolute inset-0 pointer-events-none">
            {/* Scanning overlay */}
            <div className="absolute inset-4 border-2 border-primary/50 rounded-lg">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
            </div>
            {/* Scanning line animation */}
            <div className="absolute left-4 right-4 h-0.5 bg-primary/80 animate-pulse top-1/2" />
          </div>
        </div>
      )}
    </div>
  );
}
