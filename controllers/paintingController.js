const { pool } = require('../database');
const openRouterService = require('../services/openRouterService');
const openAIService = require('../services/openAIService');

const MAX_PARALLEL = 5;

// Generate painting ideas (parallel processing)
async function generatePaintings(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { titleId, quantity = 5 } = req.body;

  if (!titleId) {
    return res.status(400).json({ error: 'Title ID is required' });
  }

  try {
    // Get current max generation order for this title
    const [orderResult] = await pool.execute(
      'SELECT COALESCE(MAX(generation_order), 0) as max_order FROM paintings WHERE title_id = ?',
      [titleId]
    );
    const startOrder = orderResult[0].max_order + 1;

    // Create paintings first with pending status (no idea_id yet)
    const paintings = [];
    const insertValues = [];
    for (let i = 0; i < quantity; i++) {
      insertValues.push(titleId, 'pending', startOrder + i);
    }
    const placeholders = Array(quantity).fill('(?, ?, ?)').join(',');

    await pool.execute(
      `INSERT INTO paintings (title_id, status, generation_order) VALUES ${placeholders}`,
      insertValues
    );

    // Get the inserted paintings
    const [insertedPaintings] = await pool.execute(
      'SELECT * FROM paintings WHERE title_id = ? AND generation_order >= ? AND generation_order < ?',
      [titleId, startOrder, startOrder + quantity]
    );

    // Start background processing
    processIdeasAndPaintings(titleId, startOrder, quantity, insertedPaintings).catch(error => {
      console.error('Error in background processing:', error);
    });

    // Return immediately with the generation orders
    res.status(200).json({
      message: `Started generating ${quantity} paintings`,
      startOrder,
      endOrder: startOrder + quantity - 1
    });

  } catch (error) {
    console.error('Error in generatePaintings:', error);
    res.status(500).json({ error: 'Failed to generate paintings' });
  }
}

// Background processing function
async function processIdeasAndPaintings(titleId, startOrder, quantity, paintings) {
  try {
    // Get title info and references in parallel
    const [titleResult, refResult] = await Promise.all([
      pool.execute('SELECT id, title, instructions FROM titles WHERE id = ?', [titleId]),
      pool.execute(
        'SELECT id, image_data FROM references2 WHERE title_id = ? OR is_global = 1',
        [titleId]
      )
    ]);

    const [titleRows] = titleResult;
    const [refRows] = refResult;

    if (titleRows.length === 0) {
      throw new Error('Title not found');
    }

    const title = titleRows[0];
    const references = refRows.map(row => ({ id: row.id, image_data: row.image_data }));

    // Get previous ideas (excluding temporary ones)
    const [prevIdeas] = await pool.execute(
      'SELECT id, summary FROM ideas WHERE title_id = ? ORDER BY created_at DESC',
      [titleId]
    );

    // Generate ideas in batches
    const batchSize = Math.min(MAX_PARALLEL, quantity);
    const batches = Math.ceil(quantity / batchSize);
    const newIdeas = [];

    for (let batch = 0; batch < batches; batch++) {
      const batchPromises = [];
      const currentBatchSize = Math.min(batchSize, quantity - batch * batchSize);

      for (let i = 0; i < currentBatchSize; i++) {
        const painting = paintings[batch * batchSize + i];
        batchPromises.push(
          generateAndLinkIdea(
            titleId,
            title.title,
            title.instructions,
            [...prevIdeas, ...newIdeas],
            painting
          )
        );
      }

      const batchResults = await Promise.all(batchPromises);
      newIdeas.push(...batchResults);
    }

    // Start image generation
    const processImages = async () => {
      const pendingIdeas = [...newIdeas];
      const activePromises = new Set();
      let failedAttempts = new Map();

      const startNextImage = async () => {
        if (pendingIdeas.length === 0) return;

        const idea = pendingIdeas.shift();
        const attempts = failedAttempts.get(idea.id) || 0;
        const MAX_RETRIES = 2;

        if (attempts > MAX_RETRIES) {
          console.error(`Max retries reached for idea ${idea.id}`);
          await pool.execute(
            'UPDATE paintings SET status = ?, error_message = ? WHERE idea_id = ?',
            ['failed', `Failed to generate image after ${MAX_RETRIES} attempts`, idea.id]
          );
          return;
        }

        try {
          await pool.execute(
            'UPDATE paintings SET status = ? WHERE idea_id = ?',
            ['processing', idea.id]
          );

          await openAIService.generateImage(idea.id, idea.fullPrompt, references);

          await pool.execute(
            'UPDATE paintings SET status = ? WHERE idea_id = ?',
            ['completed', idea.id]
          );

        } catch (error) {
          console.error(`Error generating image for idea ${idea.id}:`, error);
          failedAttempts.set(idea.id, attempts + 1);
          pendingIdeas.push(idea);

          await pool.execute(
            'UPDATE paintings SET status = ?, error_message = ? WHERE idea_id = ?',
            ['pending', error.message, idea.id]
          );
        }

        // Start next image if we have capacity and pending ideas
        if (activePromises.size < MAX_PARALLEL && pendingIdeas.length > 0) {
          await startNextImage();
        }
      };

      // Start initial batch
      const promises = [];
      const initialBatch = Math.min(MAX_PARALLEL, pendingIdeas.length);
      for (let i = 0; i < initialBatch; i++) {
        promises.push(startNextImage());
      }

      // Wait for all initial promises to complete
      await Promise.all(promises);
    };

    // Start processing images and wait for completion
    await processImages();

  } catch (error) {
    console.error('Error in processIdeasAndPaintings:', error);
  }
}

