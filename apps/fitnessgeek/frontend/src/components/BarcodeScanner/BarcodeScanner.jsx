import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  TextField,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Keyboard as KeyboardIcon,
  CheckCircle as CheckCircleIcon,
  CameraAlt as CameraIcon,
  PhotoCamera as PhotoIcon,
  FlashlightOn as TorchOnIcon,
  FlashlightOff as TorchOffIcon
} from '@mui/icons-material';
import { fitnessGeekService } from '../../services/fitnessGeekService';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { errorMessage } from '../../utils/errorMessage.js';
import { normalizeProductCode } from './productCode.js';
import { openRearCamera, prepareTrack, stopStream, guideRegion } from './camera.js';
import { createDetector, decodePhotoFile } from './detector.js';

// The scan history is a per-device convenience. Private windows and blocked
// site data throw on access, and that must not take the add sheet down.
const readScanHistory = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('barcodeScanHistory') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const CAMERA_UNAVAILABLE = 'FitnessGeek can’t use the camera here. Type the barcode instead.';
const CAMERA_BLOCKED = 'FitnessGeek needs your camera to scan. Allow it in your browser settings, or type the barcode.';
const SCANNER_NOT_LOADED = 'The scanner didn’t load. Check your signal and try again, or type the barcode.';
const PHOTO_UNREADABLE = 'I couldn’t read a barcode in that photo. Try again a little further away, or type the number.';

// How often the camera frame is checked. Ten looks a second is as fast as a
// hand can settle a pack in the box; every animation frame (the old Android
// loop) is six times the work for the same result and a warm phone.
const SCAN_INTERVAL_MS = 100;

// Every control is at least a thumb wide.
const TAP = 44;

const hasCameraApi = () => Boolean(navigator.mediaDevices?.getUserMedia);

/** The first read that is a real product number, as the number to look up. */
const firstProductCode = (reads) => {
  for (const read of reads || []) {
    const code = normalizeProductCode(read?.rawValue, read?.format);
    if (code) return code;
  }
  return null;
};

