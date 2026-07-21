const express = require('express');
const { createRuntimeMetaController } = require('../controllers/runtimeMetaController');

const createRuntimeMetaRouter = (options = {}) => {
    const router = express.Router();
    const controller = createRuntimeMetaController(options);

    router.get('/health/live', controller.getLive);
    router.get('/health/ready', controller.getReady);
    router.get('/version', controller.getVersion);

    return router;
};

const router = createRuntimeMetaRouter();

module.exports = router;
module.exports.createRuntimeMetaRouter = createRuntimeMetaRouter;
