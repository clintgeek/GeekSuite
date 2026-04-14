import express from 'express';
import Story from '../models/Story.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/story/:storyId', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    res.json(story.characters);
  } catch (error) {
    console.error('Error getting characters:', error);
    res.status(500).json({ error: 'Failed to get characters' });
  }
});

router.get('/story/:storyId/character/:characterName', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const character = story.characters.find(char => char.name.toLowerCase() === req.params.characterName.toLowerCase());
    if (!character) return res.status(404).json({ error: 'Character not found' });
    res.json(character);
  } catch (error) {
    console.error('Error getting character:', error);
    res.status(500).json({ error: 'Failed to get character' });
  }
});

router.post('/story/:storyId', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const existingCharacter = story.characters.find(char => char.name.toLowerCase() === req.body.name.toLowerCase());
    if (existingCharacter) return res.status(400).json({ error: 'Character already exists' });
    story.characters.push(req.body);
    await story.save();
    res.json(req.body);
  } catch (error) {
    console.error('Error adding character:', error);
    res.status(500).json({ error: 'Failed to add character' });
  }
});

router.put('/story/:storyId/character/:characterName', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const idx = story.characters.findIndex(char => char.name.toLowerCase() === req.params.characterName.toLowerCase());
    if (idx === -1) return res.status(404).json({ error: 'Character not found' });
    story.characters[idx] = { ...story.characters[idx], ...req.body };
    await story.save();
    res.json(story.characters[idx]);
  } catch (error) {
    console.error('Error updating character:', error);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

router.delete('/story/:storyId/character/:characterName', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const idx = story.characters.findIndex(char => char.name.toLowerCase() === req.params.characterName.toLowerCase());
    if (idx === -1) return res.status(404).json({ error: 'Character not found' });
    story.characters.splice(idx, 1);
    await story.save();
    res.json({ message: 'Character removed successfully' });
  } catch (error) {
    console.error('Error removing character:', error);
    res.status(500).json({ error: 'Failed to remove character' });
  }
});

router.patch('/story/:storyId/character/:characterName/toggle', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const character = story.characters.find(char => char.name.toLowerCase() === req.params.characterName.toLowerCase());
    if (!character) return res.status(404).json({ error: 'Character not found' });
    character.isActive = !character.isActive;
    await story.save();
    res.json({ character, message: `Character ${character.name} is now ${character.isActive ? 'active' : 'inactive'}` });
  } catch (error) {
    console.error('Error toggling character status:', error);
    res.status(500).json({ error: 'Failed to toggle character status' });
  }
});

router.post('/story/:storyId/character/:characterName/inventory', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const character = story.characters.find(char => char.name.toLowerCase() === req.params.characterName.toLowerCase());
    if (!character) return res.status(404).json({ error: 'Character not found' });
    if (!character.inventory) character.inventory = [];
    character.inventory.push(req.body);
    await story.save();
    res.json(character.inventory);
  } catch (error) {
    console.error('Error adding item to inventory:', error);
    res.status(500).json({ error: 'Failed to add item to inventory' });
  }
});

router.delete('/story/:storyId/character/:characterName/inventory/:itemName', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const character = story.characters.find(char => char.name.toLowerCase() === req.params.characterName.toLowerCase());
    if (!character) return res.status(404).json({ error: 'Character not found' });
    const itemIdx = character.inventory.findIndex(item => item.name.toLowerCase() === req.params.itemName.toLowerCase());
    if (itemIdx === -1) return res.status(404).json({ error: 'Item not found' });
    character.inventory.splice(itemIdx, 1);
    await story.save();
    res.json({ message: 'Item removed successfully' });
  } catch (error) {
    console.error('Error removing item from inventory:', error);
    res.status(500).json({ error: 'Failed to remove item from inventory' });
  }
});

export default router;
