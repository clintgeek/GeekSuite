import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  TextField,
  Card,
  CardContent,
  Chip,
  Divider
} from '@mui/material';
import {
  QrCodeScanner as ScannerIcon,
  CameraAlt as CameraIcon,
  QrCode as QrCodeIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Keyboard as KeyboardIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { fitnessGeekService } from '../../services/fitnessGeekService.js';
import './BarcodeScanner.css';

const BarcodeScanner = ({ open, onClose, onBarcodeScanned }) => {
  const [scannerType, setScannerType] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannedCode, setScannedCode] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scannerRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Scanner types available
  const scannerTypes = [
    {
      id: 'zxing',
      name: 'ZXing Scanner',
      description: 'Fast and reliable barcode detection',
      icon: <QrCodeIcon />,
      color: '#2196F3'
    },
    {
      id: 'quagga',
      name: 'Quagga Scanner',
      description: 'Pure JavaScript barcode scanner',
      icon: <ScannerIcon />,
      color: '#4CAF50'
    },
    {
      id: 'manual',
      name: 'Manual Entry',
      description: 'Type barcode manually',
      icon: <KeyboardIcon />,
      color: '#FF9800'
    }
  ];

  useEffect(() => {
    if (open) {
      detectEnvironment();
      loadScanHistory();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const detectEnvironment = async () => {
    try {
      // Check if we're in a PWA
      const isPWA = window.matchMedia && (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        (window.navigator && window.navigator.standalone)
      );

      // Check if we're on mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // Get available cameras
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameraDevices(videoDevices);

        // Prefer back camera if available
        const backCamera = videoDevices.find(device =>
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('rear')
        );
        setSelectedCamera(backCamera || videoDevices[0]);
      }

      // Auto-select best scanner based on environment
      if (isPWA && isMobile) {
        setScannerType('zxing'); // ZXing works best on mobile PWAs
      } else if (isMobile) {
        setScannerType('zxing'); // ZXing is more reliable on mobile browsers
      } else {
        setScannerType('quagga'); // Quagga is more reliable on desktop
      }
    } catch (err) {
      console.error('Error detecting environment:', err);
      setScannerType('manual');
    }
  };

  const loadScanHistory = () => {
    try {
      const history = JSON.parse(localStorage.getItem('barcodeScanHistory') || '[]');
      setScanHistory(history.slice(0, 5)); // Keep last 5 scans
    } catch (err) {
      console.error('Error loading scan history:', err);
    }
  };

  const saveToHistory = (barcode) => {
    try {
      const history = JSON.parse(localStorage.getItem('barcodeScanHistory') || '[]');
      const newHistory = [barcode, ...history.filter(item => item !== barcode)].slice(0, 10);
      localStorage.setItem('barcodeScanHistory', JSON.stringify(newHistory));
      setScanHistory(newHistory.slice(0, 5));
    } catch (err) {
      console.error('Error saving to history:', err);
    }
  };

  const startScanner = async () => {
    if (!scannerType || scannerType === 'manual') return;

    setIsLoading(true);
    setError(null);

    try {
      if (scannerType === 'zxing') {
        await startZXingScanner();
      } else if (scannerType === 'quagga') {
        await startQuaggaScanner();
      }
    } catch (err) {
      console.error('Error starting scanner:', err);
      setError('Failed to start camera. Please check permissions or try manual entry.');
    } finally {
      setIsLoading(false);
    }
  };

  const startZXingScanner = async () => {
    // Load ZXing library if not already loaded
    if (!window.ZXing) {
      await loadZXingLibrary();
    }

    const { BrowserMultiFormatReader } = window.ZXing;
    scannerRef.current = new BrowserMultiFormatReader();

    // Get video stream
    const constraints = {
      video: {
        facingMode: 'environment', // Use back camera
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    setIsScanning(true);

    // Start scanning
    scannerRef.current.decodeFromVideoDevice(
      null,
      videoRef.current,
      (result) => {
        if (result) {
          handleBarcodeDetected(result.text);
        }
      }
    );
  };

  const startQuaggaScanner = async () => {
    // Load Quagga library if not already loaded
    if (!window.Quagga) {
      await loadQuaggaLibrary();
    }

    const Quagga = window.Quagga;

    // Stop any existing scanner
    Quagga.stop();

    // Initialize Quagga
    await Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: videoRef.current,
        constraints: {
          width: { min: 640 },
          height: { min: 480 },
          facingMode: "environment",
          aspectRatio: { min: 1, max: 2 }
        }
      },
      locator: {
        patchSize: "medium",
        halfSample: true
      },
      numOfWorkers: navigator.hardwareConcurrency || 2,
      frequency: 10,
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader",
          "code_128_reader",
          "code_39_reader",
          "upc_reader",
          "upc_e_reader"
        ]
      },
      locate: true
    });

    setIsScanning(true);

    // Listen for scan results
    Quagga.onDetected((result) => {
      if (result && result.codeResult) {
        handleBarcodeDetected(result.codeResult.code);
      }
    });

    // Start scanning
    Quagga.start();
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

  const loadQuaggaLibrary = () => {
    return new Promise((resolve, reject) => {
      if (window.Quagga) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/quagga@0.12.1/dist/quagga.min.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const stopScanner = () => {
    setIsScanning(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (scannerRef.current) {
      if (window.Quagga && scannerRef.current === window.Quagga) {
        window.Quagga.stop();
      } else if (scannerRef.current.reset) {
        scannerRef.current.reset();
      }
      scannerRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const handleBarcodeDetected = async (barcode) => {
    if (!barcode || scannedCode === barcode) return;

    setScannedCode(barcode);
    saveToHistory(barcode);
    stopScanner();

    // Validate barcode format
    if (!isValidBarcode(barcode)) {
      setError('Invalid barcode format. Please try again.');
      return;
    }

    try {
      setIsLoading(true);

      // Look up food by barcode
      const food = await fitnessGeekService.getFoodByBarcode(barcode);

      if (food) {
        onBarcodeScanned(food);
        onClose();
      } else {
        setError('No food found for this barcode. You can add it manually.');
      }
    } catch (err) {
      console.error('Error looking up barcode:', err);
      setError('Failed to look up barcode. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualBarcode.trim()) return;

    const barcode = manualBarcode.trim();

    if (!isValidBarcode(barcode)) {
      setError('Invalid barcode format. Please enter a valid barcode.');
      return;
    }

    await handleBarcodeDetected(barcode);
  };

  const isValidBarcode = (barcode) => {
    // Basic validation for common barcode formats
    const barcodeRegex = /^[0-9]{8,14}$/;
    return barcodeRegex.test(barcode);
  };

  const handleHistoryItemClick = (barcode) => {
    setManualBarcode(barcode);
    handleManualSubmit();
  };

  const handleClose = () => {
    stopScanner();
    setScannedCode(null);
    setError(null);
    setManualBarcode('');
    onClose();
  };

    const renderScanner = () => {
    if (scannerType === 'manual') {
      return (
        <Box sx={{ p: { xs: 1, sm: 2 } }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Enter Barcode Manually
          </Typography>

          <TextField
            fullWidth
            label="Barcode"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="Enter 8-14 digit barcode"
            inputProps={{ maxLength: 14 }}
            sx={{ mb: 2 }}
          />

          <Button
            fullWidth
            variant="contained"
            onClick={handleManualSubmit}
            disabled={!manualBarcode.trim() || isLoading}
            startIcon={isLoading ? <CircularProgress size={20} /> : <CheckCircleIcon />}
          >
            {isLoading ? 'Looking up...' : 'Look Up Barcode'}
          </Button>

          {scanHistory.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Recent Scans:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {scanHistory.map((barcode, index) => (
                  <Chip
                    key={index}
                    label={barcode}
                    onClick={() => handleHistoryItemClick(barcode)}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      );
    }

    return (
      <Box sx={{
        position: 'relative',
        width: '100%',
        height: { xs: 250, sm: 300, md: 350 },
        minHeight: 250
      }}>
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 8
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
          <div className="scanner-loading">
            <CircularProgress />
          </div>
        )}
      </Box>
    );
  };

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
      <DialogTitle sx={{ pb: 1, px: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
            Scan Barcode
          </Typography>
          <IconButton onClick={handleClose} size="large">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {!scannerType ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <CircularProgress />
            <Typography sx={{ mt: 1 }}>Initializing scanner...</Typography>
          </Box>
        ) : (
          <>
            {/* Scanner Type Selector */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, pb: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                Scanner Type:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {scannerTypes.map((type) => (
                  <Chip
                    key={type.id}
                    label={type.name}
                    icon={type.icon}
                    onClick={() => {
                      stopScanner();
                      setScannerType(type.id);
                      setError(null);
                    }}
                    variant={scannerType === type.id ? 'filled' : 'outlined'}
                    color={scannerType === type.id ? 'primary' : 'default'}
                    size="small"
                    sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                  />
                ))}
              </Box>
            </Box>

            <Divider />

            {/* Error Display */}
            {error && (
              <Alert severity="error" sx={{ m: 2 }}>
                {error}
              </Alert>
            )}

            {/* Scanner Content */}
            {renderScanner()}

            {/* Camera Controls */}
            {scannerType !== 'manual' && cameraDevices.length > 1 && (
              <Box sx={{ p: { xs: 1.5, sm: 2 }, pt: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                  Camera:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {cameraDevices.map((device) => (
                    <Chip
                      key={device.deviceId}
                      label={device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                      onClick={() => {
                        setSelectedCamera(device);
                        stopScanner();
                        setTimeout(startScanner, 100);
                      }}
                      variant={selectedCamera?.deviceId === device.deviceId ? 'filled' : 'outlined'}
                      size="small"
                      sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </>
        )}
      </DialogContent>

            <DialogActions sx={{ p: { xs: 1.5, sm: 2 }, pt: 1, gap: 1 }}>
        {scannerType !== 'manual' && (
          <Button
            onClick={() => {
              if (isScanning) {
                stopScanner();
              } else {
                startScanner();
              }
            }}
            startIcon={isScanning ? <CloseIcon /> : <CameraIcon />}
            disabled={isLoading}
            size="large"
            sx={{ minWidth: { xs: 'auto', sm: '120px' } }}
          >
            {isScanning ? 'Stop' : 'Start'}
          </Button>
        )}

        <Button onClick={handleClose} size="large">
          Cancel
        </Button>
      </DialogActions>


    </Dialog>
  );
};

export default BarcodeScanner;