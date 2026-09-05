// @geeksuite/schemas — Mongoose schema definitions that more than one writer
// shares. Import the specific schema you need via its subpath export, e.g.
//
//   const { createUserSettingsSchema } =
//     require('@geeksuite/schemas/fitnessgeek/userSettings');
//
// Nothing here opens a connection or registers a model: each consumer builds
// the schema with its own mongoose and binds it to its own connection.

module.exports = {
  fitnessgeek: {
    bloodPressure: require('./fitnessgeek/bloodPressure.js'),
    userSettings: require('./fitnessgeek/userSettings.js'),
    weight: require('./fitnessgeek/weight.js'),
  },
};
