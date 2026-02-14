import mongoose from "mongoose";
import { env } from "../config/env.js";
import {
  Bird,
  Group,
  Pairing,
  EggProduction,
  HatchEvent,
  Location,
  HealthRecord
} from "../models/index.js";

const OWNER = env.seedOwnerId;

async function run() {
  try {
    await mongoose.connect(env.mongodbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("✓ MongoDB connected");

    // Clear existing seed data for this owner
    console.log(`\nClearing existing data for owner: ${OWNER}`);
    await Promise.all([
      Bird.deleteMany({ ownerId: OWNER }),
      Group.deleteMany({ ownerId: OWNER }),
      Pairing.deleteMany({ ownerId: OWNER }),
      EggProduction.deleteMany({ ownerId: OWNER }),
      HatchEvent.deleteMany({ ownerId: OWNER }),
      Location.deleteMany({ ownerId: OWNER }),
      HealthRecord.deleteMany({ ownerId: OWNER })
    ]);
    console.log("✓ Cleared existing data");

    // Create locations
    console.log("\nCreating locations...");
    const locations = await Location.insertMany([
      {
        ownerId: OWNER,
        name: "Main Coop A",
        type: "coop",
        capacity: 10,
        cleaningIntervalDays: 7
      },
      {
        ownerId: OWNER,
        name: "Tractor 1",
        type: "tractor",
        capacity: 5,
        cleaningIntervalDays: 3
      },
      {
        ownerId: OWNER,
        name: "Brooder",
        type: "brooder",
        capacity: 50,
        cleaningIntervalDays: 2
      }
    ]);
    console.log(`✓ Created ${locations.length} locations`);

    // Create birds
    console.log("\nCreating birds...");
    const hensData = [
      { tagId: "FG-25-0001", name: "Hen A", sex: "hen", breed: "Buff Orpington" },
      { tagId: "FG-25-0002", name: "Hen B", sex: "hen", breed: "Buff Orpington" },
      { tagId: "FG-25-0003", name: "Hen C", sex: "hen", breed: "Australorp" },
      { tagId: "FG-25-0004", name: "Pullet A", sex: "pullet", breed: "Mixed" }
    ];

    const roosters = [
      { tagId: "ROO-25-001", name: "Rex", sex: "rooster", breed: "Buff Orpington" },
      { tagId: "ROO-25-002", name: "Thor", sex: "rooster", breed: "Australorp" }
    ];

    const allBirdData = hensData.concat(roosters).map((b) => ({
      ownerId: OWNER,
      ...b,
      hatchDate: new Date(2024, Math.floor(Math.random() * 12), 1),
      status: "active",
      foundationStock: true,
      temperamentScore: Math.floor(Math.random() * 10) + 1,
      locationId: locations[0]._id
    }));

    const birds = await Bird.insertMany(allBirdData);
    console.log(`✓ Created ${birds.length} birds`);

    const hens = birds.filter((b) => b.sex === "hen");
    const roostersCreated = birds.filter((b) => b.sex === "rooster");

    // Create group
    console.log("\nCreating groups...");
    const group = await Group.create({
      ownerId: OWNER,
      name: "Layer Flock A",
      purpose: "layer_flock",
      type: "coop",
      startDate: new Date(),
      description: "Primary egg-laying flock"
    });
    console.log(`✓ Created group: ${group.name}`);

    // Create pairing
    console.log("\nCreating pairing...");
    const pairing = await Pairing.create({
      ownerId: OWNER,
      name: "Spring 2025 Breeding",
      roosterIds: roostersCreated.map((r) => r._id),
      henIds: hens.map((h) => h._id),
      season: "2025-Q1",
      seasonYear: 2025,
      goals: ["bigger_eggs", "better_hatch", "calmer_roos"],
      active: true
    });
    console.log(`✓ Created pairing: ${pairing.name}`);

    // Create hatch events
    console.log("\nCreating hatch events...");
    const hatchEvents = await HatchEvent.insertMany([
      {
        ownerId: OWNER,
        pairingId: pairing._id,
        setDate: new Date(2024, 2, 1),
        hatchDate: new Date(2024, 3, 21),
        eggsSet: 24,
        eggsFertile: 22,
        chicksHatched: 18,
        pullets: 9,
        cockerels: 9,
        notes: "Good hatch from spring pairing"
      },
      {
        ownerId: OWNER,
        pairingId: pairing._id,
        setDate: new Date(2024, 4, 10),
        hatchDate: null,
        eggsSet: 24,
        eggsFertile: 20,
        chicksHatched: null,
        pullets: null,
        cockerels: null,
        notes: "Currently incubating, due date May 31"
      }
    ]);
    console.log(`✓ Created ${hatchEvents.length} hatch events`);

    // Create egg production records
    console.log("\nCreating egg production records...");
    const today = new Date();
    const eggRecords = [];
    for (let i = 30; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      eggRecords.push({
        ownerId: OWNER,
        groupId: group._id,
        date,
        eggsCount: Math.floor(Math.random() * 4) + 2,
        eggColor: "brown",
        eggSize: "large",
        source: "manual",
        quality: "ok",
        daysObserved: 1,
        birdIdsSnapshot: hens.slice(0, 3).map((h) => h._id)
      });
    }
    const eggProduction = await EggProduction.insertMany(eggRecords);
    console.log(`✓ Created ${eggProduction.length} egg production records`);

    // Create health records
    console.log("\nCreating health records...");
    const healthRecords = await HealthRecord.insertMany([
      {
        ownerId: OWNER,
        birdId: birds[0]._id,
        eventDate: new Date(2024, 11, 15),
        type: "illness",
        diagnosis: "Minor cold",
        treatment: "Monitored, extra vitamins",
        outcome: "recovered",
        notes: "Back to normal laying"
      },
      {
        ownerId: OWNER,
        birdId: birds[2]._id,
        eventDate: new Date(2024, 10, 20),
        type: "checkup",
        outcome: "NA",
        notes: "Annual wellness check - all clear"
      }
    ]);
    console.log(`✓ Created ${healthRecords.length} health records`);

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("✓ Seed data created successfully!");
    console.log("=".repeat(50));
    console.log(`
Owner ID: ${OWNER}
Birds: ${birds.length}
Groups: 1
Pairings: 1
Hatch Events: ${hatchEvents.length}
Egg Production Records: ${eggProduction.length}
Health Records: ${healthRecords.length}
Locations: ${locations.length}

Use X-Owner-Id: ${OWNER} in your API requests.
    `);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
}

run();
