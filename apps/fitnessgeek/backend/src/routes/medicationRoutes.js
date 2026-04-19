const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Medication = require('../models/Medication');
const MedicationLog = require('../models/MedicationLog');
const rx = require('../services/rxService');
const { suggestIndications } = require('../services/indicationMap');
const logger = require('../config/logger');

// Search medications (RxNav approximate search)
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ success: false, error: { message: 'Missing query' } });
    let approx;
    try {
      approx = await rx.searchApproximate(q, 15);
    } catch (e) {
      if (e?.response?.status !== 404) throw e;
      approx = { approximateGroup: { candidate: [] } };
    }
    const candidates = approx?.approximateGroup?.candidate || [];
    const results = candidates
      .filter(c => !!c?.rxcui)
      .map(c => ({
        rxcui: c.rxcui,
        name: c.name || q,
        score: Number(c.score || 0)
      }));
    // Fallback: try direct resolve if no results
    if (!results.length) {
      try {
        const resolved = await rx.resolveRxcuiByName(q);
        const id = resolved?.idGroup?.rxnormId?.[0];
        const name = resolved?.idGroup?.name || q;
        if (id) results.push({ rxcui: id, name, score: 0 });
      } catch (e) {
        if (e?.response?.status === 404) {
          // no candidates; return empty list gracefully
          return res.json({ success: true, data: [] });
        }
        throw e;
      }
    }
    res.json({ success: true, data: results });
  } catch (error) {
    try {
      // Fallback: if related lookups failed, still respond with empty structure
      return res.json({ success: true, data: { ingredient: null, strengths: [], atcClasses: [], epcClasses: [], suggested: [] } });
    } catch (e) {
      // As a final guard, avoid 500s
      res.json({ success: true, data: { ingredient: null, strengths: [], atcClasses: [], epcClasses: [], suggested: [] } });
    }
  }
});

