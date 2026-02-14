const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Import the BloodPressure model
const BloodPressure = require('../src/models/BloodPressure');

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitnessgeek?authSource=admin';

// Function to parse blood pressure reading
function parseBPReading(readingStr) {
  if (!readingStr) return { systolic: null, diastolic: null };

  // Handle formats like "145 Sys / 96 Dia" or "128 Sys / 79 Dia"
  const match = readingStr.match(/(\d+)\s+Sys\s*\/\s*(\d+)\s+Dia/);
  if (match) {
    return {
      systolic: parseInt(match[1]),
      diastolic: parseInt(match[2])
    };
  }

  return { systolic: null, diastolic: null };
}

// Function to parse heart rate
function parseHeartRate(hrStr) {
  if (!hrStr) return null;

  // Handle formats like "96 bpm" or "74 bpm"
  const match = hrStr.match(/(\d+)\s*bpm/);
  if (match) {
    return parseInt(match[1]);
  }

  return null;
}

// Function to parse date and time
function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;

  // Clean up strings
  const cleanDate = dateStr.trim();
  const cleanTime = timeStr.trim();

  // Parse date like "Jan 5, 2025"
  const dateMatch = cleanDate.match(/(\w+)\s+(\d+),\s+(\d+)/);
  if (!dateMatch) return null;

  const month = dateMatch[1];
  const day = parseInt(dateMatch[2]);
  const year = parseInt(dateMatch[3]);

  // Convert month name to number
  const monthMap = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };

  const monthNum = monthMap[month];
  if (monthNum === undefined) return null;

  // Create base date
  let date = new Date(year, monthNum, day);

  // Add time
  const timeMatch = cleanTime.match(/(\d+):(\d+)\s*(AM|PM)/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]);
    const period = timeMatch[3];

    if (period === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period === 'AM' && hour === 12) {
      hour = 0;
    }

    date.setHours(hour, minute, 0, 0);
  }

  return date;
}

// Function to parse CSV data manually
function parseCSVManual(csvContent) {
  const lines = csvContent.trim().split('\n');
  const data = [];

  let currentDate = '';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check if this is a date line (starts with quote and contains month)
    if (line.startsWith('"') && line.includes(',')) {
      const dateMatch = line.match(/"\s*([A-Za-z]{3}\s+\d+,\s+\d{4})"/);
      if (dateMatch) {
        currentDate = dateMatch[1].trim();
        continue;
      }
    }

    // This should be a data line
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));

    if (values.length >= 4 && currentDate) {
      const entry = {
        date: currentDate,
        time: values[0],
        reading: values[1],
        heartRate: values[2],
        category: values[3],
        notes: values[4] || ''
      };

      data.push(entry);
    }
  }

  return data;
}

// Main import function
async function importBloodPressureData() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const userId = '6818c2bddcf626909f6a93a1';
    console.log(`✅ Using user ID: ${userId}`);

    // Define CSV files to import
    const csvFiles = [
      { name: 'Blood Pressure Dec.csv', month: 'Dec' },
      { name: 'Blood Pressure Jan.csv', month: 'Jan' },
      { name: 'Blood Pressure Feb.csv', month: 'Feb' },
      { name: 'Blood Pressure Mar.csv', month: 'Mar' }
    ];

    let totalImported = 0;
    let totalSkipped = 0;

    for (const fileInfo of csvFiles) {
      const filePath = path.join(__dirname, '../../', fileInfo.name);

      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${fileInfo.name}`);
        continue;
      }

      console.log(`\n📁 Processing ${fileInfo.name}...`);

      // Read CSV file
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const csvData = parseCSVManual(csvContent);

      console.log(`Found ${csvData.length} entries in ${fileInfo.name}`);

      for (const entry of csvData) {
        try {
          // Parse the data
          const { systolic, diastolic } = parseBPReading(entry.reading);
          const pulse = parseHeartRate(entry.heartRate);
          const logDate = parseDateTime(entry.date, entry.time);
          const notes = entry.notes;

          // Validate required fields
          if (!systolic || !diastolic || !logDate) {
            console.log(`⚠️  Skipping invalid entry: ${JSON.stringify(entry)}`);
            totalSkipped++;
            continue;
          }

          // Check if entry already exists for this date
          const existingEntry = await BloodPressure.findOne({
            userId,
            log_date: {
              $gte: new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate()),
              $lt: new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate() + 1)
            }
          });

          if (existingEntry) {
            console.log(`⚠️  Entry already exists for ${logDate.toDateString()}, skipping...`);
            totalSkipped++;
            continue;
          }

          // Create new blood pressure entry
          const bpEntry = new BloodPressure({
            userId,
            systolic,
            diastolic,
            pulse,
            log_date: logDate,
            notes
          });

          await bpEntry.save();
          console.log(`✅ Imported: ${systolic}/${diastolic}${pulse ? `, pulse: ${pulse}` : ''} on ${logDate.toDateString()}`);
          totalImported++;

        } catch (error) {
          console.error(`❌ Error processing entry: ${JSON.stringify(entry)}`, error.message);
          totalSkipped++;
        }
      }
    }

    console.log(`\n🎉 Import completed!`);
    console.log(`✅ Total imported: ${totalImported}`);
    console.log(`⚠️  Total skipped: ${totalSkipped}`);

  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the import
if (require.main === module) {
  importBloodPressureData();
}

module.exports = { importBloodPressureData };