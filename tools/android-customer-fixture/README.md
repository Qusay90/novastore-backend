# Android customer hermetic fixture

This loopback-only server supplies deterministic synthetic customer data to the
existing debug build (`http://10.0.2.2:5000/`). It does not replace production
repositories, perform remote calls, or ship inside the APK.

Run the filled scenario:

```powershell
node tools/android-customer-fixture/server.mjs --scenario filled
```

Other explicit scenarios are `empty`, `error`, and `loading`. The process binds
only to `127.0.0.1`; stopping it restores the normal debug offline behavior.
