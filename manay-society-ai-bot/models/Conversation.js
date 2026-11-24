import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 12000 },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  messages: { type: [messageSchema], default: [] },
}, { timestamps: true });

conversationSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const Conversation = mongoose.model('Conversation', conversationSchema);
