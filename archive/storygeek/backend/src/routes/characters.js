const express = require('express');
const router = express.Router();
const Story = require('../models/Story');
const { authenticateToken } = require('../middleware/auth');

// Protected routes - require authentication
router.use(authenticateToken);

// Get all characters for a story
router.get('/story/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json(story.characters);
  } catch (error) {
    console.error('Error getting characters:', error);
    res.status(500).json({ error: 'Failed to get characters' });
  }
});

// Get specific character
router.get('/story/:storyId/character/:characterName', async (req, res) => {
  try {
    const { storyId, characterName } = req.params;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const character = story.characters.find(char =>
      char.name.toLowerCase() === characterName.toLowerCase()
    );

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json(character);
  } catch (error) {
    console.error('Error getting character:', error);
    res.status(500).json({ error: 'Failed to get character' });
  }
});

// Add character to story
router.post('/story/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const characterData = req.body;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Check if character already exists
    const existingCharacter = story.characters.find(char =>
      char.name.toLowerCase() === characterData.name.toLowerCase()
    );

    if (existingCharacter) {
      return res.status(400).json({ error: 'Character already exists' });
    }

    // Add character
    story.characters.push(characterData);
    await story.save();

    res.json(characterData);
  } catch (error) {
    console.error('Error adding character:', error);
    res.status(500).json({ error: 'Failed to add character' });
  }
});

// Update character
router.put('/story/:storyId/character/:characterName', async (req, res) => {
  try {
    const { storyId, characterName } = req.params;
    const updates = req.body;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const characterIndex = story.characters.findIndex(char =>
      char.name.toLowerCase() === characterName.toLowerCase()
    );

    if (characterIndex === -1) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Update character
    story.characters[characterIndex] = {
      ...story.characters[characterIndex],
      ...updates
    };

    await story.save();

    res.json(story.characters[characterIndex]);
  } catch (error) {
    console.error('Error updating character:', error);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

// Remove character from story
router.delete('/story/:storyId/character/:characterName', async (req, res) => {
  try {
    const { storyId, characterName } = req.params;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const characterIndex = story.characters.findIndex(char =>
      char.name.toLowerCase() === characterName.toLowerCase()
    );

    if (characterIndex === -1) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Remove character
    story.characters.splice(characterIndex, 1);
    await story.save();

    res.json({ message: 'Character removed successfully' });
  } catch (error) {
    console.error('Error removing character:', error);
    res.status(500).json({ error: 'Failed to remove character' });
  }
});

// Toggle character active status
router.patch('/story/:storyId/character/:characterName/toggle', async (req, res) => {
  try {
    const { storyId, characterName } = req.params;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const character = story.characters.find(char =>
      char.name.toLowerCase() === characterName.toLowerCase()
    );

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Toggle active status
    character.isActive = !character.isActive;
    await story.save();

    res.json({
      character: character,
      message: `Character ${character.name} is now ${character.isActive ? 'active' : 'inactive'}`
    });
  } catch (error) {
    console.error('Error toggling character status:', error);
    res.status(500).json({ error: 'Failed to toggle character status' });
  }
});

// Add item to character inventory
router.post('/story/:storyId/character/:characterName/inventory', async (req, res) => {
  try {
    const { storyId, characterName } = req.params;
    const item = req.body;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const character = story.characters.find(char =>
      char.name.toLowerCase() === characterName.toLowerCase()
    );

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Add item to inventory
    if (!character.inventory) {
      character.inventory = [];
    }

    character.inventory.push(item);
    await story.save();

    res.json(character.inventory);
  } catch (error) {
    console.error('Error adding item to inventory:', error);
    res.status(500).json({ error: 'Failed to add item to inventory' });
  }
});

// Remove item from character inventory
router.delete('/story/:storyId/character/:characterName/inventory/:itemName', async (req, res) => {
  try {
    const { storyId, characterName, itemName } = req.params;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const character = story.characters.find(char =>
      char.name.toLowerCase() === characterName.toLowerCase()
    );

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const itemIndex = character.inventory.findIndex(item =>
      item.name.toLowerCase() === itemName.toLowerCase()
    );

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Remove item
    character.inventory.splice(itemIndex, 1);
    await story.save();

    res.json({ message: 'Item removed successfully' });
  } catch (error) {
    console.error('Error removing item from inventory:', error);
    res.status(500).json({ error: 'Failed to remove item from inventory' });
  }
});

module.exports = router;