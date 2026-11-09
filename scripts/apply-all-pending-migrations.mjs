import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const migrationsDir = 'supabase/migrations';
const migrationFiles = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log('Migration files found:', migrationFiles);

for (const file of migrationFiles) {
  if (file.includes('000001_initial_schema')) {
    console.log(`Skipping ${file} (initial baseline already present)`);
    continue;
  }

  const filePath = join(migrationsDir, file);
  console.log(`\n========================================`);
  console.log(`Applying: ${file}`);
  console.log(`========================================`);

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const sql = readFileSync(filePath, 'utf8');
    await client.query(sql);
    console.log(`✅ ${file} applied successfully!`);
  } catch (err) {
    console.error(`❌ Error in ${file}:`, err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
  } finally {
    await client.end();
  }
}

console.log('\nAll migration files processed.');
