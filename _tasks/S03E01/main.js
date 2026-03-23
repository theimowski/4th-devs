import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sensorsDir = path.join(__dirname, 'sensors');
const outputFile = path.join(__dirname, 'anomalies.json');

const validRanges = {
    temperature_K: { min: 553, max: 873, type: 'temperature' },
    pressure_bar: { min: 60, max: 160, type: 'pressure' },
    water_level_meters: { min: 5.0, max: 15.0, type: 'water' },
    voltage_supply_v: { min: 229.0, max: 231.0, type: 'voltage' },
    humidity_percent: { min: 40.0, max: 80.0, type: 'humidity' }
};

function findAnomalies() {
    const files = fs.readdirSync(sensorsDir).filter(file => file.endsWith('.json'));
    const anomalies = [];

    files.forEach(file => {
        const filePath = path.join(sensorsDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const activeTypes = data.sensor_type ? data.sensor_type.split('/') : [];
        
        let hasAnomaly = false;

        // Condition splitting for easy adjustment
        const checks = {
            outOfRange: false,
            unexpected: false,
            missing: false
        };

        for (const [field, config] of Object.entries(validRanges)) {
            const val = data[field];
            const isActive = activeTypes.includes(config.type);

            // 1. Out of range (for non-zero values)
            if (val !== 0 && (val < config.min || val > config.max)) {
                checks.outOfRange = true;
            }

            // 2. Unexpected measurement (sensor returns data it shouldn't)
            if (!isActive && val !== 0) {
                checks.unexpected = true;
            }

            // 3. Missing measurement (sensor returns 0 for its type)
            if (isActive && val === 0) {
                checks.missing = true;
            }
        }

        // Determine if file is an anomaly
        if (checks.outOfRange || checks.unexpected || checks.missing) {
            const id = parseInt(file.replace('.json', ''), 10);
            anomalies.push(id);
        }
    });

    anomalies.sort((a, b) => a - b);
    fs.writeFileSync(outputFile, JSON.stringify(anomalies, null, 2));
    console.log(`Found ${anomalies.length} anomalies. Saved to ${outputFile}`);
}

findAnomalies();
