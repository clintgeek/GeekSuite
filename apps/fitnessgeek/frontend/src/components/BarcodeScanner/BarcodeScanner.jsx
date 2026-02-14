import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  TextField,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Divider,
  Tabs,
  Tab
} from '@mui/material';
import {
  Close as CloseIcon,
  Keyboard as KeyboardIcon,
  CheckCircle as CheckCircleIcon,
  CameraAlt as CameraIcon,
  FlashlightOn as TorchOnIcon,
  FlashlightOff as TorchOffIcon
} from '@mui/icons-material';
import { fitnessGeekService } from '../../services/fitnessGeekService';
import './BarcodeScanner.css';

const BarcodeScanner = ({ open, onClose, onBarcodeScanned }) => {
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanHistory, setScanHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState('camera'); // 'camera' or 'manual'
  const [isScanning, setIsScanning] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scannerRef = useRef(null);
  const trackRef = useRef(null);
  const isScanningRef = useRef(false); // For async callbacks

  // Device detection
  const isSamsungDevice = /Samsung|SM-|Galaxy/i.test(navigator.userAgent);
  const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Load scan history on mount
  useEffect(() => {
    const history = JSON.parse(localStorage.getItem('barcodeScanHistory') || '[]');
    setScanHistory(history.slice(0, 5));
  }, []);

  // Detect cameras and auto-start when dialog opens
  useEffect(() => {
    if (open && mode === 'camera') {
      detectCameras().then(() => {
        // Auto-start camera after a brief delay for state to settle
        setTimeout(() => {
          if (open && !isScanning) {
            startScanner();
          }
        }, 100);
      });
    }
    return () => {
      stopScanner();
    };
  }, [open, mode]);

  const detectCameras = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setCameraError('Camera access not supported in this browser');
        setMode('manual');
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCameraDevices(videoDevices);

      console.log('All cameras found:', videoDevices.map(d => ({ label: d.label, id: d.deviceId.substring(0, 8) })));

      if (videoDevices.length === 0) {
        setCameraError('No camera found');
        setMode('manual');
        return;
      }

      // Find back cameras - be more inclusive
      const backCameras = videoDevices.filter(device => {
        const label = device.label.toLowerCase();
        // Include if it mentions back/rear, OR if it doesn't mention front
        return label.includes('back') || label.includes('rear') ||
               label.includes('environment') || !label.includes('front');
      });

      // Try to find the main camera (avoid ultra-wide for initial selection)
      let optimalCamera = null;
      if (backCameras.length > 1) {
        optimalCamera = backCameras.find(device => {
          const label = device.label.toLowerCase();
          // Prefer cameras that don't have these keywords
          const isProblematic = label.includes('ultra') ||
                                label.includes('wide') ||
                                label.includes('macro') ||
                                label.includes('depth');
          return !isProblematic;
        });

        if (!optimalCamera) {
          optimalCamera = backCameras[0];
        }
      }

      const selectedCam = optimalCamera || backCameras[0] || videoDevices[0];
      setSelectedCamera(selectedCam);

      console.log('Available cameras:', videoDevices.map(d => d.label));
      console.log('Selected camera:', selectedCam?.label);
    } catch (err) {
      console.error('Error detecting cameras:', err);
      setCameraError('Could not access camera');
      setMode('manual');
    }
  };

  const saveToHistory = (barcode) => {
    const history = JSON.parse(localStorage.getItem('barcodeScanHistory') || '[]');
    const newHistory = [barcode, ...history.filter(b => b !== barcode)].slice(0, 10);
    localStorage.setItem('barcodeScanHistory', JSON.stringify(newHistory));
    setScanHistory(newHistory.slice(0, 5));
  };

  const handleBarcodeDetected = async (barcode) => {
    if (!barcode) return;

    saveToHistory(barcode);
    stopScanner();

    if (!/^[0-9]{8,14}$/.test(barcode)) {
      setError('Invalid barcode format. Must be 8-14 digits.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const food = await fitnessGeekService.getFoodByBarcode(barcode);
      if (food) {
        onBarcodeScanned(food);
        onClose();
      } else {
        setError('No product found for this barcode. Try manual entry or a different barcode.');
      }
    } catch {
      setError('Failed to lookup barcode.');
    } finally {
      setIsLoading(false);
    }
  };

  const startScanner = async () => {
    setCameraError(null);
    setIsLoading(true);

    try {
      // Check for native BarcodeDetector API (Chrome 83+ on Android)
      const hasNativeBarcodeDetector = 'BarcodeDetector' in window;
      let useNativeDetector = false;

      if (hasNativeBarcodeDetector) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          useNativeDetector = formats.length > 0;
          console.log('Native BarcodeDetector formats:', formats);
        } catch (e) {
          console.log('Native BarcodeDetector check failed:', e);
        }
      }

      if (!useNativeDetector) {
        // Load ZXing library as fallback
        if (!window.ZXing) {
          await loadZXingLibrary();
        }

        const { BrowserMultiFormatReader, BarcodeFormat } = window.ZXing;

        // Configure hints for better barcode detection
        const hints = new Map();
        hints.set(2, [  // DecodeHintType.POSSIBLE_FORMATS = 2
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39
        ]);
        hints.set(3, true);  // DecodeHintType.TRY_HARDER = 3

        scannerRef.current = new BrowserMultiFormatReader(hints);
      }

      // Request camera with high resolution for better scanning
      const constraints = {
        video: {
          ...(selectedCamera?.deviceId
            ? { deviceId: { exact: selectedCamera.deviceId } }
            : { facingMode: 'environment' }
          ),
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 15 },
          focusMode: { ideal: 'continuous' }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      trackRef.current = videoTrack;

      // Check for torch capability
      const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      setHasTorch(!!capabilities.torch);
      setTorchOn(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsScanning(true);
      isScanningRef.current = true;

      // Start scanning - use native or ZXing
      if (useNativeDetector) {
        // Use native BarcodeDetector API
        const barcodeDetector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
        });

        console.log('Starting native BarcodeDetector scan loop');

        const scanFrame = async () => {
          if (!isScanningRef.current || !videoRef.current) {
            return;
          }

          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const barcode = barcodes[0];
              console.log('Barcode detected:', barcode.rawValue);
              isScanningRef.current = false;
              handleBarcodeDetected(barcode.rawValue);
              return;
            }
          } catch (e) {
            // Ignore detection errors
          }

          if (isScanningRef.current) {
            requestAnimationFrame(scanFrame);
          }
        };

        scannerRef.current = {
          isNative: true,
          stop: () => { isScanningRef.current = false; }
        };

        requestAnimationFrame(scanFrame);

      } else {
        // Use ZXing fallback
        scannerRef.current.decodeFromVideoDevice(
          null,
          videoRef.current,
          (result, error) => {
            if (result) {
              console.log('Barcode detected:', result.text);
              handleBarcodeDetected(result.text);
            }
          }
        );
      }
    } catch (err) {
      console.error('Error starting scanner:', err);
      setCameraError(err.message || 'Failed to access camera. Check permissions.');
      setMode('manual');
    } finally {
      setIsLoading(false);
    }
  };

  const loadZXingLibrary = () => {
    return new Promise((resolve, reject) => {
      if (window.ZXing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const stopScanner = () => {
    setIsScanning(false);
    isScanningRef.current = false;
    trackRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Handle both native detector and ZXing cleanup
    if (scannerRef.current) {
      if (scannerRef.current.isNative) {
        scannerRef.current = null;
      } else if (scannerRef.current.reset) {
        scannerRef.current.reset();
        scannerRef.current = null;
      }
    }

    setTorchOn(false);
    setHasTorch(false);
  };

  const toggleTorch = async () => {
    if (!trackRef.current) return;

    try {
      const newTorchState = !torchOn;
      await trackRef.current.applyConstraints({
        advanced: [{ torch: newTorchState }]
      });
      setTorchOn(newTorchState);
    } catch (e) {
      console.log('Could not toggle torch:', e.message);
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

  const renderCameraScanner = () => (
    <Box sx={{ p: 2 }}>
      {cameraError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {cameraError}
        </Alert>
      )}

      <Box sx={{
        position: 'relative',
        width: '100%',
        height: { xs: 280, sm: 320 },
        backgroundColor: '#000',
        borderRadius: 2,
        overflow: 'hidden'
      }}>
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
          autoPlay
          playsInline
          muted
        />

        {isScanning && (
          <div className="scanner-overlay">
            <div className="scanner-corners scanner-corner-tl"></div>
            <div className="scanner-corners scanner-corner-tr"></div>
            <div className="scanner-corners scanner-corner-bl"></div>
            <div className="scanner-corners scanner-corner-br"></div>
            <div className="scan-line"></div>
          </div>
        )}

        {isLoading && (
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}>
            <CircularProgress sx={{ color: 'white' }} />
          </Box>
        )}
      </Box>

      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
        <Button
          variant={isScanning ? 'outlined' : 'contained'}
          onClick={isScanning ? stopScanner : startScanner}
          startIcon={isScanning ? <CloseIcon /> : <CameraIcon />}
          disabled={isLoading}
          sx={{ flex: 1 }}
        >
          {isScanning ? 'Stop Camera' : 'Start Camera'}
        </Button>
        {isScanning && hasTorch && (
          <Button
            variant={torchOn ? 'contained' : 'outlined'}
            onClick={toggleTorch}
            color={torchOn ? 'warning' : 'primary'}
            sx={{ minWidth: 'auto', px: 2 }}
          >
            {torchOn ? <TorchOnIcon /> : <TorchOffIcon />}
          </Button>
        )}
      </Box>
    </Box>
  );

  const renderManualEntry = () => (
    <Box sx={{ p: 2 }}>
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
        placeholder="Enter 8-14 digit barcode"
        disabled={isLoading}
      />
      <Button
        variant="contained"
        onClick={handleManualSubmit}
        disabled={!manualBarcode.trim() || isLoading}
        startIcon={isLoading ? <CircularProgress size={20} /> : <CheckCircleIcon />}
        fullWidth
        sx={{ mt: 2 }}
      >
        {isLoading ? 'Looking up...' : 'Look Up Barcode'}
      </Button>

      {scanHistory.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Scans:</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {scanHistory.map((b, i) => (
              <Chip
                key={i}
                label={b}
                onClick={() => handleHistoryClick(b)}
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: 2 },
          margin: { xs: 0, sm: 2 },
          maxHeight: { xs: '100vh', sm: '90vh' },
          width: { xs: '100%', sm: 'auto' }
        }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Scan Barcode</Typography>
          <IconButton onClick={handleClose}><CloseIcon /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {/* Mode selector tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={mode} onChange={handleModeChange} variant="fullWidth">
            <Tab
              value="camera"
              label="Camera"
              icon={<CameraIcon />}
              iconPosition="start"
              disabled={cameraDevices.length === 0}
            />
            <Tab
              value="manual"
              label="Manual"
              icon={<KeyboardIcon />}
              iconPosition="start"
            />
          </Tabs>
        </Box>

        {error && (
          <Alert severity="error" sx={{ m: 2, mb: 0 }}>{error}</Alert>
        )}

        {mode === 'camera' ? renderCameraScanner() : renderManualEntry()}
      </DialogContent>

      <DialogActions sx={{ p: 2, pt: 1 }}>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;
