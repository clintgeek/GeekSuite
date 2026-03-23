const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a chat response from OpenAI
 * @param {Array} messages - Array of message objects { role, content }
 * @returns {Promise<string>} - The AI's response content
 */
const generateChatResponse = async (messages) => {
  try {
    const completion = await openai.chat.completions.create({
      messages: messages,
      model: 'gpt-3.5-turbo', // Cost-effective and sufficient for this use case
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    throw new Error('Failed to generate AI response');
  }
};

module.exports = {
  generateChatResponse,
};
