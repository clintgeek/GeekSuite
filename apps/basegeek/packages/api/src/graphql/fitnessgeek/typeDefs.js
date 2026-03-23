import { gql } from 'graphql-tag';

export const typeDefs = gql`
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

  type HouseholdMember {
    user_id: ID!
    display_name: String
    shares_food_logs: Boolean
    shares_weight: Boolean
    shares_meals: Boolean
  }

  type Household {
    household_id: String
    display_name: String
    share_food_logs: Boolean
    share_weight: Boolean
    share_meals: Boolean
    members: [HouseholdMember]
  }

  type FitnessUserSettings {
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
    favorite_foods: [FitnessFood]
    created_at: Date
    updated_at: Date
  }

  input FitnessUserSettingsInput {
    theme: String
    influxEnabled: Boolean
    dashboard: FitnessJSON
    garmin: FitnessJSON
    healthBaselines: FitnessJSON
    notifications: FitnessJSON
    nutrition_goal: FitnessJSON
    weight_goal: FitnessJSON
    units: FitnessJSON
    ai: FitnessJSON
    household: FitnessJSON
  }

  scalar FitnessJSON

  type FitnessWeight {
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

  type FitnessFood {
    id: ID!
    name: String
    brand: String
    serving_size: Float
    serving_unit: String
    nutrition: NutritionData
    barcode: String
    is_verified: Boolean
    user_id: String
    is_deleted: Boolean
    created_at: Date
    updated_at: Date
  }

  input FitnessFoodInput {
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
    food_item_id: FitnessFood!
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

  type MealItem {
    food_item_id: FitnessFood!
    servings: Float!
  }

  input MealItemInput {
    food_item_id: ID!
    servings: Float!
  }

  type FitnessMeal {
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

  input FitnessMealInput {
    name: String!
    meal_type: String!
    food_items: [MealItemInput]
  }

  type FitnessMedication {
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

  input FitnessMedicationInput {
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

  type LoginStreak {
    currentStreak: Int
    longestStreak: Int
    lastLoginDate: String
    streakStartDate: String
  }

  type MealTotals {
    calories: Float
    protein_grams: Float
    carbs_grams: Float
    fat_grams: Float
  }

  type DailySummaryMeals {
    breakfast: MealTotals
    lunch: MealTotals
    dinner: MealTotals
    snack: MealTotals
  }

  type DailySummaryTotals {
    calories: Float
    protein_grams: Float
    carbs_grams: Float
    fat_grams: Float
    fiber_grams: Float
    sugar_grams: Float
    sodium_mg: Float
  }

  type FitnessDailySummary {
    date: String
    totals: DailySummaryTotals
    meals: DailySummaryMeals
    calorieGoal: Float
  }

  type MacroDay {
    dayIndex: Int
    base_calories: Float
    activity_add_kcal: Float
    target_calories: Float
    protein_g: Float
    fat_g: Float
    carbs_g: Float
  }

  type MacroRules {
    goal_weight_lbs: Float
    protein_g_per_lb: Float
    fat_g_per_lb: Float
    calorie_target_mode: String
    activity_eatback_fraction: Float
    activity_eatback_cap_kcal: Float
  }

  type MacroFixed {
    protein_g: Float
    fat_g: Float
    protein_kcal: Float
    fat_kcal: Float
  }

  type MacroCalories {
    daily: Float
    weekly_schedule: [Float]
  }

  type DerivedMacros {
    rules: MacroRules
    fixed: MacroFixed
    calories: MacroCalories
    weekly: [MacroDay]
    today: MacroDay
    todayIndex: Int
  }

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

  type FitnessFoodReport {
    range: FitnessJSON
    totals: FitnessJSON
    averages: FitnessJSON
    daily: [FitnessJSON]
    meals: FitnessJSON
    topFoods: [FitnessJSON]
    goalCompliance: FitnessJSON
  }

  type FitnessTrendReport {
    range: FitnessJSON
    daily: [FitnessJSON]
    rolling: [FitnessJSON]
    weights: [FitnessJSON]
    highlights: [String]
  }

  type FitnessInsight {
    type: String
    content: String
    generatedAt: Date
    context: FitnessJSON
  }

  input ChatMessageInput {
    role: String
    content: String
  }

  type GarminStatus {
    enabled: Boolean
    hasCredentials: Boolean
    hasTokens: Boolean
    lastConnectedAt: Date
  }

  type GarminActivity {
    activityId: ID
    activityName: String
    activityType: String
    startTimeLocal: String
    startTimeGMT: String
    duration: Float
    distance: Float
    calories: Float
    averageHR: Float
    maxHR: Float
    averageSpeed: Float
    elevationGain: Float
    steps: Int
  }

  type GarminDaily {
    date: String
    steps: Int
    activeCalories: Int
    restingHR: Int
    weightLbs: Float
    sleepMinutes: Int
    fetchedAt: String
    lastSyncAt: Date
  }

  type GarminSleepData {
    date: String
    totalSleepMinutes: Int
    deepSleepMinutes: Int
    lightSleepMinutes: Int
    remSleepMinutes: Int
    awakeSleepMinutes: Int
    sleepStartTime: String
    sleepEndTime: String
    sleepScore: Int
    sleepQuality: String
    sleepFeedback: String
    restingHeartRate: Int
    avgOvernightHrv: Int
    hrvStatus: String
    avgSpO2: Int
    avgRespiration: Float
    avgSleepStress: Int
    bodyBatteryChange: Int
  }

  type Query {
    fitnessUserSettings: FitnessUserSettings
    fitnessWeights: [FitnessWeight]
    fitnessWeight(id: ID!): FitnessWeight
    activeNutritionGoals: NutritionGoals
    nutritionGoalsHistory: [NutritionGoals]
    fitnessFoods(search: String): [FitnessFood]
    fitnessFood(id: ID!): FitnessFood
    foodLogs(date: Date, startDate: Date, endDate: Date, mealType: String): [FoodLog]
    foodLog(id: ID!): FoodLog
    fitnessMeals(mealType: String): [FitnessMeal]
    fitnessMeal(id: ID!): FitnessMeal
    fitnessMedications: [FitnessMedication]
    fitnessMedication(id: ID!): FitnessMedication
    bloodPressures: [BloodPressure]
    bloodPressure(id: ID!): BloodPressure
    loginStreak: LoginStreak
    dailySummary(date: String): FitnessDailySummary
    weeklySummary(startDate: String!): FitnessJSON
    derivedMacros: DerivedMacros
    fitnessHousehold: Household
    fitnessHouseholdMemberLogs(memberId: ID!, date: String!): [FoodLog]
    fitnessFoodReportOverview(start: String, days: Int): FitnessFoodReport
    fitnessFoodReportTrends(start: String, days: Int): FitnessTrendReport
    fitnessInsightsMorningBrief: FitnessInsight
    fitnessInsightsDailySummary(date: String): FitnessInsight
    fitnessInsightsCorrelations: FitnessInsight
    fitnessInsightsWeeklyReport(start: String, days: Int): FitnessInsight
    fitnessInsightsTrendWatch(start: String, days: Int): FitnessInsight
    fitnessInsightsCoaching: FitnessInsight
    fitnessInsightsContext(days: Int): FitnessJSON

    garminStatus: GarminStatus
    garminDaily(date: String): GarminDaily
    garminSleep(date: String): GarminSleepData
    garminActivities(start: Int, limit: Int): [GarminActivity]
  }

  type Mutation {
    updateFitnessUserSettings(input: FitnessUserSettingsInput!): FitnessUserSettings
    addFitnessWeight(input: WeightInput!): FitnessWeight
    updateFitnessWeight(id: ID!, input: WeightInput!): FitnessWeight
    deleteFitnessWeight(id: ID!): Boolean
    setNutritionGoals(input: NutritionGoalsInput!): NutritionGoals
    addFitnessFood(input: FitnessFoodInput!): FitnessFood
    updateFitnessFood(id: ID!, input: FitnessFoodInput!): FitnessFood
    deleteFitnessFood(id: ID!): Boolean
    addFoodLog(input: FoodLogInput!): FoodLog
    updateFoodLog(id: ID!, input: FoodLogInput!): FoodLog
    deleteFoodLog(id: ID!): Boolean
    addFitnessMeal(input: FitnessMealInput!): FitnessMeal
    updateFitnessMeal(id: ID!, input: FitnessMealInput!): FitnessMeal
    deleteFitnessMeal(id: ID!): Boolean
    addFitnessMedication(input: FitnessMedicationInput!): FitnessMedication
    updateFitnessMedication(id: ID!, input: FitnessMedicationInput!): FitnessMedication
    deleteFitnessMedication(id: ID!): Boolean
    addBloodPressure(input: BloodPressureInput!): BloodPressure
    updateBloodPressure(id: ID!, input: BloodPressureInput!): BloodPressure
    deleteBloodPressure(id: ID!): Boolean
    recordLoginStreak: LoginStreak
    createFitnessHousehold(display_name: String!): Household
    joinFitnessHousehold(household_id: String!, display_name: String!): Household
    updateFitnessHouseholdSettings(input: FitnessJSON!): Household
    leaveFitnessHousehold: Boolean
    copyFitnessMeal(from_date: String!, to_date: String!, from_meal_type: String, to_meal_type: String, from_user_id: ID): [FoodLog]
    fitnessInsightsChat(message: String!, history: [ChatMessageInput]): FitnessInsight
    updateGarminWeight(date: String, weightLbs: Float!, timezone: String): FitnessJSON
    refreshDailySummary(date: String): FitnessDailySummary
    logMeal(mealId: ID!, date: String!, mealType: String): [FoodLog]
  }
`;
