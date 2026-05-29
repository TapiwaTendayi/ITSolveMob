/**
 * One-time migration: restoreDeletedNames.js
 *
 * Before the soft-delete fix, deleted users had their name changed to
 * "Deleted User" and their real name saved in the `deletedName` field.
 * This script restores the real name from deletedName (if available),
 * so that all dashboards show the actual person's name.
 *
 * Run once from the backend folder:
 *   node scripts/restoreDeletedNames.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({
  name: String, deletedName: String, isDeleted: Boolean
}, { strict: false }));

const victims = await User.find({ isDeleted: true, name: 'Deleted User' });
console.log(`Found ${victims.length} users with name="Deleted User"`);

let fixed = 0;
for (const u of victims) {
  if (u.deletedName && u.deletedName !== 'Deleted User') {
    u.name = u.deletedName;
    await u.save();
    console.log(`  ✅ Restored: ${u.deletedName} (${u._id})`);
    fixed++;
  } else {
    console.log(`  ⚠️  No deletedName for ${u._id} — name cannot be recovered`);
  }
}

console.log(`\nDone. Restored ${fixed}/${victims.length} names.`);
await mongoose.disconnect();
