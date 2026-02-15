import mongoose from 'mongoose';
import Note from '../models/Note.js';
import Folder from '../models/Folder.js';
import dotenv from 'dotenv';

dotenv.config();

const migrateFoldersToTags = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Get all folders
        const folders = await Folder.find({});
        console.log(`Found ${folders.length} folders to migrate`);

        // For each folder
        for (const folder of folders) {
            console.log(`\nProcessing folder: ${folder.name}`);

            // Find all notes in this folder
            const notes = await Note.find({ folderId: folder._id });
            console.log(`Found ${notes.length} notes in folder`);

            // Create the folder tag
            const folderTag = `folder/${folder.name.replace(/\//g, '-')}`;

            // Update each note
            for (const note of notes) {
                // Add the folder tag if it doesn't exist
                const updatedTags = [...new Set([...note.tags, folderTag])];

                // Update the note: add folder tag and remove folderId
                await Note.updateOne(
                    { _id: note._id },
                    {
                        $set: { tags: updatedTags },
                        $unset: { folderId: "" }
                    }
                );
            }
            console.log(`Updated ${notes.length} notes with folder tag: ${folderTag}`);
        }

        // After all notes are updated, we can drop the folders collection
        await mongoose.connection.dropCollection('folders');
        console.log('\nDropped folders collection');

        // Update Note schema to remove folderId field
        await Note.updateMany({}, { $unset: { folderId: "" } });
        console.log('Removed folderId field from all notes');

        console.log('\nMigration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
};

// Run the migration
migrateFoldersToTags();