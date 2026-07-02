import { Schema, model, Document } from 'mongoose';

export interface IChatMessage {
  role: 'user' | 'model' | 'assistant';
  text: string;
  timestamp: Date;
}

export interface IIAInteraction extends Document {
  userId: string;
  problemContext: string;
  mathematicalSolution?: any;
  chatHistory: IChatMessage[];
  createdAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>({
  role: { type: String, enum: ['user', 'model', 'assistant'], required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, required: true }
}, { _id: false });

const IAInteractionSchema = new Schema<IIAInteraction>({
  userId: { type: String, required: true, index: true },
  problemContext: { type: String, required: true },
  mathematicalSolution: { type: Schema.Types.Mixed },
  chatHistory: { type: [ChatMessageSchema], default: [], required: true },
  createdAt: { type: Date, default: Date.now, required: true }
});

export const IAInteraction = model<IIAInteraction>('IAInteraction', IAInteractionSchema);
export default IAInteraction;