// Medication details: strengths/forms and indication suggestions
router.get('/rxcui/:rxcui', authenticateToken, async (req, res) => {
  try {
    const rxcui = req.params.rxcui;
    // Ingredient (IN); tolerate 404 or missing
    let ingredient = null;
    try {
      const relatedIN = await rx.relatedByTty(rxcui, 'IN');
      ingredient = relatedIN?.relatedGroup?.conceptGroup?.[0]?.conceptProperties?.[0] || null;
    } catch (e) {
      if (e?.response?.status !== 404) throw e;
    }

    // Strengths (SCD) by ingredient if available, else by provided rxcui
    let strengths = [];
    try {
      const relatedSCD = await rx.relatedByTty(ingredient?.rxcui || rxcui, 'SCD');
      const scdProps = relatedSCD?.relatedGroup?.conceptGroup?.[0]?.conceptProperties || [];
      strengths = scdProps.map(p => ({ rxcui: p.rxcui, name: p.name }));
    } catch (e) {
      if (e?.response?.status !== 404) throw e;
      strengths = [];
    }

    // Classes (ATC/EPC) using ingredient if possible
    let atcClasses = [], epcClasses = [];
    try {
      const atc = await rx.getClassesByRxcui(ingredient?.rxcui || rxcui, 'ATC');
      atcClasses = atc?.rxclassDrugInfoList?.rxclassDrugInfo?.map(d => d?.rxclassMinConceptItem) || [];
    } catch (e) {
      if (e?.response?.status !== 404) throw e;
    }
    try {
      const epc = await rx.getClassesByRxcui(ingredient?.rxcui || rxcui, 'EPC');
      epcClasses = epc?.rxclassDrugInfoList?.rxclassDrugInfo?.map(d => d?.rxclassMinConceptItem) || [];
    } catch (e) {
      if (e?.response?.status !== 404) throw e;
    }
    const suggested = suggestIndications({ atcClasses, epcClasses });

    res.json({ success: true, data: { ingredient, strengths, atcClasses, epcClasses, suggested } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Create or update a medication record for the user
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const body = req.body || {};
    const payload = {
      user_id: userId,
      display_name: body.display_name,
      is_supplement: !!body.is_supplement,
      med_type: ['rx','otc','supplement'].includes((body.med_type||'').toLowerCase()) ? body.med_type.toLowerCase() : 'rx',
      rxcui: body.rxcui || null,
      ingredient_name: body.ingredient_name || null,
      brand_name: body.brand_name || null,
      form: body.form || null,
      route: body.route || null,
      strength: body.strength || null,
      dose_value: body.dose_value ?? null,
      dose_unit: body.dose_unit || null,
      sig: body.sig || null,
      times_of_day: Array.isArray(body.times_of_day) ? body.times_of_day : [],
      suggested_indications: Array.isArray(body.suggested_indications) ? body.suggested_indications : [],
      user_indications: Array.isArray(body.user_indications) ? body.user_indications : [],
      supply_start_date: body.supply_start_date ? new Date(body.supply_start_date) : null,
      days_supply: typeof body.days_supply === 'number' ? body.days_supply : null,
      notes: body.notes || ''
    };

    if (!payload.display_name) {
      return res.status(400).json({ success: false, error: { message: 'display_name required' } });
    }

    const exists = await Medication.findOne({ user_id: userId, display_name: payload.display_name });
    let med;
    if (exists) {
      Object.assign(exists, payload);
      med = await exists.save();
    } else {
      med = await Medication.create(payload);
    }
    res.json({ success: true, data: med });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// List medications for the user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const meds = await Medication.find({ user_id: userId }).sort({ created_at: -1 });
    res.json({ success: true, data: meds });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get a single medication by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const medId = req.params.id;
    const med = await Medication.findOne({ _id: medId, user_id: userId });
    if (!med) {
      return res.status(404).json({ success: false, error: { message: 'Medication not found' } });
    }
    res.json({ success: true, data: med });
  } catch (error) {
    req.log.error({ err: error }, '[GET /meds/:id] Error');
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Update a medication by id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const medId = req.params.id;
    const body = req.body || {};

    logger.debug('[PUT /meds/:id] Request:', { medId, userId, body });

    const med = await Medication.findOne({ _id: medId, user_id: userId });
    if (!med) {
      return res.status(404).json({ success: false, error: { message: 'Medication not found' } });
    }

    const up = {
      display_name: body.display_name ?? med.display_name,
      is_supplement: body.is_supplement ?? med.is_supplement,
      med_type: ['rx','otc','supplement'].includes((body.med_type||'').toLowerCase()) ? body.med_type.toLowerCase() : (med.med_type||'rx'),
      rxcui: body.rxcui ?? med.rxcui,
      ingredient_name: body.ingredient_name ?? med.ingredient_name,
      brand_name: body.brand_name ?? med.brand_name,
      form: body.form ?? med.form,
      route: body.route ?? med.route,
      strength: body.strength ?? med.strength,
      dose_value: body.dose_value ?? med.dose_value,
      dose_unit: body.dose_unit ?? med.dose_unit,
      sig: body.sig ?? med.sig,
      times_of_day: Array.isArray(body.times_of_day) ? body.times_of_day : (med.times_of_day || []),
      suggested_indications: Array.isArray(body.suggested_indications) ? body.suggested_indications : (med.suggested_indications || []),
      user_indications: Array.isArray(body.user_indications) ? body.user_indications : (med.user_indications || []),
      supply_start_date: body.supply_start_date ? new Date(body.supply_start_date) : (med.supply_start_date || null),
      days_supply: typeof body.days_supply === 'number' ? body.days_supply : (med.days_supply || null),
      notes: body.notes ?? med.notes
    };

    Object.assign(med, up);
    const saved = await med.save();
    res.json({ success: true, data: saved });
  } catch (error) {
    req.log.error({ err: error }, '[PUT /meds/:id] Error');
    res.status(500).json({ success: false, error: { message: error.message, stack: error.stack } });
  }
});

// Log a taken dose (or mark missed)
router.post('/:id/logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const medId = req.params.id;
    const { date, time_of_day, taken = true, dose_value = null, dose_unit = null, notes = '' } = req.body || {};
    if (!date || !time_of_day) {
      return res.status(400).json({ success: false, error: { message: 'date and time_of_day required' } });
    }
    const d = new Date(date);
    const log = await MedicationLog.create({
      user_id: userId,
      medication_id: medId,
      log_date: d,
      time_of_day,
      taken: !!taken,
      dose_value,
      dose_unit,
      notes
    });
    res.json({ success: true, data: log });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get logs for a date
router.get('/logs/by-date', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, error: { message: 'date required' } });
    const start = new Date(date);
    start.setUTCHours(0,0,0,0);
    const end = new Date(date);
    end.setUTCHours(23,59,59,999);
    const logs = await MedicationLog.find({ user_id: userId, log_date: { $gte: start, $lte: end } })
      .populate('medication_id')
      .sort({ created_at: -1 });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

module.exports = router;
// Delete a medication and any associated logs
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const medId = req.params.id;
    const med = await Medication.findOne({ _id: medId, user_id: userId });
    if (!med) {
      return res.status(404).json({ success: false, error: { message: 'Medication not found' } });
    }
    await MedicationLog.deleteMany({ user_id: userId, medication_id: medId });
    await med.deleteOne();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});


