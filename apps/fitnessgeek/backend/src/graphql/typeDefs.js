const { gql } = require('graphql-tag');

const typeDefs = gql`
  type Nutrition {
    calories_per_serving: Float
    protein_grams: Float
    carbs_grams: Float
    fat_grams: Float
    fiber_grams: Float
    sugar_grams: Float
    sodium_mg: Float
  }

  type Serving {
    size: Float
    unit: String
  }

  type FoodItem @key(fields: "id") {
    id: ID!
    name: String!
    brand: String
    barcode: String
    nutrition: Nutrition
    serving: Serving
    source: String
    source_id: String
    user_id: String
    is_deleted: Boolean
    created_at: String
    updated_at: String
  }

  type FoodLog @key(fields: "id") {
    id: ID!
    user_id: String!
    log_date: String!
    meal_type: String!
    food_item_id: FoodItem
    servings: Float!
    notes: String
    nutrition: Nutrition
    calculatedNutrition: Nutrition
    created_at: String
    updatedAt: String
  }

  extend type Query {
    foodItems(query: String): [FoodItem!]!
    foodLogs(date: String!): [FoodLog!]!
  }

  extend type Mutation {
    logFood(log_date: String!, meal_type: String!, food_item_id: ID!, servings: Float!, notes: String): FoodLog!
  }
`;

module.exports = { typeDefs };
