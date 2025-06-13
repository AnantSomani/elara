#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function applyHybridMigration() {
  console.log('🚀 Applying Hybrid Transcript System Migration...\n');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '❌');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '❌');
    console.error('\nPlease check your .env.local file.');
    process.exit(1);
  }

  // Create Supabase admin client
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '005_hybrid_transcript_system.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Read migration file:', migrationPath);

    // Split SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      const statementPreview = statement.substring(0, 100).replace(/\s+/g, ' ');
      
      try {
        console.log(`${i + 1}/${statements.length} Executing: ${statementPreview}...`);
        
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          throw error;
        }
        
        console.log(`   ✅ Success`);
        successCount++;
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        
        // Some errors are expected (like "already exists")
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist') ||
            error.message.includes('IF NOT EXISTS')) {
          console.log(`   ℹ️  Expected error, continuing...`);
          successCount++;
        } else {
          errorCount++;
          console.error(`   🚨 Unexpected error in statement ${i + 1}:`, error.message);
        }
      }
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n📈 Migration Results:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    if (errorCount === 0) {
      console.log('\n🎉 Hybrid transcript system migration completed successfully!');
      
      // Test basic functionality
      console.log('\n🔍 Testing database tables...');
      await testTables(supabase);
      
    } else {
      console.log('\n⚠️  Migration completed with some errors. Please review the output above.');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

async function testTables(supabase) {
  const tablesToCheck = [
    'youtube_videos',
    'youtube_video_embeddings', 
    'daily_transcript_usage'
  ];

  for (const table of tablesToCheck) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`);
      } else {
        console.log(`   ✅ ${table}: Available`);
      }
    } catch (error) {
      console.log(`   ❌ ${table}: ${error.message}`);
    }
  }

  // Test functions
  try {
    const { data, error } = await supabase.rpc('get_transcript_costs_summary');
    if (error) {
      console.log(`   ❌ get_transcript_costs_summary: ${error.message}`);
    } else {
      console.log(`   ✅ get_transcript_costs_summary: Available`);
    }
  } catch (error) {
    console.log(`   ❌ get_transcript_costs_summary: ${error.message}`);
  }
}

// Alternative method if rpc doesn't work
async function applyMigrationAlternative() {
  console.log('\n🔄 Trying alternative migration method...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Try adding columns individually
  const alterations = [
    "ALTER TABLE youtube_videos ADD COLUMN IF NOT EXISTS transcript_source TEXT CHECK (transcript_source IN ('youtube', 'deepgram', 'cache'))",
    "ALTER TABLE youtube_videos ADD COLUMN IF NOT EXISTS transcript_cost DECIMAL(10,6) DEFAULT 0.0",
    "ALTER TABLE youtube_videos ADD COLUMN IF NOT EXISTS transcript_processing_time INTEGER DEFAULT 0",
    "ALTER TABLE youtube_videos ADD COLUMN IF NOT EXISTS transcript_fetched_at TIMESTAMPTZ DEFAULT NOW()"
  ];

  for (const sql of alterations) {
    try {
      console.log(`Executing: ${sql.substring(0, 80)}...`);
      
      // Use a different approach - direct SQL execution
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({ sql })
      });

      if (response.ok) {
        console.log('   ✅ Success');
      } else {
        const error = await response.text();
        console.log(`   ⚠️  ${error}`);
      }
    } catch (error) {
      console.log(`   ❌ ${error.message}`);
    }
  }
}

// Run the migration
if (require.main === module) {
  applyHybridMigration().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = { applyHybridMigration }; 