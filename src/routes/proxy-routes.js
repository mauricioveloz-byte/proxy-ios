const express = require('express');
const mongoose = require('mongoose');
const ProxyRoute = require('../models/ProxyRoute');
const asyncHandler = require('../middleware/async-handler');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  const routes = await ProxyRoute.find().sort({ pathPrefix: 1 }).lean();
  const publicURL = new URL(process.env.BASE_URL || `${req.protocol}://${req.get('host')}`);
  const listenerPort = Number(process.env.PORT) || 3000;
  return res.status(200).json({
    routes,
    listenerPort,
    listenerPortManagedByPlatform: Boolean(process.env.RENDER),
    clientServer: publicURL.hostname,
    clientPort: Number(publicURL.port) || (publicURL.protocol === 'https:' ? 443 : 80),
    clientApiBaseUrl: publicURL.origin,
    proxyDefaults: {
      targetServer: process.env.PROXY_DEFAULT_HOST || '127.0.0.1',
      targetPort: Number(process.env.PROXY_DEFAULT_PORT) || 8080,
    },
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, pathPrefix, targetUrl } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    return res.status(400).json({ error: 'El nombre es obligatorio (máximo 80 caracteres).' });
  }
  if (typeof pathPrefix !== 'string' || !/^\/gateway(?:\/[A-Za-z0-9_-]+)+$/.test(pathPrefix)) {
    return res.status(400).json({ error: 'La ruta debe empezar por /gateway/ y usar segmentos simples.' });
  }
  if (typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Indica el destino HTTP(S), incluyendo el puerto.' });
  }

  try {
    const route = await ProxyRoute.create({ name: name.trim(), pathPrefix, targetUrl: targetUrl.trim() });
    return res.status(201).json({ route });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Ya existe una ruta con ese prefijo.' });
    }
    throw error;
  }
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Identificador de ruta inválido.' });
  }
  if (typeof req.body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled debe ser true o false.' });
  }
  const route = await ProxyRoute.findByIdAndUpdate(
    req.params.id,
    { enabled: req.body.enabled },
    { new: true, runValidators: true }
  );
  if (!route) return res.status(404).json({ error: 'Ruta no encontrada.' });
  return res.status(200).json({ route });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Identificador de ruta inválido.' });
  }
  const route = await ProxyRoute.findByIdAndDelete(req.params.id);
  if (!route) return res.status(404).json({ error: 'Ruta no encontrada.' });
  return res.status(200).json({ deleted: true });
}));

module.exports = router;
