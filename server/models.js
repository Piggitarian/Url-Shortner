import mongoose from 'mongoose';

export const THEMES = ['meadow', 'dusk', 'ocean', 'forest', 'ember'];

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
  const linkSchema = new mongoose.Schema({
    shortId: { type: String, required: true, unique: true },
    longUrl: { type: String, required: true, unique: true },
    clicks: { type: Number, default: 0 },
  }, { timestamps: true });
  const savedLinkSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    link: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
    title: { type: String, required: true, maxlength: 80 },
    visible: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
  }, { timestamps: true });
  savedLinkSchema.index({ user: 1, link: 1 }, { unique: true });
  return {
    User: connection.models.User || connection.model('User', userSchema),
    Link: connection.models.Link || connection.model('Link', linkSchema),
    SavedLink: connection.models.SavedLink || connection.model('SavedLink', savedLinkSchema),
  };
}
