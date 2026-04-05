## [2.0.1](https://github.com/thomaskoeppe/gamepile/compare/v2.0.0...v2.0.1) (2026-04-05)

### Bug Fixes

* **worker:** update minimum interval for Steam API calls ([2912234](https://github.com/thomaskoeppe/gamepile/commit/291223412d953c830afdb698827f0db7ce96c469))

### Refactors

* **docker:** docker & k8s build and files ([787ec7a](https://github.com/thomaskoeppe/gamepile/commit/787ec7a02cb67f8c7eb395334f535c854300c8bf))

## [2.0.0](https://github.com/thomaskoeppe/gamepile/compare/v1.4.2...v2.0.0) (2026-04-05)

### ⚠ BREAKING CHANGES

* **layout:** Completely reworked backend logic, Game model etc.
* **worker:** Completely reworked Steam API implementation & jobs
* **db:** Game Model was completely reworked, dropped Genres, added Tags, Screenshots and Videos

### Features

* **db:** enhance Game model with screenshots, videos, and tags ([2146468](https://github.com/thomaskoeppe/gamepile/commit/21464689dc2c8d022aeed9efff80d6cca49af242))
* **layout:** add metadata and layout components for various pages ([a1b4825](https://github.com/thomaskoeppe/gamepile/commit/a1b4825c693b1db8a4fbb0aae153dfb8ecdf2fdb)), closes [#83](https://github.com/thomaskoeppe/gamepile/issues/83) [#81](https://github.com/thomaskoeppe/gamepile/issues/81) [#80](https://github.com/thomaskoeppe/gamepile/issues/80) [#78](https://github.com/thomaskoeppe/gamepile/issues/78) [#77](https://github.com/thomaskoeppe/gamepile/issues/77) [#74](https://github.com/thomaskoeppe/gamepile/issues/74) [#73](https://github.com/thomaskoeppe/gamepile/issues/73) [#72](https://github.com/thomaskoeppe/gamepile/issues/72) [#71](https://github.com/thomaskoeppe/gamepile/issues/71) [#69](https://github.com/thomaskoeppe/gamepile/issues/69) [#62](https://github.com/thomaskoeppe/gamepile/issues/62) [#59](https://github.com/thomaskoeppe/gamepile/issues/59)
* **logger:** add optional base context to createLogger function ([d615211](https://github.com/thomaskoeppe/gamepile/commit/d6152112a87c264996c1a1a6978be6954e2e98f0))
* **logo:** add new SVG logo file ([5f53e71](https://github.com/thomaskoeppe/gamepile/commit/5f53e7190076d3a968b26a51df1b3233b4b9523f))
* **redis:** add worker-metrics export to package.json ([ff2d7a7](https://github.com/thomaskoeppe/gamepile/commit/ff2d7a716605654322a75de389f46b486eb5af57))
* **redis:** update createRedisOptions to accept RedisEnvVars interface ([d770a70](https://github.com/thomaskoeppe/gamepile/commit/d770a703632f84ba4202313a74f7b7b51d6690eb))
* **worker:** add worker metrics constants and helper function ([5a0d714](https://github.com/thomaskoeppe/gamepile/commit/5a0d714cdbc1c7929fb2c65e67f7024487a998f2))
* **worker:** enhance Steam integration with tag and category sync ([f20785e](https://github.com/thomaskoeppe/gamepile/commit/f20785e84e325ec21f9ec2aa996befa174f72b65)), closes [#82](https://github.com/thomaskoeppe/gamepile/issues/82) [#79](https://github.com/thomaskoeppe/gamepile/issues/79) [#75](https://github.com/thomaskoeppe/gamepile/issues/75) [#74](https://github.com/thomaskoeppe/gamepile/issues/74)

## [1.4.2](https://github.com/thomaskoeppe/gamepile/compare/v1.4.1...v1.4.2) (2026-04-02)

### Bug Fixes

* **library:** fix ncaught Error: React.Children.only expected to receive a single React element child error ([8602111](https://github.com/thomaskoeppe/gamepile/commit/86021115c9836fd54bdd54134dfe1fcabd455102))

## [1.4.1](https://github.com/thomaskoeppe/gamepile/compare/v1.4.0...v1.4.1) (2026-04-01)

### Bug Fixes

* **ci:** fix docker public workflow ([c80c978](https://github.com/thomaskoeppe/gamepile/commit/c80c978f138b80c2cc5330c09b8a26ddd31eefc0))

## [1.4.0](https://github.com/thomaskoeppe/gamepile/compare/v1.3.0...v1.4.0) (2026-04-01)

### Features

* **migrate:** rename migration job and update related configurations ([ebf6485](https://github.com/thomaskoeppe/gamepile/commit/ebf6485b43e800d5c39f3e4a02ba0fb9664c5c4f))
* **shared:** add shared components for loading indicators and expandable pills ([b003d07](https://github.com/thomaskoeppe/gamepile/commit/b003d07a97747fa62403a2e7180e71cb4dab4f61))

### Bug Fixes

* **shared:** multiple fixes for PR ([bc4a429](https://github.com/thomaskoeppe/gamepile/commit/bc4a429b6b229023c45041aa7f0c420535cf3f27))
* **web:** fix multiple eslint problems ([e8cb93d](https://github.com/thomaskoeppe/gamepile/commit/e8cb93d10dade14b5655b4d5b58db73209b29ffe))
* **web:** fixed some eslint issues ([53cc97c](https://github.com/thomaskoeppe/gamepile/commit/53cc97ce85860722cc52f3d0dc89a3a25e21a936))

## [1.3.0](https://github.com/thomaskoeppe/gamepile/compare/v1.2.0...v1.3.0) (2026-03-31)

### Features

* **configuration:** add .env variables, configuration option and warning to config option ([#56](https://github.com/thomaskoeppe/gamepile/issues/56)) ([0dd4817](https://github.com/thomaskoeppe/gamepile/commit/0dd481704e4710c4c45bc0b1c3fa352a69084b1d))

### Bug Fixes

* **admin:** added missing schema and type to action ([06058a7](https://github.com/thomaskoeppe/gamepile/commit/06058a7c4e8eee087bd0271dbb27baaee77d5e83))

## [1.2.0](https://github.com/thomaskoeppe/gamepile/compare/v1.1.0...v1.2.0) (2026-03-31)

### Features

* **app-settings:** add AppSettingsProvider and public settings retrieval ([167d394](https://github.com/thomaskoeppe/gamepile/commit/167d394ddc28928b5319691b977e638c7b24e5fb)), closes [#46](https://github.com/thomaskoeppe/gamepile/issues/46)

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
