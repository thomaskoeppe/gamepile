## [1.1.0](https://github.com/thomaskoeppe/gamepile/compare/v1.0.0...v1.1.0) (2026-03-31)

### Features

* **worker:** add internal scheduled task for user library imports ([#54](https://github.com/thomaskoeppe/gamepile/issues/54)) ([#32](https://github.com/thomaskoeppe/gamepile/issues/32)) ([24ae3ce](https://github.com/thomaskoeppe/gamepile/commit/24ae3ce9a15f0e67c15f4ece8f715ae878fb045e))

### Bug Fixes

* **web:** add internal scheduled task constant ([3a0bb4f](https://github.com/thomaskoeppe/gamepile/commit/3a0bb4f6bc098a280e24b94d78a90649ecdeebf4))
* **worker:** complete internal scheduled job and update status ([4105c3e](https://github.com/thomaskoeppe/gamepile/commit/4105c3eb267672a12ab0f7031c07e5e8001b887f))

## 1.0.0 (2026-03-30)

### Bug Fixes

* Add initial and incremental Steam sync logic on first boot ([8cf84b5](https://github.com/thomaskoeppe/gamepile/commit/8cf84b5723600a1b4aba2542553ca94a131962ea)), closes [#30](https://github.com/thomaskoeppe/gamepile/issues/30)
* Admin assignment [#29](https://github.com/thomaskoeppe/gamepile/issues/29) ([02b2465](https://github.com/thomaskoeppe/gamepile/commit/02b246514821c67e8e2df3d4619361e9e35cdfcb))
* Fixed env var validation for localhost, ports, and PostgreSQL URLs ([5705ece](https://github.com/thomaskoeppe/gamepile/commit/5705ece00ed379cef5e9a4d5b8eba4463b085e69))
* Improve image loading logic and fallback handling in SafeImage; update GameTile image sources and sizing ([#46](https://github.com/thomaskoeppe/gamepile/issues/46)) ([dbd6040](https://github.com/thomaskoeppe/gamepile/commit/dbd60409dee52e62a1326abcfd147635536905ab))
* Inefficient regular expression ([8a9bb3f](https://github.com/thomaskoeppe/gamepile/commit/8a9bb3f949ae14b40de316ea466cfa72f3e319dc))
* Last played not accurate [#24](https://github.com/thomaskoeppe/gamepile/issues/24) ([60c3701](https://github.com/thomaskoeppe/gamepile/commit/60c370155f30e594f460ce8ca4464458c0047fc3))
* Multiple Fixes for Issues observed by Copilot [#17](https://github.com/thomaskoeppe/gamepile/issues/17) ([82227af](https://github.com/thomaskoeppe/gamepile/commit/82227afb248347f2424e8c820d96046e7723ca47))
* Prevent empty dropdown menu when no actions are available in vault key table (Fix [#35](https://github.com/thomaskoeppe/gamepile/issues/35)) ([394912c](https://github.com/thomaskoeppe/gamepile/commit/394912c3b0fcce1ca20e2a3cc38609cdef2d5bc1))
* Reduce virtualizer overscan and image rootMargin for improved performance; set minimumCacheTTL for images ([03cdcc9](https://github.com/thomaskoeppe/gamepile/commit/03cdcc99240f7adb7f86d932e9b7a5283be1a60f))
* Remove notifications provider and related hooks from layout and components (Fix for Issue [#28](https://github.com/thomaskoeppe/gamepile/issues/28)) ([6d21595](https://github.com/thomaskoeppe/gamepile/commit/6d21595aa5cc23e3f78c9b1755017778db4daeaf))
* Total playtime formatting Xd Xh Xm [#25](https://github.com/thomaskoeppe/gamepile/issues/25) ([b3f6e6f](https://github.com/thomaskoeppe/gamepile/commit/b3f6e6fb0e652bae96729b91d80876c3c2dc72d5))

### Refactors

* Eslint fixes and unused constants in admin job invocation modules ([bd18dc3](https://github.com/thomaskoeppe/gamepile/commit/bd18dc3548f1b9d3842fcded4e41196f0c9a8de9))
* Remove unused activeSessions logic from session API and context (Changes for issue [#44](https://github.com/thomaskoeppe/gamepile/issues/44)) ([1befefd](https://github.com/thomaskoeppe/gamepile/commit/1befefde2c7886a15c91420b25fc9fd2abe4a507))
* **table-wrapper:** remove canRedeem prop from component ([1e3afdd](https://github.com/thomaskoeppe/gamepile/commit/1e3afdd9348608898f1fc25df467b94f6509867c))
