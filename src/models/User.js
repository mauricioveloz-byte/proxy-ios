const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    keyAuthUsername: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    activeCustomization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customization',
      default: null,
    },
    activeResource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customization',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
