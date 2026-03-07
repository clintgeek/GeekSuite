const gql = require('graphql-tag');

// The GraphQL schema
// This covers all FitnessGeek models:
// BloodPressure, DailySummary, FoodItem, FoodLog, LoginStreak,
// Meal, Medication, MedicationLog, NutritionGoals, UserSettings, Weight, WeightGoals
const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable"])

  #
  # Custom Scalars (handled by Apollo)
  #
  scalar Date
  scalar JSON

  #
  # Settings & Profile
  #
  type DashboardSettings {
    show_current_weight: Boolean
    show_blood_pressure: Boolean
    show_calories_today: Boolean
    show_login_streak: Boolean
    show_nutrition_today: Boolean
    show_garmin_summary: Boolean
    show_quick_actions: Boolean
    show_weight_goal: Boolean
    show_nutrition_goal: Boolean
    card_order: [String]
  }

  type GarminSettings {
    enabled: Boolean
    username: String
    last_connected_at: Date
  }

  type HealthBaselines {
    weeklyHRV: Float
    restingHR: Float
    lastUpdated: Date
  }

  type NotificationSettings {
    enabled: Boolean
    daily_reminder: Boolean
    goal_reminders: Boolean
  }

  type NutritionGoalSettings {
    enabled: Boolean
    start_date: Date
    start_weight: Float
    target_weight: Float
    activity_level: String
    weight_change_rate: Float
    plan_type: String
    calorie_target_mode: String
    auto_base_calories: Float
    fixed_calories: Float
    activity_eatback_fraction: Float
    activity_eatback_cap_kcal: Float
    protein_g_per_lb_goal: Float
    fat_g_per_lb_goal: Float
    goal_weight_lbs: Float
    show_adjustment: Boolean
    daily_calorie_target: Float
    weekly_schedule: [Float]
    min_safe_calories: Float
    bmr: Float
    tdee: Float
    timeline_weeks: Float
    estimated_end_date: Date
  }

  type WeightGoalSettings {
    enabled: Boolean
    startWeight: Float
    targetWeight: Float
    startDate: String
    goalDate: String
    ratePerWeek: Float
    lastRecalculated: String
    unit: String
    is_active: Boolean
  }

  type UnitSettings {
    weight: String
    height: String
  }

  type AIFeatures {
    natural_language_food_logging: Boolean
    meal_suggestions: Boolean
    nutrition_analysis: Boolean
    goal_recommendations: Boolean
  }

  type AISettings {
    enabled: Boolean
    features: AIFeatures
  }

  type HouseholdSettings {
    household_id: String
    display_name: String
    share_food_logs: Boolean
    share_weight: Boolean
    share_meals: Boolean
  }

  type UserSettings {
    id: ID!
    user_id: String!
    theme: String
    influxEnabled: Boolean
    dashboard: DashboardSettings
    garmin: GarminSettings
    healthBaselines: HealthBaselines
    notifications: NotificationSettings
    nutrition_goal: NutritionGoalSettings
    weight_goal: WeightGoalSettings
    units: UnitSettings
    ai: AISettings
    household: HouseholdSettings
    favorite_foods: [FoodItem]
    created_at: Date
    updated_at: Date
  }

  input UserSettingsInput {
    theme: String
    influxEnabled: Boolean
    dashboard: JSON
    garmin: JSON
    healthBaselines: JSON
    notifications: JSON
    nutrition_goal: JSON
    weight_goal: JSON
    units: JSON
    ai: JSON
    household: JSON
  }

  #
  # Weight tracker
  #
  type Weight {
    id: ID!
    userId: String!
    weight_value: Float!
    log_date: Date!
    notes: String
    formatted_date: String
    created_at: Date
    updated_at: Date
  }

  input WeightInput {
    weight_value: Float!
    log_date: Date
    notes: String
  }

  #
  # Nutrition Goals
  #
  type NutritionGoals {
    id: ID!
    user_id: String!
    calories: Float
    protein_grams: Float
    carbs_grams: Float
    fat_grams: Float
    fiber_grams: Float
    sugar_grams: Float
    sodium_mg: Float
    start_date: Date
    end_date: Date
    is_active: Boolean
    created_at: Date
    updated_at: Date
  }

  input NutritionGoalsInput {
    calories: Float
    protein_grams: Float
    carbs_grams: Float
    fat_grams: Float
    fiber_grams: Float
    sugar_grams: Float
    sodium_mg: Float
    start_date: Date
    end_date: Date
    is_active: Boolean
  }

  #
  # Food & Nutrition
  #
  type NutritionData {
    calories_per_serving: Float
    protein_grams: Float
    carbs_grams: Float
    fat_grams: Float
    fiber_grams: Float
    sugar_grams: Float
    sodium_mg: Float
  }

  input NutritionDataInput {
    calories_per_serving: Float
    protein_grams: Float
    carbs_grams: Float
    fat_grams: Float
    fiber_grams: Float
    sugar_grams: Float
    sodium_mg: Float
  }

  type FoodItem {
    id: ID!
    name: String!
    brand: String
    serving_size: Float!
    serving_unit: String!
    nutrition: NutritionData!
    barcode: String
    is_verified: Boolean
    user_id: String
    is_deleted: Boolean
    created_at: Date
    updated_at: Date
  }

  input FoodItemInput {
    name: String!
    brand: String
    serving_size: Float!
    serving_unit: String!
    barcode: String
    nutrition: NutritionDataInput!
  }

  type FoodLog {
    id: ID!
    user_id: String!
    log_date: Date!
    meal_type: String!
    food_item_id: FoodItem!
    servings: Float!
    notes: String
    nutrition: NutritionData
    calculatedNutrition: NutritionData
    created_at: Date
    updated_at: Date
  }

  input FoodLogInput {
    log_date: Date!
    meal_type: String!
    food_item_id: ID!
    servings: Float!
    notes: String
    nutrition: NutritionDataInput
  }

  #
  # Meals
  #
  type MealItem {
    food_item_id: FoodItem!
    servings: Float!
  }

  input MealItemInput {
    food_item_id: ID!
    servings: Float!
  }

  type Meal {
    id: ID!
    user_id: String
    name: String!
    meal_type: String!
    food_items: [MealItem]
    is_deleted: Boolean
    created_at: Date
    updated_at: Date
    totalNutrition: NutritionData
  }

  input MealInput {
    name: String!
    meal_type: String!
    food_items: [MealItemInput]
  }

  #
  # Medication
  #
  type Medication {
    id: ID!
    user_id: String!
    display_name: String!
    is_supplement: Boolean
    med_type: String
    rxcui: String
    ingredient_name: String
    brand_name: String
    form: String
    route: String
    strength: String
    dose_value: Float
    dose_unit: String
    sig: String
    times_of_day: [String]
    suggested_indications: [String]
    user_indications: [String]
    supply_start_date: Date
    days_supply: Int
    notes: String
    created_at: Date
    updated_at: Date
  }

  input MedicationInput {
    display_name: String!
    is_supplement: Boolean
    med_type: String
    rxcui: String
    ingredient_name: String
    brand_name: String
    form: String
    route: String
    strength: String
    dose_value: Float
    dose_unit: String
    sig: String
    times_of_day: [String]
    user_indications: [String]
    supply_start_date: Date
    days_supply: Int
    notes: String
  }

  #
  # Blood Pressure
  #
  type BloodPressure {
    id: ID!
    userId: String!
    systolic: Float!
    diastolic: Float!
    pulse: Float
    log_date: Date!
    notes: String
    formatted_date: String
    status: String
    created_at: Date
    updated_at: Date
  }

  input BloodPressureInput {
    systolic: Float!
    diastolic: Float!
    pulse: Float
    log_date: Date
    notes: String
  }

  #
  # Root Queries & Mutations
  #
  type Query {
    # Settings
    userSettings: UserSettings

    # Weight
    weights: [Weight]
    weight(id: ID!): Weight

    # Goals
    activeNutritionGoals: NutritionGoals
    nutritionGoalsHistory: [NutritionGoals]

    # Nutrition & Food
    foodItems(search: String): [FoodItem]
    foodItem(id: ID!): FoodItem

    foodLogs(date: Date, startDate: Date, endDate: Date, mealType: String): [FoodLog]
    foodLog(id: ID!): FoodLog

    # Meals
    meals(mealType: String): [Meal]
    meal(id: ID!): Meal

    # Medication
    medications: [Medication]
    medication(id: ID!): Medication

    # BP
    bloodPressures: [BloodPressure]
    bloodPressure(id: ID!): BloodPressure
  }

  type Mutation {
    # Settings
    updateUserSettings(input: UserSettingsInput!): UserSettings

    # Weight
    addWeight(input: WeightInput!): Weight
    updateWeight(id: ID!, input: WeightInput!): Weight
    deleteWeight(id: ID!): Boolean

    # Goals
    setNutritionGoals(input: NutritionGoalsInput!): NutritionGoals

    # Nutrition & Food
    addFoodItem(input: FoodItemInput!): FoodItem
    updateFoodItem(id: ID!, input: FoodItemInput!): FoodItem
    deleteFoodItem(id: ID!): Boolean

    addFoodLog(input: FoodLogInput!): FoodLog
    updateFoodLog(id: ID!, input: FoodLogInput!): FoodLog
    deleteFoodLog(id: ID!): Boolean

    # Meals
    addMeal(input: MealInput!): Meal
    updateMeal(id: ID!, input: MealInput!): Meal
    deleteMeal(id: ID!): Boolean

    # Medication
    addMedication(input: MedicationInput!): Medication
    updateMedication(id: ID!, input: MedicationInput!): Medication
    deleteMedication(id: ID!): Boolean

    # BP
    addBloodPressure(input: BloodPressureInput!): BloodPressure
    updateBloodPressure(id: ID!, input: BloodPressureInput!): BloodPressure
    deleteBloodPressure(id: ID!): Boolean
  }
`;

module.exports = typeDefs;
