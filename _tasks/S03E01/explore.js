import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sensorsDir = path.join(__dirname, 'sensors');

function analyze() {
    const files = fs.readdirSync(sensorsDir).filter(file => file.endsWith('.json'));
    
    const validRanges = {
        temperature_K: { min: 553, max: 873 },
        pressure_bar: { min: 60, max: 160 },
        water_level_meters: { min: 5.0, max: 15.0 },
        voltage_supply_v: { min: 229.0, max: 231.0 },
        humidity_percent: { min: 40.0, max: 80.0 }
    };

    const stats = {
        totalFiles: files.length,
        sensorTypes: {},
        sensorCounts: {},
        timestamps: [],
        numericFields: {
            temperature_K: [],
            pressure_bar: [],
            water_level_meters: [],
            voltage_supply_v: [],
            humidity_percent: []
        },
        numericZeros: {
            temperature_K: 0,
            pressure_bar: 0,
            water_level_meters: 0,
            voltage_supply_v: 0,
            humidity_percent: 0
        },
        numericInvalidCounts: {
            temperature_K: 0,
            pressure_bar: 0,
            water_level_meters: 0,
            voltage_supply_v: 0,
            humidity_percent: 0
        },
        invalidNotes: [],
        operatorNotes: new Set(),
        operatorNotesLengths: []
    };

    let sensorTypeMissingCount = 0;

    files.forEach(file => {
        const filePath = path.join(sensorsDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // 1. Sensor types
        if (data.sensor_type) {
            const types = data.sensor_type.split('/');
            const count = types.length;
            stats.sensorCounts[count] = (stats.sensorCounts[count] || 0) + 1;
            
            types.forEach(type => {
                stats.sensorTypes[type] = (stats.sensorTypes[type] || 0) + 1;
            });
        } else {
            sensorTypeMissingCount++;
        }

        // 2. Timestamps
        if (data.timestamp) {
            stats.timestamps.push(data.timestamp);
        }

        // 3. Numeric fields
        let isInvalid = false;
        for (const field in stats.numericFields) {
            const val = data[field];
            if (val !== undefined && val !== null) {
                stats.numericFields[field].push(val);
                if (val === 0) {
                    stats.numericZeros[field]++;
                } else {
                    const range = validRanges[field];
                    if (val < range.min || val > range.max) {
                        stats.numericInvalidCounts[field]++;
                        isInvalid = true;
                    }
                }
            }
        }

        // 4. Operator notes
        if (data.operator_notes) {
            stats.operatorNotes.add(data.operator_notes);
            stats.operatorNotesLengths.push(data.operator_notes.length);
            if (isInvalid) {
                stats.invalidNotes.push({ file, note: data.operator_notes });
            }
        }
    });

    console.log('--- Sensor Data Exploration Report ---\n');

    // 1. Sensor types report
    console.log('1. Sensor types:');
    console.log('Specified sensor types:', Object.keys(stats.sensorTypes).sort().join(', '));
    console.log('Files with 1 sensor:', stats.sensorCounts[1] || 0);
    console.log('Files with 2 sensors:', stats.sensorCounts[2] || 0);
    console.log('Files with 3 sensors:', stats.sensorCounts[3] || 0);
    console.log('Files with 4 sensors:', stats.sensorCounts[4] || 0);
    console.log('Is sensor_type always specified?', sensorTypeMissingCount === 0 ? 'Yes' : `No (${sensorTypeMissingCount} missing)`);
    console.log('');

    // 2. Timestamps report
    if (stats.timestamps.length > 0) {
        stats.timestamps.sort((a, b) => a - b);
        const min = stats.timestamps[0];
        const max = stats.timestamps[stats.timestamps.length - 1];
        const median = stats.timestamps[Math.floor(stats.timestamps.length / 2)];
        
        const intervals = [];
        for (let i = 1; i < stats.timestamps.length; i++) {
            intervals.push(stats.timestamps[i] - stats.timestamps[i - 1]);
        }
        
        console.log('2. Timestamps:');
        console.log(`Range (UTC): ${new Date(min * 1000).toISOString()} to ${new Date(max * 1000).toISOString()}`);
        console.log(`Median: ${median} (${new Date(median * 1000).toISOString()})`);
        
        // Interval Histogram (10 buckets)
        const intMin = Math.min(...intervals);
        const intMax = Math.max(...intervals);
        const bucketSize = (intMax - intMin) / 10;
        const buckets = new Array(10).fill(0);
        intervals.forEach(itv => {
            let idx = Math.floor((itv - intMin) / bucketSize);
            if (idx === 10) idx = 9;
            buckets[idx]++;
        });

        console.log('\nInterval Histogram (10 buckets):');
        buckets.forEach((count, i) => {
            const start = (intMin + i * bucketSize).toFixed(1);
            const end = (intMin + (i + 1) * bucketSize).toFixed(1);
            const bar = '█'.repeat(Math.round((count / intervals.length) * 50));
            console.log(`${String(start).padStart(6)} - ${String(end).padStart(6)}s: ${bar} (${count})`);
        });

        // Timestamp Outliers (significantly away from median)
        // Using 3 * Standard Deviation as a threshold for "significantly away"
        const meanTs = stats.timestamps.reduce((a, b) => a + b, 0) / stats.timestamps.length;
        const stdDevTs = Math.sqrt(stats.timestamps.reduce((sq, n) => sq + Math.pow(n - meanTs, 2), 0) / stats.timestamps.length);
        const threshold = 3 * stdDevTs;
        const tsOutliers = stats.timestamps.filter(ts => Math.abs(ts - median) > threshold);
        
        console.log(`\nTimestamp outliers (dist > 3σ from median): ${tsOutliers.length > 0 ? tsOutliers.length + ' found' : 'None detected'}`);
        if (tsOutliers.length > 0) {
            console.log(`Sample outliers: ${tsOutliers.slice(0, 5).join(', ')}...`);
        }
    } else {
        console.log('2. Timestamps: No data');
    }
    console.log('');

    // 3. Numeric fields report
    console.log('3. Numeric Fields (Pandas-like describe with validation):');
    const fields = Object.keys(stats.numericFields);
    
    function getDescribe(arr) {
        if (arr.length === 0) return 'No data';
        arr.sort((a, b) => a - b);
        const sum = arr.reduce((a, b) => a + b, 0);
        const mean = (sum / arr.length).toFixed(2);
        const min = arr[0];
        const max = arr[arr.length - 1];
        const p25 = arr[Math.floor(arr.length * 0.25)];
        const p50 = arr[Math.floor(arr.length * 0.50)];
        const p75 = arr[Math.floor(arr.length * 0.75)];
        return { count: arr.length, mean, min, p25, p50, p75, max };
    }

    const describeTable = {};
    fields.forEach(field => {
        const desc = getDescribe(stats.numericFields[field]);
        describeTable[field] = {
            ...desc,
            zeros: stats.numericZeros[field],
            'Valid from': validRanges[field].min,
            'Valid to': validRanges[field].max,
            'Invalid': stats.numericInvalidCounts[field]
        };
    });
    console.table(describeTable);
    console.log('');

    // 4. Operator notes report
    console.log('4. Operator notes:');
    console.log('Unique operator notes:', stats.operatorNotes.size);
    if (stats.operatorNotesLengths.length > 0) {
        stats.operatorNotesLengths.sort((a, b) => a - b);
        const minLen = stats.operatorNotesLengths[0];
        const maxLen = stats.operatorNotesLengths[stats.operatorNotesLengths.length - 1];
        const medianLen = stats.operatorNotesLengths[Math.floor(stats.operatorNotesLengths.length / 2)];
        console.log(`Text length distribution: min=${minLen}, median=${medianLen}, max=${maxLen}`);
    } else {
        console.log('Text length distribution: No data');
    }

    if (stats.invalidNotes.length > 0) {
        console.log('\nNotes from files with invalid values:');
        stats.invalidNotes.forEach(item => {
            console.log(`[${item.file}] ${item.note}`);
        });
    }
}

analyze();
