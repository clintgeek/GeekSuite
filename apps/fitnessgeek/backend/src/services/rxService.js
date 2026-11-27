import axios from 'axios';

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';

// Every RxNav call ends. axios has NO default timeout, so a stalled RxNav
// (it is a free government service; it stalls) held the medication search
// open until the browser gave up 30 seconds later. The details route makes
// up to five of these calls, so the allowance per call is short.
const RXNAV_TIMEOUT_MS = 8000;
const rxGet = (url, config = {}) => axios.get(url, { timeout: RXNAV_TIMEOUT_MS, ...config });

async function searchApproximate(term, maxEntries = 15) {
  const url = `${RXNAV_BASE}/approximateTerm.json`;
  const { data } = await rxGet(url, { params: { term, maxEntries } });
  return data;
}

async function resolveRxcuiByName(name) {
  const url = `${RXNAV_BASE}/rxcui.json`;
  const { data } = await rxGet(url, { params: { name } });
  return data;
}

async function relatedByTty(rxcui, tty) {
  const url = `${RXNAV_BASE}/related.json`;
  const { data } = await rxGet(url, { params: { rxcui, tty } });
  return data;
}

async function getRxTermsInfo(rxcui) {
  const url = `${RXNAV_BASE}/RxTerms/rxcui/${encodeURIComponent(rxcui)}/allinfo.json`;
  const { data } = await rxGet(url);
  return data;
}

async function getClassesByRxcui(rxcui, relaSource) {
  const url = `${RXNAV_BASE}/rxclass/class/byRxcui.json`;
  const { data } = await rxGet(url, { params: { rxcui, relaSource } });
  return data;
}

export { RXNAV_TIMEOUT_MS, searchApproximate, resolveRxcuiByName, relatedByTty, getRxTermsInfo, getClassesByRxcui };
export default { searchApproximate, resolveRxcuiByName, relatedByTty, getRxTermsInfo, getClassesByRxcui };


