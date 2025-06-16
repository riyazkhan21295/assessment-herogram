const axios = require('axios');
const { pool } = require('../database');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Function to generate painting ideas using OpenRouter with function calling
async function generateIdeas(titleId, titleText, instructions, previousIdeas = []) {
  try {
    if (!titleId) {
      throw new Error('Title ID is required for idea generation');
    }

    if (!titleText) {
      throw new Error('Title text is required for idea generation');
    }

    // Get previous ideas for context
    const previousIdeasSummary = previousIdeas.length > 0
      ? `Previous painting ideas: ${previousIdeas.map(idea => idea.summary).join('; ')}`
      : '';

    if (!OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key is missing. Please check your .env file.');
    }

    // Create the prompt for the AI
    const prompt = `Create a unique and creative painting idea for a piece titled "${titleText}".
${instructions ? `\nCustom instructions: ${instructions}` : ''}
${previousIdeasSummary ? `\n${previousIdeasSummary}` : ''}
\nPlease make sure this idea is different from any previous ones.
\nRespond in JSON format with two fields:
- summary: A brief description of the painting idea (1-2 sentences)
- fullPrompt: A detailed prompt for image generation (3-4 sentences)`;

    // Call OpenRouter API
    const response = await axios.post(OPENROUTER_URL, {
      model: 'openai/gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a creative art director specializing in generating unique painting ideas.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // Parse the response
    let ideaData;
    try {
      const content = response.data.choices[0].message.content;
      ideaData = JSON.parse(content);
    } catch (error) {
      console.error('Error parsing OpenRouter response:', error);
      throw new Error('Invalid response format from OpenRouter API');
    }

    // Insert the idea into the database
    const [result] = await pool.execute(
      'INSERT INTO ideas (title_id, summary, full_prompt) VALUES (?, ?, ?)',
      [titleId, ideaData.summary, ideaData.fullPrompt]
    );

    return {
      id: result.insertId,
      summary: ideaData.summary,
      fullPrompt: ideaData.fullPrompt
    };

  } catch (error) {
    console.error('Error generating ideas:', error);
    throw error;
  }
}

module.exports = { generateIdeas }; 