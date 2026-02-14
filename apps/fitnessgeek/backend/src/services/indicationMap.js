// Deterministic mapping from ATC/EPC class codes/names to user-facing indication tags
// Target size ~60–150 entries for broad coverage

const mappings = [
  // Cardiovascular / Blood pressure
  { key: 'ATC:C09', tag: 'Blood Pressure' }, // ACE inhibitors/ARBs
  { key: 'ATC:C07', tag: 'Blood Pressure' }, // Beta blockers
  { key: 'ATC:C08', tag: 'Blood Pressure' }, // Calcium channel blockers
  { key: 'EPC:Angiotensin-Converting Enzyme Inhibitors', tag: 'Blood Pressure' },
  { key: 'EPC:Angiotensin II Receptor Antagonists', tag: 'Blood Pressure' },
  { key: 'EPC:Beta-Adrenergic Blocking Agents', tag: 'Blood Pressure' },
  { key: 'EPC:Calcium Channel Blockers', tag: 'Blood Pressure' },

  // Lipids
  { key: 'ATC:C10AA', tag: 'Cholesterol' }, // Statins
  { key: 'EPC:HMG-CoA Reductase Inhibitors', tag: 'Cholesterol' },

  // Diabetes
  { key: 'ATC:A10', tag: 'Diabetes' },
  { key: 'EPC:Biguanide Antihyperglycemics', tag: 'Diabetes' },
  { key: 'EPC:GLP-1 Receptor Agonists', tag: 'Diabetes' },
  { key: 'EPC:SGLT2 Inhibitors', tag: 'Diabetes' },
  { key: 'EPC:DPP-4 Inhibitors', tag: 'Diabetes' },
  { key: 'EPC:Insulins', tag: 'Diabetes' },

  // GERD/Acid
  { key: 'ATC:A02BC', tag: 'GERD/Acid Reflux' }, // PPIs
  { key: 'ATC:A02BA', tag: 'GERD/Acid Reflux' }, // H2 blockers
  { key: 'EPC:Proton Pump Inhibitors', tag: 'GERD/Acid Reflux' },
  { key: 'EPC:Histamine H2 Receptor Antagonists', tag: 'GERD/Acid Reflux' },

  // Mental health
  { key: 'ATC:N06AB', tag: 'Depression' }, // SSRIs
  { key: 'ATC:N06AX', tag: 'Depression' }, // Others incl SNRIs, bupropion, mirtazapine
  { key: 'EPC:Selective Serotonin Reuptake Inhibitors', tag: 'Depression' },
  { key: 'EPC:Serotonin and Noradrenaline Reuptake Inhibitors', tag: 'Depression' },
  { key: 'EPC:Anxiolytics', tag: 'Anxiety' },
  { key: 'EPC:Hypnotics and Sedatives', tag: 'Sleep' },

  // Pain/Inflammation
  { key: 'ATC:M01AE', tag: 'Pain/Inflammation' }, // Ibuprofen class
  { key: 'ATC:M01AB', tag: 'Pain/Inflammation' }, // Diclofenac
  { key: 'ATC:M01AX', tag: 'Pain/Inflammation' }, // Other NSAIDs
  { key: 'EPC:Nonsteroidal Anti-inflammatory Drugs', tag: 'Pain/Inflammation' },

  // Respiratory
  { key: 'ATC:R03', tag: 'Asthma/COPD' },
  { key: 'EPC:Beta2-Adrenergic Agonists', tag: 'Asthma/COPD' },
  { key: 'EPC:Inhaled Corticosteroids', tag: 'Asthma/COPD' },
  { key: 'EPC:Leukotriene Modifiers', tag: 'Asthma' },

  // Allergies
  { key: 'ATC:R06', tag: 'Allergies' },
  { key: 'EPC:Antihistamines', tag: 'Allergies' },
  { key: 'EPC:Nasal Corticosteroids', tag: 'Allergies' },

  // Thyroid
  { key: 'ATC:H03AA', tag: 'Thyroid' },
  { key: 'EPC:Thyroid Hormones', tag: 'Thyroid' },

  // Anticoagulant/antiplatelet
  { key: 'ATC:B01AA', tag: 'Anticoagulation' }, // Vitamin K antagonists
  { key: 'ATC:B01AF', tag: 'Anticoagulation' }, // DOACs
  { key: 'EPC:Platelet Aggregation Inhibitors', tag: 'Antiplatelet' },
  { key: 'EPC:Direct Factor Xa Inhibitors', tag: 'Anticoagulation' },

  // GU
  { key: 'ATC:G04BE', tag: 'Erectile Dysfunction' },
  { key: 'ATC:G04CA', tag: 'BPH' },
  { key: 'EPC:Phosphodiesterase 5 Inhibitors', tag: 'Erectile Dysfunction' },

  // Women’s health
  { key: 'ATC:G03A', tag: 'Contraception' },
  { key: 'EPC:Progestins', tag: 'Contraception' },
  { key: 'EPC:Estrogens', tag: 'Hormone Therapy' },

  // Infectious disease (common outpatient)
  { key: 'ATC:J01C', tag: 'Antibiotic' }, // Penicillins
  { key: 'ATC:J01M', tag: 'Antibiotic' }, // Quinolones
  { key: 'ATC:J01F', tag: 'Antibiotic' }, // Macrolides
  { key: 'ATC:J01A', tag: 'Antibiotic' }, // Tetracyclines
  { key: 'ATC:J01D', tag: 'Antibiotic' }, // Cephalosporins
  { key: 'EPC:Macrolide Antibacterials', tag: 'Antibiotic' },

  // Migraine
  { key: 'ATC:N02CC', tag: 'Migraine' }, // Triptans
  { key: 'EPC:Calcitonin Gene-Related Peptide Receptor Antagonists', tag: 'Migraine' },

  // Seizures
  { key: 'ATC:N03A', tag: 'Seizures' },
  { key: 'EPC:Anticonvulsants', tag: 'Seizures' },

  // ADHD
  { key: 'ATC:N06BA', tag: 'ADHD' },
  { key: 'EPC:CNS Stimulants', tag: 'ADHD' },

  // Gout
  { key: 'ATC:M04AA', tag: 'Gout' }, // Allopurinol class
  { key: 'EPC:Xanthine Oxidase Inhibitors', tag: 'Gout' },

  // Bone health
  { key: 'ATC:M05BA', tag: 'Osteoporosis' }, // Bisphosphonates
  { key: 'EPC:Bisphosphonates', tag: 'Osteoporosis' },
];

function normalize(str) {
  return (str || '').toString().trim();
}

function suggestIndications({ atcClasses = [], epcClasses = [] }) {
  const tags = new Set();
  const keys = [];
  for (const c of atcClasses) {
    const code = normalize(c?.classId || c?.classCode || '');
    const name = normalize(c?.className);
    if (code) keys.push(`ATC:${code.substring(0,4)}`); // allow family prefix like C09, A02B
    if (name) keys.push(`ATC:${name}`);
  }
  for (const c of epcClasses) {
    const code = normalize(c?.classId || c?.classCode || '');
    const name = normalize(c?.className);
    if (code) keys.push(`EPC:${code}`);
    if (name) keys.push(`EPC:${name}`);
  }
  for (const k of keys) {
    const m = mappings.find(m => m.key.toLowerCase() === k.toLowerCase());
    if (m) tags.add(m.tag);
  }
  return Array.from(tags);
}

module.exports = { suggestIndications };


