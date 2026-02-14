class DiceService {
  constructor() {
    this.diceTypes = {
      d4: () => Math.floor(Math.random() * 4) + 1,
      d6: () => Math.floor(Math.random() * 6) + 1,
      d8: () => Math.floor(Math.random() * 8) + 1,
      d10: () => Math.floor(Math.random() * 10) + 1,
      d12: () => Math.floor(Math.random() * 12) + 1,
      d20: () => Math.floor(Math.random() * 20) + 1,
      d100: () => Math.floor(Math.random() * 100) + 1
    };

    this.interpretations = {
      d20: {
        1: "Critical failure - something goes terribly wrong",
        2: "Major failure - significant setback",
        3: "Failure - things don't go as planned",
        4: "Minor failure - slight setback",
        5: "Poor outcome - not ideal",
        6: "Below average - could be better",
        7: "Slightly below average",
        8: "Average - neutral outcome",
        9: "Slightly above average",
        10: "Above average - decent outcome",
        11: "Good outcome - favorable result",
        12: "Very good - things go well",
        13: "Excellent - great success",
        14: "Outstanding - remarkable success",
        15: "Exceptional - extraordinary result",
        16: "Amazing - incredible success",
        17: "Phenomenal - legendary outcome",
        18: "Near perfect - almost flawless",
        19: "Nearly perfect - exceptional success",
        20: "Critical success - perfect outcome"
      },

      d6: {
        1: "Terrible outcome",
        2: "Poor result",
        3: "Below average",
        4: "Average outcome",
        5: "Good result",
        6: "Excellent outcome"
      },

      d100: {
        // Percentage-based interpretations
        default: (result) => {
          if (result <= 5) return "Critical failure - disaster strikes";
          if (result <= 15) return "Major failure - significant setback";
          if (result <= 30) return "Failure - things don't go as planned";
          if (result <= 50) return "Below average - not ideal";
          if (result <= 70) return "Average - neutral outcome";
          if (result <= 85) return "Above average - good result";
          if (result <= 95) return "Excellent - great success";
          return "Critical success - perfect outcome";
        }
      }
    };

    this.storyDice = {
      mood: () => {
        const moods = ['dark', 'hopeful', 'tense', 'peaceful', 'mysterious', 'chaotic', 'romantic', 'melancholic'];
        return moods[Math.floor(Math.random() * moods.length)];
      },

      weather: () => {
        const weathers = ['stormy', 'clear', 'foggy', 'windy', 'calm', 'rainy', 'snowy', 'overcast'];
        return weathers[Math.floor(Math.random() * moods.length)];
      },

      encounter: () => {
        const encounters = ['friendly', 'hostile', 'neutral', 'mysterious', 'helpful', 'dangerous', 'peaceful', 'chaotic'];
        return encounters[Math.floor(Math.random() * encounters.length)];
      },

      discovery: () => {
        const discoveries = ['treasure', 'danger', 'clue', 'ally', 'enemy', 'mystery', 'opportunity', 'trap'];
        return discoveries[Math.floor(Math.random() * discoveries.length)];
      },

      outcome: () => {
        const outcomes = ['success', 'failure', 'partial_success', 'unexpected_twist', 'costly_victory', 'lucky_escape'];
        return outcomes[Math.floor(Math.random() * outcomes.length)];
      }
    };
  }

  // Roll a specific dice type
  roll(diceType) {
    if (!this.diceTypes[diceType]) {
      throw new Error(`Unknown dice type: ${diceType}`);
    }

    const result = this.diceTypes[diceType]();
    const interpretation = this.interpretResult(diceType, result);

    return {
      diceType: diceType,
      result: result,
      interpretation: interpretation,
      timestamp: new Date()
    };
  }

  // Roll with advantage (take highest of 2 rolls)
  rollWithAdvantage(diceType = 'd20') {
    const roll1 = this.roll(diceType);
    const roll2 = this.roll(diceType);

    const betterRoll = roll1.result > roll2.result ? roll1 : roll2;

    return {
      ...betterRoll,
      advantage: true,
      rolls: [roll1.result, roll2.result]
    };
  }

  // Roll with disadvantage (take lowest of 2 rolls)
  rollWithDisadvantage(diceType = 'd20') {
    const roll1 = this.roll(diceType);
    const roll2 = this.roll(diceType);

    const worseRoll = roll1.result < roll2.result ? roll1 : roll2;

    return {
      ...worseRoll,
      disadvantage: true,
      rolls: [roll1.result, roll2.result]
    };
  }

  // Roll multiple dice
  rollMultiple(diceType, count) {
    const rolls = [];
    let total = 0;

    for (let i = 0; i < count; i++) {
      const roll = this.roll(diceType);
      rolls.push(roll);
      total += roll.result;
    }

    return {
      diceType: diceType,
      count: count,
      rolls: rolls,
      total: total,
      average: total / count,
      timestamp: new Date()
    };
  }

  // Interpret dice result
  interpretResult(diceType, result) {
    if (this.interpretations[diceType]) {
      return this.interpretations[diceType][result] ||
             this.interpretations[diceType].default?.(result) ||
             `Result: ${result}`;
    }

    // Default interpretation for other dice types
    const maxValue = parseInt(diceType.substring(1));
    const percentage = (result / maxValue) * 100;

    if (percentage <= 10) return "Critical failure";
    if (percentage <= 25) return "Major failure";
    if (percentage <= 40) return "Failure";
    if (percentage <= 60) return "Average";
    if (percentage <= 75) return "Success";
    if (percentage <= 90) return "Great success";
    return "Critical success";
  }

  // Roll story-specific dice
  rollStoryDice(type) {
    if (!this.storyDice[type]) {
      throw new Error(`Unknown story dice type: ${type}`);
    }

    const result = this.storyDice[type]();

    return {
      diceType: `story_${type}`,
      result: result,
      interpretation: `Story ${type}: ${result}`,
      timestamp: new Date()
    };
  }

  // Roll for specific story situations
  rollForSituation(situation) {
    const situations = {
      combat: {
        diceType: 'd20',
        interpretations: {
          1: "Critical miss - you stumble and fall",
          20: "Critical hit - devastating blow",
          default: (result) => result <= 10 ? "Miss" : "Hit"
        }
      },

      persuasion: {
        diceType: 'd20',
        interpretations: {
          1: "Critical failure - they become hostile",
          20: "Critical success - they're completely convinced",
          default: (result) => result <= 8 ? "Failure" : result <= 15 ? "Partial success" : "Success"
        }
      },

      stealth: {
        diceType: 'd20',
        interpretations: {
          1: "Critical failure - you make a loud noise",
          20: "Critical success - you're completely undetected",
          default: (result) => result <= 10 ? "Detected" : "Hidden"
        }
      },

      investigation: {
        diceType: 'd20',
        interpretations: {
          1: "Critical failure - you find false information",
          20: "Critical success - you discover a crucial clue",
          default: (result) => result <= 8 ? "No clues found" : result <= 15 ? "Minor clue" : "Important discovery"
        }
      },

      survival: {
        diceType: 'd20',
        interpretations: {
          1: "Critical failure - you get lost",
          20: "Critical success - you find the perfect path",
          default: (result) => result <= 10 ? "Struggle" : "Manage"
        }
      }
    };

    const config = situations[situation];
    if (!config) {
      throw new Error(`Unknown situation: ${situation}`);
    }

    const roll = this.roll(config.diceType);
    const interpretation = config.interpretations[roll.result] ||
                         config.interpretations.default?.(roll.result) ||
                         roll.interpretation;

    return {
      ...roll,
      situation: situation,
      interpretation: interpretation
    };
  }

  // Generate random story elements
  generateStoryElement(type) {
    const elements = {
      character: {
        names: ['Aria', 'Thorne', 'Lysander', 'Seraphina', 'Kael', 'Isolde', 'Raven', 'Zephyr'],
        traits: ['brave', 'cunning', 'wise', 'mysterious', 'loyal', 'ambitious', 'kind', 'fierce'],
        backgrounds: ['noble', 'commoner', 'outcast', 'scholar', 'warrior', 'merchant', 'wanderer', 'royalty']
      },

      location: {
        names: ['Shadowmere', 'Crystal Peak', 'Whisperwood', 'Ironforge', 'Silverbrook', 'Stormhaven'],
        types: ['city', 'forest', 'mountain', 'castle', 'village', 'ruins', 'temple', 'cave'],
        atmospheres: ['mysterious', 'peaceful', 'dangerous', 'magical', 'ancient', 'bustling', 'desolate']
      },

      item: {
        names: ['Crystal Blade', 'Shadow Cloak', 'Phoenix Feather', 'Moonstone Ring', 'Thunder Hammer'],
        types: ['weapon', 'armor', 'artifact', 'tool', 'jewelry', 'potion', 'scroll', 'talisman'],
        properties: ['enchanted', 'ancient', 'cursed', 'blessed', 'mysterious', 'powerful', 'rare']
      }
    };

    const element = elements[type];
    if (!element) {
      throw new Error(`Unknown element type: ${type}`);
    }

    const name = element.names[Math.floor(Math.random() * element.names.length)];
    const trait = element.traits ? element.traits[Math.floor(Math.random() * element.traits.length)] : null;
    const background = element.backgrounds ? element.backgrounds[Math.floor(Math.random() * element.backgrounds.length)] : null;

    return {
      name: name,
      trait: trait,
      background: background,
      type: type
    };
  }

  // Get available dice types
  getAvailableDiceTypes() {
    return Object.keys(this.diceTypes);
  }

  // Get available story dice types
  getAvailableStoryDiceTypes() {
    return Object.keys(this.storyDice);
  }

  // Get available situations
  getAvailableSituations() {
    return ['combat', 'persuasion', 'stealth', 'investigation', 'survival'];
  }
}

module.exports = new DiceService();