const fs = require('fs');
const { parse } = require('csv-parse/sync');

// Allow filename as argument, default to 'people.csv'
const filename = process.argv[2] || 'people.csv';

if (!fs.existsSync(filename)) {
  console.error(`${filename} not found. Run index.js first.`);
  process.exit(1);
}

const content = fs.readFileSync(filename, 'utf-8');

// Parse CSV into an array of objects
const df = parse(content, {
  columns: true,
  skip_empty_lines: true
});

const headers = Object.keys(df[0] || {});

console.log(`--- DataFrame Head (First 5 rows from ${filename}) ---`);
const displayHead = df.slice(0, 5).map(row => {
  const displayRow = { ...row };
  if (displayRow.job && displayRow.job.length > 30) {
    displayRow.job = displayRow.job.substring(0, 30) + '...';
  }
  return displayRow;
});
console.table(displayHead);

console.log('\n--- Column Descriptions ---');
const description = headers.map(col => ({
  Column: col,
  Count: df.length,
  Unique: new Set(df.map(r => r[col])).size,
  'Example Value': (df[0][col] || '').substring(0, 30) + (df[0][col]?.length > 30 ? '...' : '')
}));
console.table(description);

// 1) Gender Counts
console.log('\n--- Gender Distribution ---');
const genderCounts = df.reduce((acc, row) => {
  const gender = row.gender || 'Unknown';
  acc[gender] = (acc[gender] || 0) + 1;
  return acc;
}, {});
console.table(genderCounts);

// 2) Birth Year Histogram
console.log('\n--- Birth Year Histogram ---');
const yearCounts = df.reduce((acc, row) => {
  if (row.birthDate) {
    const year = row.birthDate.split('-')[0];
    if (year && year.length === 4) {
      acc[year] = (acc[year] || 0) + 1;
    }
  }
  return acc;
}, {});

const sortedYears = Object.keys(yearCounts).sort();
const maxCount = Math.max(...Object.values(yearCounts));
const scale = 40; // max length of bar

sortedYears.forEach(year => {
  const count = yearCounts[year];
  const barLength = Math.round((count / maxCount) * scale);
  console.log(`${year}: ${'#'.repeat(barLength)} (${count})`);
});

// 3) BirthPlace Filter
console.log('\n--- BirthPlaces starting with G, g, or non-alpha ---');
const filteredPlaces = [...new Set(df
  .map(row => row.birthPlace)
  .filter(place => {
    if (!place) return false;
    const firstChar = place[0];
    return /^[Gg]/.test(firstChar) || !/^[a-zA-Z]/.test(firstChar);
  }))].sort();

console.log(filteredPlaces);
