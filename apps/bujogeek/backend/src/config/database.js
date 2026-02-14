const mongoose = require('mongoose');

// Set strictQuery to false to prepare for Mongoose 7
mongoose.set('strictQuery', false);

const connectDB = async () => {
  try {
    const mongoURI = process.env.DB_URI || 'mongodb://ngeek_usr_f8z3k9b1:NotePass_ngk_7Hq-pLm5sRzYtW2_K@192.168.1.17:27017/bujogeek?authSource=admin';

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('MongoDB Connected Successfully');
  } catch (error) {
    console.error('MongoDB Connection Error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;