// Helper function to generate and link an idea to a painting
async function generateAndLinkIdea(titleId, titleText, instructions, prevIdeas, painting) {
  try {
    // Generate new idea
    const idea = await openRouterService.generateIdeas(
      titleId,
      titleText,
      instructions,
      prevIdeas
    );

    // Create the idea in the database
    const [ideaResult] = await pool.execute(
      'INSERT INTO ideas (title_id, summary, full_prompt) VALUES (?, ?, ?)',
      [titleId, idea.summary, idea.fullPrompt]
    );

    const ideaId = ideaResult.insertId;

    // Link the idea to the painting
    await pool.execute(
      'UPDATE paintings SET idea_id = ? WHERE id = ?',
      [ideaId, painting.id]
    );

    return {
      id: ideaId,
      summary: idea.summary,
      fullPrompt: idea.fullPrompt
    };
  } catch (error) {
    console.error(`Error generating idea for painting ${painting.id}:`, error);
    throw error;
  }
}

// Get status of all paintings for a title
async function getPaintings(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { titleId } = req.params;

  if (!titleId) {
    return res.status(400).json({ error: 'Title ID is required' });
  }

  try {
    const [titleCheck] = await pool.execute(
      'SELECT id FROM titles WHERE id = ?',
      [titleId]
    );

    if (titleCheck.length === 0) {
      return res.status(404).json({ error: 'Title not found' });
    }

    // Get all paintings for the title, ordered by generation order
    const paintingQuery = `
      SELECT 
        p.id, p.title_id, p.idea_id, p.image_url, p.status,
        p.error_message, p.used_reference_ids, p.generation_order,
        p.created_at, p.updated_at,
        i.summary, i.full_prompt as fullPrompt,
        t.title as title_text, t.instructions as title_instructions
      FROM paintings p
      JOIN titles t ON p.title_id = t.id
      LEFT JOIN ideas i ON p.idea_id = i.id
      WHERE p.title_id = ?
      ORDER BY p.generation_order ASC
    `;

    const [paintings] = await pool.execute(paintingQuery, [titleId]);

    // Get reference data if needed
    const referenceIds = paintings
      .map(p => p.used_reference_ids)
      .filter(ids => ids)
      .flatMap(ids => ids.split(','))
      .filter((id, index, self) => self.indexOf(id) === index);

    const referenceDataMap = {};
    if (referenceIds.length > 0) {
      const [references] = await pool.execute(
        'SELECT id, image_data FROM references2 WHERE id IN (?)',
        [referenceIds]
      );
      references.forEach(ref => {
        referenceDataMap[ref.id] = ref.image_data;
      });
    }

    res.status(200).json({
      paintings,
      referenceDataMap
    });

  } catch (error) {
    console.error('Error in getPaintings:', error);
    res.status(500).json({ error: 'Failed to get paintings' });
  }
}

// Retry a failed painting
async function retryPainting(req, res) {
  const { titleId, order } = req.params;

  try {
    // Get the painting from the database
    const [painting] = await pool.execute(
      'SELECT * FROM paintings WHERE title_id = ? AND generation_order = ?',
      [titleId, order]
    );

    if (!painting) {
      return res.status(404).json({ error: 'Painting not found' });
    }

    // Update the painting status to pending
    await pool.execute(
      'UPDATE paintings SET status = ?, updated_at = NOW() WHERE title_id = ? AND generation_order = ?',
      ['pending', titleId, order]
    );

    // Start the generation process
    generatePaintingInBackground(titleId, order);

    res.json({ message: 'Painting retry started' });
  } catch (error) {
    console.error('Error retrying painting:', error);
    res.status(500).json({ error: 'Failed to retry painting' });
  }
}

// Generate a painting in the background
async function generatePaintingInBackground(titleId, order) {
  try {
    // Get the title details
    const [title] = await pool.execute(
      'SELECT * FROM titles WHERE id = ?',
      [titleId]
    );

    if (!title) {
      throw new Error('Title not found');
    }

    // Get the references for this title
    const [references] = await pool.execute(
      'SELECT * FROM references WHERE title_id = ? OR is_global = 1',
      [titleId]
    );

    // Update status to processing
    await pool.execute(
      'UPDATE paintings SET status = ?, updated_at = NOW() WHERE title_id = ? AND generation_order = ?',
      ['processing', titleId, order]
    );

    // Generate the painting using OpenAI
    const openAIService = require('../services/openAIService');
    const imageUrl = await openAIService.generateImage(title.title, title.instructions, references);

    // Update the painting with the generated image
    await pool.execute(
      'UPDATE paintings SET status = ?, image_url = ?, updated_at = NOW() WHERE title_id = ? AND generation_order = ?',
      ['completed', imageUrl, titleId, order]
    );
  } catch (error) {
    console.error('Error generating painting in background:', error);

    // Update the painting status to failed
    try {
      await pool.execute(
        'UPDATE paintings SET status = ?, error_message = ?, updated_at = NOW() WHERE title_id = ? AND generation_order = ?',
        ['failed', error.message, titleId, order]
      );
    } catch (updateError) {
      console.error('Error updating painting status:', updateError);
    }
  }
}

module.exports = {
  generatePaintings,
  getPaintings,
  retryPainting
}; 