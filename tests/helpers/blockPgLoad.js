const Module = require('module');

const originalLoad = Module._load;
Module._load = function blockDatabaseDriver(request, parent, isMain) {
    if (request === 'pg') {
        throw new Error('pg must not load before remote startup is rejected');
    }
    return originalLoad.call(this, request, parent, isMain);
};
