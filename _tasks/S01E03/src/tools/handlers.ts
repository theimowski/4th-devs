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
        return { 
          error: "API Request Failed", 
          status: response.status, 
          body: await response.text() 
        };
      }
      
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

      if (!response.ok) {
        return { 
          error: "API Request Failed", 
          status: response.status, 
          body: await response.text() 
        };
      }

      return await response.json();
    } catch (error) {
      console.error(`[Tool] Failed to redirect package ${packageID}:`, error.message);
      return { error: error.message };
    }
  },

  async get_weather({ city }) {
    console.log(`[Tool] Fetching weather for ${city}...`);
    try {
      // Using a free public API for testing
      const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      if (!response.ok) throw new Error("Weather service unavailable");
      
      const data = await response.json();
      const current = data.current_condition[0];
      
      return {
        city: city,
        temp_C: current.temp_C,
        condition: current.weatherDesc[0].value,
        humidity: current.humidity
      };
    } catch (error) {
      console.error(`[Tool] Failed to fetch weather for ${city}:`, error.message);
      return { error: "Could not fetch weather data. Please try again later." };
    }
  }
};
