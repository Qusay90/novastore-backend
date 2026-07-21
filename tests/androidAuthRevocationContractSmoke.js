const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const api = read('app/src/main/java/com/novastore/app/core/network/NovaStoreApi.kt');
const repository = read('app/src/main/java/com/novastore/app/data/repository/AuthRepository.kt');
const authViewModel = read('app/src/main/java/com/novastore/app/feature/auth/AuthViewModel.kt');
const notificationsViewModel = read('app/src/main/java/com/novastore/app/feature/notifications/NotificationsViewModel.kt');
const warning = 'Bu cihazdaki oturum kapatıldı; sunucu oturumunun kapatıldığı doğrulanamadı.';

assert.match(api, /@POST\("api\/users\/logout"\)\s+suspend fun logout\(\): Response<Unit>/);
assert.match(repository, /suspend fun logout\(\): LogoutResult/);
assert.match(repository, /try\s*\{[\s\S]*api\.logout\(\)\.code\(\) == 204[\s\S]*\}\s*catch[\s\S]*finally\s*\{\s*sessionManager\.clearSession\(\)\s*\}/);
assert.match(repository, new RegExp(warning.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(authViewModel, /fun logout\(\)\s*\{\s*viewModelScope\.launch\s*\{[\s\S]*authRepository\.logout\(\)[\s\S]*_isLoggedInState\.value = false/);
assert.match(notificationsViewModel, /fun logout\(\)\s*\{\s*viewModelScope\.launch\s*\{[\s\S]*authRepository\.logout\(\)[\s\S]*securityActionMessage = result\.warning/);
assert.doesNotMatch([api, repository, authViewModel, notificationsViewModel].join('\n'), /Timber\.[a-z]+\([^\n]*(?:token|authorization|password)/i);

console.log('androidAuthRevocationContractSmoke: PASS endpoint=1 repository=1 viewmodels=2 leak-scan=0');
