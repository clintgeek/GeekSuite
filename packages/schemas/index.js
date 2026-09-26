// @geeksuite/schemas — Mongoose schema definitions that more than one writer
// shares. Import the specific schema you need via its subpath export, e.g.
//
//   const { createUserSettingsSchema } =
//     require('@geeksuite/schemas/fitnessgeek/userSettings');
//
// Nothing here opens a connection or registers a model: each consumer builds
// the schema with its own mongoose and binds it to its own connection.

module.exports = {
  bookgeek: {
    book: require('./bookgeek/book.js'),
    profile: require('./bookgeek/profile.js'),
  },
  fitnessgeek: {
    bloodPressure: require('./fitnessgeek/bloodPressure.js'),
    bodyComposition: require('./fitnessgeek/bodyComposition.js'),
    bodyCompositionDerivation: require('./fitnessgeek/bodyCompositionDerivation.js'),
    dailySummary: require('./fitnessgeek/dailySummary.js'),
    foodItem: require('./fitnessgeek/foodItem.js'),
    foodLog: require('./fitnessgeek/foodLog.js'),
    loginStreak: require('./fitnessgeek/loginStreak.js'),
    meal: require('./fitnessgeek/meal.js'),
    medication: require('./fitnessgeek/medication.js'),
    nutritionGoals: require('./fitnessgeek/nutritionGoals.js'),
    userSettings: require('./fitnessgeek/userSettings.js'),
    weight: require('./fitnessgeek/weight.js'),
    weightGoals: require('./fitnessgeek/weightGoals.js'),
  },
  thinggeek: {
    constants: require('./thinggeek/constants.js'),
    household: require('./thinggeek/household.js'),
    thing: require('./thinggeek/thing.js'),
    thingType: require('./thinggeek/thingType.js'),
    file: require('./thinggeek/file.js'),
    profile: require('./thinggeek/profile.js'),
    starterTypes: require('./thinggeek/starterTypes.js'),
  },
  gamegeek: {
    constants: require('./gamegeek/constants.js'),
    household: require('./gamegeek/household.js'),
    game: require('./gamegeek/game.js'),
    gamePlayer: require('./gamegeek/gamePlayer.js'),
    profile: require('./gamegeek/profile.js'),
  },
};
