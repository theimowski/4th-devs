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
      if (!response.ok) throw new Error(`API error (${response.status})`);
      return await response.json();
    } catch (error) {
      console.error(`[Tool] Failed to check package ${packageID}:`, error.message);
      return { error: error.message };
    }
  },

  async redirect_package({ packageID, destination, code }) {
    console.log(`[Tool] Redirecting package: ${packageID} to ${destination}...`);
    try {
      const response = await fetch("https://hub.ag3nts.org/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apikey: config.API_KEY,
          action: "redirect",
          packageid: packageID,
          destination: destination,
          code: code
        })
      });
      if (!response.ok) throw new Error(`API error (${response.status})`);
      return await response.json();
    } catch (error) {
      console.error(`[Tool] Failed to redirect package ${packageID}:`, error.message);
      return { error: error.message };
    }
  }
};
