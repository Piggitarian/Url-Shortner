import mongoose from 'mongoose';

// Database · Step 1: Keep supported landscape names consistent across profile validation.
export const THEMES = ['meadow', 'dusk', 'ocean', 'forest', 'ember'];

// Database · Step 2: Store accounts with private password hashes and Google identities.
export function createModels(connection) {
  const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: function () { return !this.googleId; }, select: false },
    googleId: { type: String, unique: true, sparse: true, select: false },
    name: { type: String, required: true, maxlength: 60 },
    bio: { type: String, default: '', maxlength: 180 },
    theme: { type: String, enum: THEMES, default: 'meadow' },
  }, { timestamps: true });
// Database · Step 3: Store one stable short code per URL with a shared click counter.
  const linkSchema = new mongoose.Schema({
    shortId: { type: String, required: true, unique: true },
    longUrl: { type: String, required: true, unique: true },
    clicks: { type: Number, default: 0 },
  }, { timestamps: true });
// Database · Step 4: Store each user's title, visibility, and ordering independently.
  const savedLinkSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    link: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
    title: { type: String, required: true, maxlength: 80 },
    visible: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
  }, { timestamps: true });
// Database · Step 5: Prevent duplicate saved links and reuse models on reconnect.
  savedLinkSchema.index({ user: 1, link: 1 }, { unique: true });
  return {
    User: connection.models.User || connection.model('User', userSchema),
    Link: connection.models.Link || connection.model('Link', linkSchema),
    SavedLink: connection.models.SavedLink || connection.model('SavedLink', savedLinkSchema),
  };
}
