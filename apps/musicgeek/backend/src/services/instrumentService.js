const Instrument = require('../models/Instrument');
const User = require('../models/User');

class InstrumentService {
  // Get all instruments
  async getAllInstruments() {
    const instruments = await Instrument.find().sort('displayName');
    return instruments.map((inst) => ({
      ...inst.toObject(),
      id: inst._id,
    }));
  }

  // Get instrument by ID
  async getInstrumentById(id) {
    const instrument = await Instrument.findById(id);
    if (!instrument) {
      throw new Error('Instrument not found');
    }
    return {
      ...instrument.toObject(),
      id: instrument._id,
    };
  }

  // Get instrument by name
  async getInstrumentByName(name) {
    const instrument = await Instrument.findOne({ name });
    if (!instrument) {
      throw new Error('Instrument not found');
    }
    return instrument;
  }

  // Get tuning configurations for an instrument
  async getTuningConfigurations(instrumentId) {
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) {
      throw new Error('Instrument not found');
    }
    // Sort by isDefault desc, then name
    return instrument.tunings.sort((a, b) => {
      if (a.isDefault === b.isDefault) return a.name.localeCompare(b.name);
      return b.isDefault - a.isDefault;
    });
  }

  // Get user's instruments
  async getUserInstruments(userId) {
    const user = await User.findOne({ userId }).populate('instruments.instrumentId');
    if (!user) return [];

    return user.instruments
      .filter((ui) => ui.instrumentId) // Filter out if instrument was deleted
      .map((ui) => ({
        id: ui.instrumentId._id, // Map to flattened structure expected by frontend
        instrument_id: ui.instrumentId._id,
        name: ui.instrumentId.name,
        display_name: ui.instrumentId.displayName,
        icon: ui.instrumentId.icon,
        color_theme: ui.instrumentId.colorTheme,
        is_active: ui.isActive,
        skill_level: ui.skillLevel,
        started_at: ui.startedAt,
        total_practice_time: ui.totalPracticeTime,
        lessons_completed: ui.lessonsCompleted,
      }))
      .sort((a, b) => b.is_active - a.is_active || a.display_name.localeCompare(b.display_name));
  }

  // Check if user previously had this instrument
  async checkPreviousInstrument(userId, instrumentId) {
    const user = await User.findOne({ userId });
    if (!user) return null;

    const inst = user.instruments.find(
      (i) => i.instrumentId && i.instrumentId.toString() === instrumentId.toString()
    );
    return inst;
  }

  // Add instrument to user
  async addUserInstrument(userId, instrumentId, skillLevel = 'beginner', startFresh = false) {
    const user = await User.findOne({ userId });
    if (!user) throw new Error('User not found');

    const existingIndex = user.instruments.findIndex(
      (i) => i.instrumentId && i.instrumentId.toString() === instrumentId.toString()
    );

    if (existingIndex !== -1) {
      // Update existing
      if (startFresh) {
        user.instruments[existingIndex].skillLevel = skillLevel;
        user.instruments[existingIndex].totalPracticeTime = 0;
        user.instruments[existingIndex].lessonsCompleted = 0;
        user.instruments[existingIndex].startedAt = new Date();
        user.instruments[existingIndex].isActive = false;
      } else {
        user.instruments[existingIndex].skillLevel = skillLevel;
        user.instruments[existingIndex].isActive = false;
      }
    } else {
      // Add new
      user.instruments.push({
        instrumentId,
        skillLevel,
        isActive: false,
      });
    }

    await user.save();
    return user.instruments.find((i) => i.instrumentId.toString() === instrumentId.toString());
  }

  // Set active instrument for user
  async setActiveInstrument(userId, instrumentId) {
    const user = await User.findOne({ userId });
    if (!user) throw new Error('User not found');

    // Deactivate all
    user.instruments.forEach((i) => (i.isActive = false));

    // Activate target
    const target = user.instruments.find(
      (i) => i.instrumentId && i.instrumentId.toString() === instrumentId.toString()
    );
    if (target) {
      target.isActive = true;
      user.activeInstrumentId = instrumentId;
    } else {
      // If not in list, add it? Or throw? Original logic implied it must exist or be added.
      // Assuming it exists for now based on flow.
      throw new Error('User does not have this instrument');
    }

    await user.save();
    return { success: true };
  }

  // Get user's active instrument
  async getActiveInstrument(userId) {
    const user = await User.findOne({ userId }).populate('activeInstrumentId');
    if (!user || !user.activeInstrumentId) return null;

    const ui = user.instruments.find(
      (i) => i.instrumentId.toString() === user.activeInstrumentId._id.toString()
    );

    return {
      id: user.activeInstrumentId._id,
      name: user.activeInstrumentId.name,
      display_name: user.activeInstrumentId.displayName,
      description: user.activeInstrumentId.description,
      icon: user.activeInstrumentId.icon,
      tuner_enabled: user.activeInstrumentId.features.tunerEnabled,
      has_fretboard: user.activeInstrumentId.features.hasFretboard,
      color_theme: user.activeInstrumentId.colorTheme,
      skill_level: ui?.skillLevel,
      total_practice_time: ui?.totalPracticeTime,
      lessons_completed: ui?.lessonsCompleted,
    };
  }

  // Update user instrument stats
  async updateUserInstrumentStats(userId, instrumentId, stats) {
    const user = await User.findOne({ userId });
    if (!user) return;

    const ui = user.instruments.find(
      (i) => i.instrumentId && i.instrumentId.toString() === instrumentId.toString()
    );
    if (ui) {
      if (stats.total_practice_time !== undefined) ui.totalPracticeTime = stats.total_practice_time;
      if (stats.lessons_completed !== undefined) ui.lessonsCompleted = stats.lessons_completed;
      await user.save();
      return ui;
    }
  }

  // Remove user instrument
  async removeUserInstrument(userId, instrumentId) {
    const user = await User.findOne({ userId });
    if (!user) return { success: true };

    const wasActive =
      user.activeInstrumentId && user.activeInstrumentId.toString() === instrumentId.toString();

    // Remove from array
    user.instruments = user.instruments.filter(
      (i) => i.instrumentId && i.instrumentId.toString() !== instrumentId.toString()
    );

    if (wasActive) {
      user.activeInstrumentId = null;
      // Set new active if exists
      if (user.instruments.length > 0) {
        user.instruments[0].isActive = true;
        user.activeInstrumentId = user.instruments[0].instrumentId;
      }
    }

    await user.save();
    return { success: true };
  }
}

module.exports = new InstrumentService();