const waitForElement = async (ref, tries = 40) => {
  for (let i = 0; i < tries && !ref.current; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return ref.current;
};

const BarcodeScanner = ({ open, onClose, onBarcodeScanned }) => {
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanHistory, setScanHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState('camera'); // 'camera' or 'manual'
  // 'off' | 'starting' | 'scanning' | 'got'
  const [phase, setPhase] = useState('off');
  const [cameraError, setCameraError] = useState(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(null); // null, or { base, close }
  const [zoomedIn, setZoomedIn] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);

  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const guideRef = useRef(null);
  const photoInputRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const timerRef = useRef(null);
  // Each start gets a number; anything still running under an older number
  // (a camera that opened after the dialog closed, a frame mid-decode) sees it
  // has been overtaken and lets go.
  const runRef = useRef(0);
  const lastReadRef = useRef(null);
  const resumeRef = useRef(false);
  const phaseRef = useRef('off');
  const modeRef = useRef(mode);

  const showPhase = (next) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Load scan history on mount
  useEffect(() => {
    setScanHistory(readScanHistory().slice(0, 5));
  }, []);

  const stopScanner = useCallback(() => {
    runRef.current += 1;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    lastReadRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    trackRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        // Nothing attached.
      }
    }
    setHasTorch(false);
    setTorchOn(false);
    setZoom(null);
    setZoomedIn(false);
    if (phaseRef.current !== 'got') showPhase('off');
  }, []);

  const saveToHistory = (barcode) => {
    const history = readScanHistory();
    const newHistory = [barcode, ...history.filter(b => b !== barcode)].slice(0, 10);
    try {
      localStorage.setItem('barcodeScanHistory', JSON.stringify(newHistory));
    } catch {
      // A convenience; the scan itself still works.
    }
    setScanHistory(newHistory.slice(0, 5));
  };

  const handleBarcodeDetected = async (barcode) => {
    if (!barcode) return;

    saveToHistory(barcode);
    stopScanner();

    if (!/^[0-9]{8,14}$/.test(barcode)) {
      showPhase('off');
      setError('A barcode is 8–14 digits. Check the number and try again.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const food = await fitnessGeekService.getFoodByBarcode(barcode);
      if (!food) {
        setError('That barcode isn’t in the food databases. Try typing the food instead.');
        return;
      }

      // Finding the product is not the same as logging it. `onBarcodeScanned`
      // does the actual write and reports back whether it landed — this used
      // to close on the lookup alone, so a failed log still closed the
      // scanner and showed nothing wrong. Close only on a real success; a
      // failure keeps the scanner open with the error right here, the same
      // place the "no product found" message already lives.
      let logged = false;
      try {
        logged = await onBarcodeScanned(food);
      } catch {
        logged = false;
      }

      if (logged) {
        onClose();
      } else {
        setError('Couldn’t add that. Try again.');
      }
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t look up that barcode. Try again, or type the food.'));
    } finally {
      setIsLoading(false);
      showPhase('off');
    }
  };

  // Kept in a ref so the scan loop, which outlives the render that started
  // it, always calls the current one.
  const detectedRef = useRef(handleBarcodeDetected);
  detectedRef.current = handleBarcodeDetected;

  /** A camera or photo read we believe: say so, then look it up. */
  const acceptRead = (code) => {
    showPhase('got');
    try {
      navigator.vibrate?.(60);
    } catch {
      // No buzzer (every iPhone). The frame says "Got it" instead.
    }
    detectedRef.current(code);
  };

  /** The slice of the live picture behind the guide box, on a canvas. */
  const grabFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const box = boxRef.current?.getBoundingClientRect?.();
    const guide = guideRef.current?.getBoundingClientRect?.();
    const region = guideRegion({
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      boxWidth: box?.width || 0,
      boxHeight: box?.height || 0,
      guideWidth: guide?.width || 0,
      guideHeight: guide?.height || 0
    });
    if (!region) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    if (canvas.width !== region.w) canvas.width = region.w;
    if (canvas.height !== region.h) canvas.height = region.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    return canvas;
  };

  const startScanner = useCallback(async () => {
    stopScanner();
    const run = runRef.current;
    const current = () => run === runRef.current;

    setCameraError(null);
    setError(null);
    showPhase('starting');

    // The decoder downloads (first time only) while the person is still
    // answering the camera prompt.
    const detectorPromise = hasCameraApi() ? createDetector() : null;
    detectorPromise?.catch(() => {});

    try {
      // THE one stream. Nothing else in the scanner opens a camera.
      const camera = await openRearCamera();
      if (!current()) {
        stopStream(camera.stream);
        return;
      }
      streamRef.current = camera.stream;
      trackRef.current = camera.track;

      const abilities = await prepareTrack(camera.track);
      if (!current()) return;
      setHasTorch(abilities.torch);
      setZoom(abilities.zoom);

      const video = await waitForElement(videoRef);
      if (!current()) return;
      if (video) {
        video.srcObject = camera.stream;
        try {
          await video.play();
        } catch {
          // autoPlay starts it; a second play() racing the first is harmless.
        }
        if (!current()) return;
      }

      let detector;
      try {
        detector = await detectorPromise;
      } catch {
        if (!current()) return;
        stopScanner();
        setCameraError(SCANNER_NOT_LOADED);
        setMode('manual');
        return;
      }
      if (!current()) return;

      showPhase('scanning');

      // One look at a time: the next is only booked once this one has
      // answered, so a slow phone falls behind instead of piling up.
      const look = async () => {
        if (!current()) return;
        const began = Date.now();
        try {
          const frame = grabFrame();
          if (frame) {
            const reads = await detector.detect(frame);
            if (!current()) return;
            const code = firstProductCode(reads);
            if (code) {
              // A check digit catches nine misreads in ten. Seeing the same
              // number twice running catches the tenth.
              if (lastReadRef.current === code) {
                acceptRead(code);
                return;
              }
              lastReadRef.current = code;
            }
          }
        } catch {
          // A frame that would not decode is just a miss.
        }
        if (!current()) return;
        timerRef.current = setTimeout(look, Math.max(0, SCAN_INTERVAL_MS - (Date.now() - began)));
      };
      look();
    } catch (err) {
      if (!current()) return;
      stopScanner();
      setCameraError(err?.name === 'NotAllowedError' ? CAMERA_BLOCKED : CAMERA_UNAVAILABLE);
      setMode('manual');
    }
    // grabFrame/acceptRead only touch refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopScanner]);

  // A fresh open starts on the camera with nothing left over from last time:
  // a camera that was blocked then may have been allowed since.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCameraError(null);
    setManualBarcode('');
    showPhase('off');
    if (hasCameraApi()) setMode('camera');
  }, [open]);

  // The camera runs only while the dialog is open on the camera tab, and is
  // let go the moment either stops being true (and on unmount).
  useEffect(() => {
    if (open && mode === 'camera') startScanner();
    return () => {
      resumeRef.current = false;
      stopScanner();
    };
  }, [open, mode, startScanner, stopScanner]);

  // Phone locked, app switched away: let the camera go, and pick it back up on
  // return. iOS freezes a camera it finds running in the background.
  useEffect(() => {
    if (!open) return undefined;
    const onVisibility = () => {
      if (document.hidden) {
        if (phaseRef.current === 'starting' || phaseRef.current === 'scanning') {
          resumeRef.current = true;
          stopScanner();
        }
      } else if (resumeRef.current) {
        resumeRef.current = false;
        if (modeRef.current === 'camera') startScanner();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [open, startScanner, stopScanner]);

  const toggleTorch = async () => {
    if (!trackRef.current) return;
    try {
      const next = !torchOn;
      await trackRef.current.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // The light stays as it was.
    }
  };

  const changeZoom = async (event, wantClose) => {
    if (wantClose === null || !trackRef.current || !zoom) return;
    try {
      await trackRef.current.applyConstraints({ advanced: [{ zoom: wantClose ? zoom.close : zoom.base }] });
      setZoomedIn(wantClose);
    } catch {
      // The zoom stays as it was.
    }
  };

  const openPhotoCamera = () => {
    // The phone's own camera wants the lens to itself.
    stopScanner();
    setError(null);
    photoInputRef.current?.click();
  };

  const handlePhotoChosen = async (event) => {
    const file = event.target.files?.[0];
    // Empty the input so choosing the same photo again still fires.
    event.target.value = '';
    if (!file) return;

    stopScanner();
    setError(null);
    setReadingPhoto(true);
    try {
      const code = firstProductCode(await decodePhotoFile(file));
      if (code) {
        acceptRead(code);
      } else {
        setError(PHOTO_UNREADABLE);
      }
    } catch {
      setError(PHOTO_UNREADABLE);
    } finally {
      setReadingPhoto(false);
    }
  };

  const handleManualSubmit = () => {
    if (!manualBarcode.trim()) return;
    handleBarcodeDetected(manualBarcode.trim());
  };

  const handleHistoryClick = (barcode) => {
    setManualBarcode(barcode);
    handleBarcodeDetected(barcode);
  };

  const handleClose = () => {
    stopScanner();
    showPhase('off');
    setError(null);
    setCameraError(null);
    setManualBarcode('');
    onClose();
  };

  const handleModeChange = (event, newMode) => {
    if (newMode !== null) {
      stopScanner();
      setMode(newMode);
      setError(null);
      setCameraError(null);
    }
  };

  const busy = isLoading || readingPhoto;
  const got = phase === 'got';

  const photoButton = (
    <Button
      variant="outlined"
      fullWidth
      onClick={openPhotoCamera}
      disabled={busy}
      startIcon={readingPhoto ? <CircularProgress size={18} /> : <PhotoIcon />}
      sx={{ minHeight: TAP }}
    >
      {readingPhoto ? 'Reading the photo…' : 'Take a photo instead'}
    </Button>
  );

  const renderCameraScanner = () => (
    <Box sx={{ p: 4 }}>
      <Box
        ref={boxRef}
        data-testid="scanner-view"
        sx={{
          position: 'relative',
          width: '100%',
          // Full width on a phone; held to a sensible size in a wide dialog.
          maxWidth: { xs: '100%', sm: 480 },
          mx: 'auto',
          height: { xs: 260, sm: 320 },
          bgcolor: 'common.black',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
      >
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          autoPlay
          playsInline
          muted
        />

        {/* The guide box. Wide and short, the shape of a barcode. What is
            behind it (plus a margin) is the only part of the picture read. */}
        {(phase === 'scanning' || got) && (
          <Box
            ref={guideRef}
            data-testid="scanner-guide"
            data-state={got ? 'got' : 'scanning'}
            sx={(theme) => ({
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(84%, 360px)',
              height: '48%',
              borderRadius: '12px',
              border: '3px solid',
              borderColor: got ? theme.palette.success.main : theme.palette.common.white,
              boxShadow: `0 0 0 9999px ${alpha(theme.palette.common.black, got ? 0.7 : 0.45)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.palette.common.white,
              transition: theme.transitions.create(['border-color', 'box-shadow'], { duration: 150 }),
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
            })}
          >
            {got && (
              <Box role="status" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ fontSize: 40, color: 'success.light' }} />
                <Typography sx={{ fontWeight: 700 }}>Got it</Typography>
                {isLoading && (
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>Looking it up…</Typography>
                )}
              </Box>
            )}
          </Box>
        )}

        {phase === 'starting' && (
          <Box
            role="status"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              color: 'common.white'
            }}
          >
            <CircularProgress size={28} sx={{ color: 'common.white' }} />
            <Typography variant="body2">Starting the camera…</Typography>
          </Box>
        )}

        {phase === 'off' && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {busy ? (
              <CircularProgress size={28} sx={{ color: 'common.white' }} />
            ) : (
              <Button
                variant="contained"
                onClick={startScanner}
                startIcon={<CameraIcon />}
                sx={{ minHeight: TAP }}
              >
                Start camera
              </Button>
            )}
          </Box>
        )}
      </Box>

      <Typography
        variant="body2"
        sx={{ mt: 3, color: 'text.secondary', textAlign: 'center', maxWidth: 480, mx: 'auto' }}
      >
        Hold the barcode inside the box. If it’s blurry, move back a little.
      </Typography>

      {phase === 'scanning' && (hasTorch || zoom) && (
        <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
          {hasTorch && (
            <Button
              variant={torchOn ? 'contained' : 'outlined'}
              onClick={toggleTorch}
              aria-pressed={torchOn}
              aria-label={torchOn ? 'Turn the light off' : 'Turn the light on'}
              startIcon={torchOn ? <TorchOnIcon /> : <TorchOffIcon />}
              sx={{ minHeight: TAP }}
            >
              Light
            </Button>
          )}
          {zoom && (
            <ToggleButtonGroup
              exclusive
              value={zoomedIn}
              onChange={changeZoom}
              aria-label="Zoom"
              color="primary"
            >
              <ToggleButton value={false} aria-label="Normal zoom" sx={{ minHeight: TAP, minWidth: 56 }}>1×</ToggleButton>
              <ToggleButton value aria-label="Zoom in" sx={{ minHeight: TAP, minWidth: 56 }}>2×</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>
      )}

      <Box sx={{ mt: 3, maxWidth: 480, mx: 'auto' }}>{photoButton}</Box>
    </Box>
  );

  const renderManualEntry = () => (
    <Box sx={{ p: 4 }}>
      <TextField
        label="Barcode"
        value={manualBarcode}
        onChange={e => setManualBarcode(e.target.value)}
        onKeyPress={e => {
          if (e.key === 'Enter') {
            handleManualSubmit();
          }
        }}
        fullWidth
        autoFocus
        placeholder="8–14 digits"
        inputProps={{ inputMode: 'numeric' }}
        disabled={busy}
      />
      <Button
        variant="contained"
        onClick={handleManualSubmit}
        disabled={!manualBarcode.trim() || busy}
        startIcon={isLoading ? <CircularProgress size={20} /> : <CheckCircleIcon />}
        fullWidth
        sx={{ mt: 4, minHeight: TAP }}
      >
        {isLoading ? 'Looking up…' : 'Look up barcode'}
      </Button>

      <Box sx={{ mt: 3 }}>{photoButton}</Box>

      {scanHistory.length > 0 && (
        <Box sx={{ mt: 6 }}>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>Recent scans</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {scanHistory.map((b, i) => (
              <Chip
                key={i}
                label={b}
                onClick={() => handleHistoryClick(b)}
                variant="outlined"
                sx={{ height: TAP, borderRadius: `${TAP / 2}px` }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );

  return (
    <PremiumDialog
      open={open}
      onClose={handleClose}
      title="Scan a barcode"
      maxWidth="sm"
      contentSx={{ px: 0, py: 0 }}
      secondaryAction={<Button onClick={handleClose}>Cancel</Button>}
    >
        {/* Mode selector tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 4 }}>
          <Tabs value={mode} onChange={handleModeChange} variant="fullWidth">
            <Tab
              value="camera"
              label="Camera"
              icon={<CameraIcon />}
              iconPosition="start"
              disabled={!hasCameraApi()}
            />
            <Tab
              value="manual"
              label="Type it"
              icon={<KeyboardIcon />}
              iconPosition="start"
            />
          </Tabs>
        </Box>

        {cameraError && (
          <Alert severity="warning" sx={{ m: 4, mb: 0 }}>{cameraError}</Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ m: 4, mb: 0 }}>{error}</Alert>
        )}

        {mode === 'camera' ? renderCameraScanner() : renderManualEntry()}

        {/* The phone's own camera app. It focuses properly where the live
            view cannot, and it needs no camera permission from the browser. */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChosen}
          data-testid="scanner-photo-input"
          hidden
        />
    </PremiumDialog>
  );
};

export default BarcodeScanner;
