/**
 * Blood pressure utility functions
 */

/**
 * Categorize blood pressure readings based on AHA (American Heart Association) guidelines
 * @param {number} systolic - Systolic blood pressure
 * @param {number} diastolic - Diastolic blood pressure
 * @returns {Object} Object with stage and color properties
 */
export const categorizeBP = (systolic, diastolic) => {
  if (systolic < 120 && diastolic < 80) {
    return {
      stage: 'Normal',
      color: '#4caf50',
      category: 'Normal'
    };
  }

  if (systolic < 130 && diastolic < 80) {
    return {
      stage: 'Elevated',
      color: '#ff9800',
      category: 'Elevated'
    };
  }

  if ((systolic >= 130 && systolic < 140) || (diastolic >= 80 && diastolic < 90)) {
    return {
      stage: 'Stage 1',
      color: '#f44336',
      category: 'Stage 1'
    };
  }

  if (systolic >= 140 || diastolic >= 90) {
    return {
      stage: 'Stage 2',
      color: '#d32f2f',
      category: 'Stage 2'
    };
  }

  return {
    stage: 'Unknown',
    color: '#9e9e9e',
    category: 'Unknown'
  };
};

/**
 * Get blood pressure category description
 * @param {string} stage - Blood pressure stage
 * @returns {string} Description of the stage
 */
export const getBPStageDescription = (stage) => {
  const descriptions = {
    'Normal': 'Blood pressure is within normal range',
    'Elevated': 'Blood pressure is elevated but not yet hypertensive',
    'Stage 1': 'Stage 1 hypertension - moderate elevation',
    'Stage 2': 'Stage 2 hypertension - significant elevation',
    'Unknown': 'Unable to categorize blood pressure reading'
  };

  return descriptions[stage] || descriptions['Unknown'];
};

/**
 * Get blood pressure ranges for each category
 * @returns {Object} Object with category ranges
 */
export const getBPRanges = () => {
  return {
    'Normal': { systolic: '< 120', diastolic: '< 80' },
    'Elevated': { systolic: '120-129', diastolic: '< 80' },
    'Stage 1': { systolic: '130-139', diastolic: '80-89' },
    'Stage 2': { systolic: '≥ 140', diastolic: '≥ 90' }
  };
};