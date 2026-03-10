import config from '../../config.js';

export const handlers = {
  async get_people_locations({ people }) {
    console.log(`[Tool] Fetching locations for ${people.length} people...`);
    
    const results = await Promise.all(
      people.map(async (person) => {
        try {
          const response = await fetch('https://hub.ag3nts.org/api/location', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              apikey: config.API_KEY,
              name: person.name,
              surname: person.surname
            })
          });

          if (!response.ok) {
            throw new Error(`API error (${response.status}): ${await response.text()}`);
          }

          const locations = await response.json();
          return {
            ...person,
            locations: locations.map(loc => ({
              lat: loc.latitude,
              lon: loc.longitude
            }))
          };
        } catch (error) {
          console.error(`[Tool] Failed to fetch locations for ${person.name} ${person.surname}:`, error.message);
          return {
            ...person,
            error: error.message
          };
        }
      })
    );

    return results;
  },

  async get_power_plants_locations({ power_plants }) {
    console.log(`[Tool] Fetching coordinates for ${power_plants.length} power plants...`);
    
    const results = await Promise.all(
      power_plants.map(async (plant) => {
        try {
          // Nominatim usage policy requires a User-Agent
          const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(plant.city)}&format=json`;
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'AI-Devs-Course-Client'
            }
          });

          if (!response.ok) {
            throw new Error(`Nominatim API error (${response.status})`);
          }

          const data = await response.json();
          if (data && data.length > 0) {
            return {
              ...plant,
              lat: parseFloat(data[0].lat),
              lon: parseFloat(data[0].lon)
            };
          } else {
            throw new Error(`No location found for city: ${plant.city}`);
          }
        } catch (error) {
          console.error(`[Tool] Failed to fetch coordinates for ${plant.city}:`, error.message);
          return {
            ...plant,
            error: error.message
          };
        }
      })
    );

    return results;
  }
};
