import config from '../../config.js';

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

export const handlers = {
  async get_people_locations({ people }) {
    console.log(`[Tool] Fetching locations for ${people.length} people...`);
    const results = await Promise.all(
      people.map(async (person) => {
        try {
          const response = await fetch('https://hub.ag3nts.org/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apikey: config.API_KEY,
              name: person.name,
              surname: person.surname
            })
          });
          if (!response.ok) throw new Error(`API error (${response.status})`);
          const locations = await response.json();
          return {
            ...person,
            locations: locations.map(loc => ({ lat: loc.latitude, lon: loc.longitude }))
          };
        } catch (error) {
          console.error(`[Tool] Failed to fetch locations for ${person.name}:`, error.message);
          return { ...person, error: error.message };
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
          const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(plant.city)}&format=json`;
          const response = await fetch(url, { headers: { 'User-Agent': 'AI-Devs-Course-Client' } });
          if (!response.ok) throw new Error(`Nominatim error (${response.status})`);
          const data = await response.json();
          if (data && data.length > 0) {
            return { 
              ...plant, 
              lat: Math.round(parseFloat(data[0].lat) * 1000) / 1000, 
              lon: Math.round(parseFloat(data[0].lon) * 1000) / 1000 
            };
          }
          throw new Error(`No location for ${plant.city}`);
        } catch (error) {
          console.error(`[Tool] Failed for ${plant.city}:`, error.message);
          return { ...plant, error: error.message };
        }
      })
    );
    return results;
  },

  async get_people_closest_plant_location({ people_with_locations, power_plants_with_locations }) {
    console.log(`[Tool] Calculating closest plants for ${people_with_locations.length} people (checking all locations)...`);
    
    return people_with_locations.map(person => {
      if (!person.locations || person.locations.length === 0) return { ...person, error: "No locations found" };
      
      let closestPlant = null;
      let minDistance = Infinity;

      for (const loc of person.locations) {
        for (const plant of power_plants_with_locations) {
          if (plant.error) continue;
          const dist = haversine(loc.lat, loc.lon, plant.lat, plant.lon);
          if (dist < minDistance) {
            minDistance = dist;
            closestPlant = plant.code;
          }
        }
      }

      return {
        name: person.name,
        surname: person.surname,
        powerPlant: closestPlant,
        distance: Math.round(minDistance * 100) / 100 // Round to 2 decimals
      };
    });
  }
};
