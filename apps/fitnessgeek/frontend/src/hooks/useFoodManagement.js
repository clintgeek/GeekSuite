import { useState } from 'react';
import { fitnessGeekService } from '../services/fitnessGeekService.js';

export const useFoodManagement = () => {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadFoods = async () => {
    setLoading(true);
    try {
      const response = await fitnessGeekService.getAllFoods(1000);
      setFoods(response || []);
    } catch (error) {
      console.error('Error loading foods:', error);
      setError('Failed to load foods');
    } finally {
      setLoading(false);
    }
  };

  const updateFood = async (foodId, data) => {
    try {
      await fitnessGeekService.updateFood(foodId, data);
      await loadFoods();
      setSuccessMessage('Food updated successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      return true;
    } catch (error) {
      console.error('Error updating food:', error);
      setError('Failed to update food');
      return false;
    }
  };

  const deleteFood = async (foodId) => {
    try {
      await fitnessGeekService.deleteFood(foodId);
      await loadFoods();
      setSuccessMessage('Food deleted successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      return true;
    } catch (error) {
      console.error('Error deleting food:', error);
      setError('Failed to delete food');
      return false;
    }
  };

  const clearError = () => setError('');
  const clearSuccess = () => setSuccessMessage('');

  return {
    foods,
    loading,
    error,
    successMessage,
    loadFoods,
    updateFood,
    deleteFood,
    clearError,
    clearSuccess
  };
};
