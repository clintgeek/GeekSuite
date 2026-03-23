import axios from './api';

const API_URL = '/api/upload';

/**
 * Upload a photo
 * @param {File} file - The file object to upload
 * @returns {Promise<Object>} - The response data containing the file URL
 */
const uploadPhoto = async (file) => {
  const formData = new FormData();
  formData.append('photo', file);

  const response = await axios.post(API_URL, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

const uploadService = {
  uploadPhoto,
};

export default uploadService;
