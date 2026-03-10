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
  }
};
