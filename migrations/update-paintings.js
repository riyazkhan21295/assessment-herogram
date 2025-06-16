const mysql = require('mysql2/promise');
require('dotenv').config();

async function updatePaintingsTable() {
    let connection;

    try {
        console.log('Connecting to database...');
        // Create connection to database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database successfully.');

        // Drop foreign key constraints first
        console.log('Dropping foreign key constraints...');
        const [constraints] = await connection.execute(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_NAME = 'paintings'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      AND TABLE_SCHEMA = DATABASE()
    `);

        for (const constraint of constraints) {
            await connection.execute(`
        ALTER TABLE paintings
        DROP FOREIGN KEY ${constraint.CONSTRAINT_NAME}
      `);
        }

        // Modify the idea_id column to allow NULL
        console.log('Modifying idea_id column...');
        await connection.execute(`
      ALTER TABLE paintings
      MODIFY COLUMN idea_id INT NULL
    `);

        // Re-add foreign key constraints
        console.log('Re-adding foreign key constraints...');
        await connection.execute(`
      ALTER TABLE paintings
      ADD CONSTRAINT fk_paintings_title
      FOREIGN KEY (title_id) REFERENCES titles(id)
      ON DELETE CASCADE
    `);

        await connection.execute(`
      ALTER TABLE paintings
      ADD CONSTRAINT fk_paintings_idea
      FOREIGN KEY (idea_id) REFERENCES ideas(id)
      ON DELETE CASCADE
    `);

        console.log('Database migration completed successfully.');
    } catch (error) {
        console.error('Error during database migration:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
}

// Run the migration
updatePaintingsTable(); 