import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Use the same connection as the main app
const userGeekUri = process.env.USERGEEK_MONGODB_URI || 'mongodb://localhost:27017/userGeek?authSource=admin';

// Create connection with error handling
const userGeekConn = mongoose.createConnection(userGeekUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Log connection status
userGeekConn.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

userGeekConn.on('connected', () => {
    console.log('Connected to userGeek database');
});

userGeekConn.on('disconnected', () => {
    console.log('Disconnected from userGeek database');
});

// Test the connection
userGeekConn.once('open', async () => {
    try {
        console.log('Testing userGeek database connection...');
        const collections = await userGeekConn.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));

        // Get detailed collection info
        const collectionInfo = await userGeekConn.db.collection('users').findOne({});
        console.log('Collection sample document:', {
            fields: Object.keys(collectionInfo || {}),
            hasPasswordHash: collectionInfo ? 'passwordHash' in collectionInfo : false,
            rawFields: collectionInfo ? Object.keys(collectionInfo) : []
        });

        // Check if we can find the user directly
        const testUser = await userGeekConn.db.collection('users').findOne(
            { email: 'clint@clintgeek.com' },
            { projection: { _id: 1, email: 1, passwordHash: 1 } }
        );
        console.log('Test user query result:', testUser ? {
            id: testUser._id,
            email: testUser.email,
            hasPasswordHash: 'passwordHash' in testUser,
            rawFields: Object.keys(testUser)
        } : 'No users found');
    } catch (error) {
        console.error('Error testing connection:', error);
    }
});

// ─── Layer 1: Profile (human-facing info) ───
const profileSchema = new mongoose.Schema({
    displayName: { type: String, default: '' },
    avatarUrl:   { type: String, default: '' },
    bio:         { type: String, default: '' },
    timezone:    { type: String, default: 'America/Chicago' },
    locale:      { type: String, default: 'en-US' },
    country:     { type: String, default: '' },
}, { _id: false });

// ─── Layer 2: Preferences (cross-app global settings) ───
const preferencesSchema = new mongoose.Schema({
    theme:       { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
    accentColor: { type: String, default: '#e8a849' },
    defaultApp:  { type: String, default: '' },
    dateFormat:  { type: String, enum: ['ISO', 'US', 'EU'], default: 'US' },
    timeFormat:  { type: String, enum: ['12h', '24h'], default: '12h' },
    startOfWeek: { type: String, enum: ['sunday', 'monday'], default: 'sunday' },
}, { _id: false });

// ─── Main User Schema ───
const userSchema = new mongoose.Schema({
    // ── Identity (auth-level — rarely changes) ──
    username: {
        type: String,
        required: function() { return !this.email; },
        unique: true,
        trim: true,
        sparse: true
    },
    email: {
        type: String,
        required: function() { return !this.username; },
        unique: true,
        trim: true,
        lowercase: true,
        sparse: true
    },
    passwordHash: {
        type: String,
        required: true,
        select: false
    },
    lastLogin: {
        type: Date,
        default: null
    },

    // ── Profile (human-facing) ──
    profile: {
        type: profileSchema,
        default: () => ({}),
    },

    // ── Preferences (cross-app global) ──
    preferences: {
        type: preferencesSchema,
        default: () => ({}),
    },

    // ── App Preferences (namespaced per-app) ──
    // e.g. { notegeek: { editorFontSize: 16 }, bujogeek: { dailyPageLayout: 'timeline' } }
    appPreferences: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: () => new Map(),
    },
}, {
    timestamps: true,
    collection: 'users'
});

// Add a pre-save hook to ensure at least one identifier is provided
userSchema.pre('save', function(next) {
    if (!this.username && !this.email) {
        next(new Error('Either username or email must be provided'));
    }
    next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('passwordHash')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
        next();
    } catch (error) {
        console.error('Password hashing error:', error);
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        if (!candidatePassword) {
            throw new Error('No password provided for comparison');
        }
        if (!this.passwordHash) {
            console.error('User object:', {
                id: this._id,
                username: this.username,
                email: this.email,
                hasPasswordHash: !!this.passwordHash,
                passwordHashLength: this.passwordHash ? this.passwordHash.length : 0
            });
            throw new Error('No stored password found for user');
        }
        return await bcrypt.compare(candidatePassword, this.passwordHash);
    } catch (error) {
        console.error('Password comparison error:', error);
        throw error;
    }
};

// Ensure we're using the correct connection and collection
const User = userGeekConn.models.User || userGeekConn.model('User', userSchema);

// Export both the model and the connection
export { User, userGeekConn };