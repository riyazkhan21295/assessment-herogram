const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    let connection;
    try {
        // Create connection to MySQL
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database successfully.');

        // Add generation_order column if it doesn't exist
        try {
            await connection.execute(`
      ALTER TABLE paintings 
      ADD COLUMN generation_order INT NOT NULL DEFAULT 0 AFTER used_reference_ids
    `);
            console.log('Added generation_order column.');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('generation_order column already exists.');
            } else {
                throw error;
            }
        }

        // Add updated_at column if it doesn't exist
        try {
            await connection.execute(`
      ALTER TABLE paintings 
      ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at
    `);
            console.log('Added updated_at column.');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('updated_at column already exists.');
            } else {
                throw error;
            }
        }

        // Update existing records with sequential generation_order
        const [titles] = await connection.execute('SELECT DISTINCT title_id FROM paintings');

        for (const { title_id } of titles) {
            // Create a temporary variable for ordering
            await connection.execute('SET @order := 0;');

            // Update generation_order for each title's paintings
            await connection.execute(`
        UPDATE paintings 
        SET generation_order = (@order := @order + 1)
        WHERE title_id = ?
        ORDER BY created_at;
      `, [title_id]);
        }
        console.log('Updated generation_order for existing records.');

        // Drop existing index if it exists
        try {
            await connection.execute('DROP INDEX title_order_idx ON paintings;');
            console.log('Dropped existing index.');
        } catch (error) {
            if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
                throw error;
            }
        }

        // Add unique index for title_id and generation_order
        await connection.execute(`
      ALTER TABLE paintings 
      ADD UNIQUE INDEX title_order_idx (title_id, generation_order)
    `);
        console.log('Added unique index for title_id and generation_order.');

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Error during migration:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
}

// Run the migration
migrate().catch(console.error); 