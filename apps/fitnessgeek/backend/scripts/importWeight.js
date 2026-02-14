const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Import the Weight model
const Weight = require('../src/models/Weight');

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitnessgeek?authSource=admin';

// Function to parse weight value
function parseWeight(weightStr) {
  if (!weightStr) return null;

  // Handle formats like "287.5 lbs" or "280.9 lbs"
  const match = weightStr.match(/(\d+\.?\d*)\s*lbs/);
  if (match) {
    return parseFloat(match[1]);
  }

  return null;
}

// Function to parse date and time
function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;

  // Clean up strings
  const cleanDate = dateStr.trim();
  const cleanTime = timeStr.trim();

  // Parse date like "Feb 28, 2025"
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

    if (values.length >= 2 && currentDate) {
      const entry = {
        date: currentDate,
        time: values[0],
        weight: values[1],
        change: values[2] || '',
        bmi: values[3] || '',
        bodyFat: values[4] || '',
        skeletalMuscle: values[5] || '',
        boneMass: values[6] || '',
        bodyWater: values[7] || ''
      };

      data.push(entry);
    }
  }

  return data;
}

// Main import function
async function importWeightData() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const userId = '6818c2bddcf626909f6a93a1';
    console.log(`✅ Using user ID: ${userId}`);

    // Define CSV files to import
    const csvFiles = [
      { name: 'Weight Jan.csv', month: 'Jan' },
      { name: 'Weight Feb.csv', month: 'Feb' },
      { name: 'Weight Mar.csv', month: 'Mar' }
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
          const weightValue = parseWeight(entry.weight);
          const logDate = parseDateTime(entry.date, entry.time);

          // Create notes from additional data
          const notes = [];
          if (entry.change && entry.change !== '--') notes.push(`Change: ${entry.change}`);
          if (entry.bmi && entry.bmi !== '--') notes.push(`BMI: ${entry.bmi}`);
          if (entry.bodyFat && entry.bodyFat !== '--') notes.push(`Body Fat: ${entry.bodyFat}`);
          if (entry.skeletalMuscle && entry.skeletalMuscle !== '--') notes.push(`Skeletal Muscle: ${entry.skeletalMuscle}`);
          if (entry.boneMass && entry.boneMass !== '--') notes.push(`Bone Mass: ${entry.boneMass}`);
          if (entry.bodyWater && entry.bodyWater !== '--') notes.push(`Body Water: ${entry.bodyWater}`);

          const notesStr = notes.join(', ');

          // Validate required fields
          if (!weightValue || !logDate) {
            console.log(`⚠️  Skipping invalid entry: ${JSON.stringify(entry)}`);
            totalSkipped++;
            continue;
          }

          // Check if entry already exists for this date
          const existingEntry = await Weight.findOne({
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

          // Create new weight entry
          const weightEntry = new Weight({
            userId,
            weight_value: weightValue,
            log_date: logDate,
            notes: notesStr
          });

          await weightEntry.save();
          console.log(`✅ Imported: ${weightValue} lbs on ${logDate.toDateString()}`);
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
  importWeightData();
}

module.exports = { importWeightData };