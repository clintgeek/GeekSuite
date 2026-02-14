const instrumentService = require('../services/instrumentService');

class InstrumentController {
  // GET /api/instruments
  async getAllInstruments(req, res, next) {
    try {
      const instruments = await instrumentService.getAllInstruments();
      res.json({ success: true, data: instruments });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/instruments/:id
  async getInstrumentById(req, res, next) {
    try {
      const instrument = await instrumentService.getInstrumentById(req.params.id);
      res.json({ success: true, data: instrument });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/instruments/:id/tunings
  async getTuningConfigurations(req, res, next) {
    try {
      const tunings = await instrumentService.getTuningConfigurations(req.params.id);
      res.json({ success: true, data: tunings });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/user/instruments
  async getUserInstruments(req, res, next) {
    try {
      const instruments = await instrumentService.getUserInstruments(req.user.id);
      res.json({ success: true, data: instruments });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/user/instruments
  async addUserInstrument(req, res, next) {
    try {
      const { instrument_id, skill_level, start_fresh } = req.body;

      if (!instrument_id) {
        return res.status(400).json({ success: false, message: 'Instrument ID is required' });
      }

      // Check if user previously had this instrument
      const previous = await instrumentService.checkPreviousInstrument(req.user.id, instrument_id);

      const result = await instrumentService.addUserInstrument(
        req.user.id,
        instrument_id,
        skill_level,
        start_fresh
      );

      res.status(201).json({
        success: true,
        data: result,
        was_previous: !!previous,
        previous_progress: previous
          ? {
              lessons_completed: previous.lessons_completed,
              total_practice_time: previous.total_practice_time,
              skill_level: previous.skill_level,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/user/active-instrument
  async setActiveInstrument(req, res, next) {
    try {
      const { instrument_id } = req.body;
      await instrumentService.setActiveInstrument(req.user.id, instrument_id);
      const activeInstrument = await instrumentService.getActiveInstrument(req.user.id);
      res.json({ success: true, data: activeInstrument });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/user/active-instrument
  async getActiveInstrument(req, res, next) {
    try {
      const instrument = await instrumentService.getActiveInstrument(req.user.id);
      res.json({ success: true, data: instrument });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/user/instruments/:instrumentId
  async removeUserInstrument(req, res, next) {
    try {
      const { instrumentId } = req.params;
      await instrumentService.removeUserInstrument(req.user.id, instrumentId);
      res.json({ success: true, message: 'Instrument removed successfully' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InstrumentController();
