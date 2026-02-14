import { useState, useCallback } from 'react';
import { fitnessGeekService } from '../services/fitnessGeekService';

export const useBarcodeScanner = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const openScanner = useCallback(() => {
    setIsOpen(true);
    setError(null);
  }, []);

  const closeScanner = useCallback(() => {
    setIsOpen(false);
    setError(null);
    setIsLoading(false);
  }, []);

  const handleBarcodeScanned = useCallback(async (barcode, onSuccess) => {
    if (!barcode) return;

    setIsLoading(true);
    setError(null);

    try {
      // Validate barcode format
      const barcodeRegex = /^[0-9]{8,14}$/;
      if (!barcodeRegex.test(barcode)) {
        throw new Error('Invalid barcode format. Please try again.');
      }

      // Look up food by barcode
      const food = await fitnessGeekService.getFoodByBarcode(barcode);

      if (food) {
        onSuccess?.(food);
        closeScanner();
      } else {
        setError('No food found for this barcode. You can add it manually.');
      }
    } catch (err) {
      console.error('Error looking up barcode:', err);
      setError(err.message || 'Failed to look up barcode. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [closeScanner]);

  return {
    isOpen,
    isLoading,
    error,
    openScanner,
    closeScanner,
    handleBarcodeScanned
  };
};