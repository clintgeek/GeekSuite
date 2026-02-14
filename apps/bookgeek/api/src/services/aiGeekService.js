const baseGeekUrl = process.env.BASEGEEK_URL || "https://basegeek.clintgeek.com";
const apiKey = process.env.AIGEEK_API_KEY || "";

function getStatus() {
  return {
    enabled: !!apiKey,
    baseGeekUrl,
    apiKeyConfigured: !!apiKey,
    model: "basegeek-rotation",
  };
}

const aiGeekService = {
  getStatus,
};

export default aiGeekService;
