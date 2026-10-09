const express = require('express');
const mongoose = require('mongoose');
const Customization = require('../models/Customization');
const User = require('../models/User');
const asyncHandler = require('../middleware/async-handler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/session', (req, res) => res.status(200).json({
  user: {
    username: req.auth.keyAuthUsername || req.user.keyAuthUsername || 'local-admin',
    role: req.auth.role === 'admin' || req.user.role === 'admin' ? 'admin' : 'user',
  },
}));

router.get(
  '/active-resource',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate({
      path: 'activeResource',
      select: 'name category resource_url checksum_sha256 version target_path_relative isActive',
    });
    const resource = user?.activeResource;
    if (!resource || !resource.isActive) {
      return res.status(404).json({ error: 'No active resource found' });
    }
    if (!resource.target_path_relative) {
      return res.status(409).json({ error: 'The active resource needs a target path migration' });
    }

    return res.status(200).json({
      resource_id: resource._id.toString(),
      resource_name: resource.name,
      download_url: resource.resource_url,
      checksum_sha256: resource.checksum_sha256,
      target_path_relative: resource.target_path_relative,
      version: resource.version,
      category: resource.category,
    });
  })
);

router.get(
  '/active-theme',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate({
      path: 'activeCustomization',
      select: 'name category resource_url checksum_sha256 version isActive',
    });
    const customization = user?.activeCustomization;

    if (!user || !customization || !customization.isActive) {
      return res.status(404).json({ error: 'No active customization found' });
    }
    return res.status(200).json({ customization });
  })
);

router.patch(
  '/customizations/:id/active',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { active } = req.body;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid customization identifier' });
    }
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be a boolean' });
    }

    if (active) {
      const customization = await Customization.findOne({ _id: id, isActive: true }).select('_id');
      if (!customization) {
        return res.status(404).json({ error: 'Customization not found or unavailable' });
      }
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { activeCustomization: customization._id, activeResource: customization._id },
        { new: true }
      ).populate('activeCustomization', 'name category resource_url checksum_sha256 version');
      return res.status(200).json({ activeCustomization: user.activeCustomization });
    }

    const user = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        $or: [{ activeCustomization: id }, { activeResource: id }],
      },
      { $set: { activeCustomization: null, activeResource: null } },
      { new: true }
    );
    return res.status(200).json({ activeCustomization: user?.activeCustomization || null });
  })
);

module.exports = router;
