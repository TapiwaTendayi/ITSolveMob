// backend/models/Notification.js
import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: { 
    type: String, 
    enum: [
      'new-request',
      'assigned-request',
      'assignment',       // ← added
      'resolution',       // ← added
      'info',
      'success',
      'warning',
      'error'
    ], 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request'
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, requestId: 1 });

export default mongoose.model('Notification', NotificationSchema);