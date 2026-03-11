import config from "../../config.js";

export const handlers = {
  async check_package({ packageID }) {
    console.log(`[Tool] Checking package: ${packageID}...`);
    
    try {
      const response = await fetch("https://hub.ag3nts.org/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apikey: config.API_KEY,
          action: "check",
          packageid: packageID
        })
      });

      if (!response.ok) {
        throw new Error(`API error (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`[Tool] Failed to check package ${packageID}:`, error.message);
      return { error: error.message };
    }
  }
};
