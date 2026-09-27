import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { LoadingIndicator } from '../../app/components/LoadingIndicator';
import { createWebLoginApprovalPath, parseWebLoginApprovalCode } from './webLoginService';

export function WebLoginScanner() {
  const idPrefix = useId();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraRequested, setIsCameraRequested] = useState(false);
  const [cameraState, setCameraState] = useState<'starting' | 'scanning' | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [manualCodeError, setManualCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCameraRequested) {
      return;
    }

    let isActive = true;
    let hasAcceptedCode = false;
    let stopScanner: (() => void) | undefined;
    setCameraState('starting');
    setCameraError(null);

    async function startScanner() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('La cámara requiere HTTPS y permiso del navegador. Puedes pegar el código.');
        setIsCameraRequested(false);
        setCameraState(null);
        return;
      }

      const videoElement = videoRef.current;
      if (!videoElement) {
        return;
      }

      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (!isActive) {
          return;
        }

        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoElement, (result) => {
          if (!isActive || !result || hasAcceptedCode) {
            return;
          }

          const challenge = parseWebLoginApprovalCode(result.getText(), window.location.origin);
          if (!challenge) {
            setCameraError('Este QR no corresponde a una solicitud de acceso de Mave.');
            return;
          }

          hasAcceptedCode = true;
          setIsCameraRequested(false);
          navigate(createWebLoginApprovalPath(challenge));
        });

        stopScanner = controls.stop;
        if (!isActive) {
          controls.stop();
        } else {
          setCameraState('scanning');
        }
      } catch {
        if (isActive) {
          setCameraError('No se pudo abrir la cámara. Revisa el permiso o pega el código.');
          setIsCameraRequested(false);
          setCameraState(null);
        }
      }
    }

    void startScanner();

    return () => {
      isActive = false;
      stopScanner?.();
    };
  }, [isCameraRequested, navigate]);

  function handleManualCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const challenge = parseWebLoginApprovalCode(manualCode, window.location.origin);
    if (!challenge) {
      setManualCodeError('El código no es válido o no pertenece a este sitio.');
      return;
    }

    setManualCodeError(null);
    navigate(createWebLoginApprovalPath(challenge));
  }

  return (
    <section aria-label="Escaneo de acceso QR" className="web-login-scanner">
      {isCameraRequested ? (
        <button
          className="web-login-scanner__camera-button"
          onClick={() => {
            setCameraError(null);
            setIsCameraRequested(false);
            setCameraState(null);
          }}
          type="button"
        >
          <CameraOff aria-hidden="true" size={18} />
          <span>Cerrar cámara</span>
        </button>
      ) : (
        <button
          className="web-login-scanner__camera-button"
          onClick={() => {
            setCameraError(null);
            setManualCodeError(null);
            setIsCameraRequested(true);
          }}
          type="button"
        >
          <Camera aria-hidden="true" size={18} />
          <span>Escanear QR con cámara</span>
        </button>
      )}

      {cameraState === 'starting' ? <LoadingIndicator label="Abriendo la cámara" /> : null}
      {cameraState === 'scanning' ? (
        <p aria-live="polite" className="web-login-scanner__status">
          Buscando un código QR…
        </p>
      ) : null}
      {isCameraRequested ? (
        <video
          aria-label="Vista de cámara para escanear el QR"
          autoPlay
          className="web-login-scanner__video"
          muted
          playsInline
          ref={videoRef}
        />
      ) : null}
      {cameraError ? <FeedbackMessage tone="error">{cameraError}</FeedbackMessage> : null}

      <form className="web-login-scanner__manual" onSubmit={handleManualCodeSubmit}>
        <label htmlFor={`${idPrefix}-manual-code`}>Código manual</label>
        <input
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          id={`${idPrefix}-manual-code`}
          onChange={(event) => {
            setManualCode(event.target.value);
            setManualCodeError(null);
          }}
          required
          spellCheck={false}
          type="text"
          value={manualCode}
        />
        <button disabled={!manualCode.trim()} type="submit">
          Continuar
        </button>
        {manualCodeError ? <FeedbackMessage tone="error">{manualCodeError}</FeedbackMessage> : null}
      </form>
    </section>
  );
}
