const axios = require('axios');

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';

async function searchApproximate(term, maxEntries = 15) {
  const url = `${RXNAV_BASE}/approximateTerm.json`;
  const { data } = await axios.get(url, { params: { term, maxEntries } });
  return data;
}

async function resolveRxcuiByName(name) {
  const url = `${RXNAV_BASE}/rxcui.json`;
  const { data } = await axios.get(url, { params: { name } });
  return data;
}

async function relatedByTty(rxcui, tty) {
  const url = `${RXNAV_BASE}/related.json`;
  const { data } = await axios.get(url, { params: { rxcui, tty } });
  return data;
}

async function getRxTermsInfo(rxcui) {
  const url = `${RXNAV_BASE}/RxTerms/rxcui/${encodeURIComponent(rxcui)}/allinfo.json`;
  const { data } = await axios.get(url);
  return data;
}

async function getClassesByRxcui(rxcui, relaSource) {
  const url = `${RXNAV_BASE}/rxclass/class/byRxcui.json`;
  const { data } = await axios.get(url, { params: { rxcui, relaSource } });
  return data;
}

module.exports = {
  searchApproximate,
  resolveRxcuiByName,
  relatedByTty,
  getRxTermsInfo,
  getClassesByRxcui
};


