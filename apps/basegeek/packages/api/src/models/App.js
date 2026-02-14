import mongoose from 'mongoose';

const appSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: 'Dashboard',
  },
  color: {
    type: String,
    default: '#e8a849',
  },
  url: {
    type: String,
    required: true,
  },
  healthEndpoint: {
    type: String,
    default: '/api/health',
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  tag: {
    type: String,
    default: 'app',
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

const App = mongoose.model('App', appSchema);

export default App;
