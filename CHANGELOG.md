# Changelog

## Unreleased

### Added

- Right-to-left layout detection for RTL device locales with native direction updates.
- Settings and publisher write-path regression coverage.
- Virtualized rendering tuning for publisher resources and purchase history.


## [1.4.0](https://github.com/mind-vault-1/mindvault_mobile/compare/v1.3.0...v1.4.0) (2026-11-27)


### Features

* **api:** add request dedupe, backoff and modal a11y ([#459](https://github.com/mind-vault-1/mindvault_mobile/issues/459)) ([65508a2](https://github.com/mind-vault-1/mindvault_mobile/commit/65508a230afcbb210ee4a4b45caf4f308109c79d))
* **batch-10:** fix [#325](https://github.com/mind-vault-1/mindvault_mobile/issues/325) publisher profile, [#326](https://github.com/mind-vault-1/mindvault_mobile/issues/326) bundle budgets, [#327](https://github.com/mind-vault-1/mindvault_mobile/issues/327) staged OTA and [#328](https://github.com/mind-vault-1/mindvault_mobile/issues/328) privacy notes ([#355](https://github.com/mind-vault-1/mindvault_mobile/issues/355)) ([b9e9e56](https://github.com/mind-vault-1/mindvault_mobile/commit/b9e9e5659124c748efd4f6578a1e694941a025c8))
* **batch-17:** publish status, lease display, a11y, publisher detail ([#311](https://github.com/mind-vault-1/mindvault_mobile/issues/311)-[#314](https://github.com/mind-vault-1/mindvault_mobile/issues/314)) ([#339](https://github.com/mind-vault-1/mindvault_mobile/issues/339)) ([54c36fa](https://github.com/mind-vault-1/mindvault_mobile/commit/54c36fabaa9a0186f8d1d1175e7f3c4fb80b270f))
* **batch-9:** catalog perf, app lock, bulk actions and runbooks ([#315](https://github.com/mind-vault-1/mindvault_mobile/issues/315)-[#318](https://github.com/mind-vault-1/mindvault_mobile/issues/318)) ([#354](https://github.com/mind-vault-1/mindvault_mobile/issues/354)) ([a9243a2](https://github.com/mind-vault-1/mindvault_mobile/commit/a9243a28070e5d798bdfd2acd25cbff335a6a661))
* **browser:** open explorer and external content in an in-app browser ([#448](https://github.com/mind-vault-1/mindvault_mobile/issues/448)) ([e7a8521](https://github.com/mind-vault-1/mindvault_mobile/commit/e7a852193473a798cfb44d5bc7e0bb877726c14e))
* **catalog:** filter the catalog by owner ([#357](https://github.com/mind-vault-1/mindvault_mobile/issues/357)) ([ad36d93](https://github.com/mind-vault-1/mindvault_mobile/commit/ad36d93e9bf70e2de00a00d824d344d90e420866))
* **clipboard:** auto-clear sensitive values after 60 s ([#351](https://github.com/mind-vault-1/mindvault_mobile/issues/351)) ([e692f87](https://github.com/mind-vault-1/mindvault_mobile/commit/e692f87094b9f46e393ca0e11337a88a90521a82))
* complete wave group 3 API, spending, i18n, and wallet signing ([#440](https://github.com/mind-vault-1/mindvault_mobile/issues/440)) ([400d0da](https://github.com/mind-vault-1/mindvault_mobile/commit/400d0da6ca6e33cd5b8a8d22c46706e1028e2714))
* **favorites:** save resources on device with a heart toggle ([#450](https://github.com/mind-vault-1/mindvault_mobile/issues/450)) ([534a2c0](https://github.com/mind-vault-1/mindvault_mobile/commit/534a2c05863488cc5bb8f000e1764788b1a37cf6))
* **group-7:** file publishing, saved favourites screen, grid layout and ResourceCard tests ([#392](https://github.com/mind-vault-1/mindvault_mobile/issues/392)-[#395](https://github.com/mind-vault-1/mindvault_mobile/issues/395)) ([#455](https://github.com/mind-vault-1/mindvault_mobile/issues/455)) ([0caa9fc](https://github.com/mind-vault-1/mindvault_mobile/commit/0caa9fcc188b379cbb01f93e6efa8ebea7a4a7e3))
* **haptics:** complete haptics on payments, scans and copy ([#344](https://github.com/mind-vault-1/mindvault_mobile/issues/344)) ([#345](https://github.com/mind-vault-1/mindvault_mobile/issues/345)) ([07288dd](https://github.com/mind-vault-1/mindvault_mobile/commit/07288dd26eb2b4c3feeaf670fce10c47c6f1b26f))
* improve content access, web support, pricing, and coverage ([#456](https://github.com/mind-vault-1/mindvault_mobile/issues/456)) ([6cdc565](https://github.com/mind-vault-1/mindvault_mobile/commit/6cdc565c2006e5c1a61fe2aadbcd3296d7446041))
* **leaderboard:** publisher leaderboard screen ([#358](https://github.com/mind-vault-1/mindvault_mobile/issues/358)) ([7139bd9](https://github.com/mind-vault-1/mindvault_mobile/commit/7139bd9557d72fac883f6a2e1e0e00e139c02af8))
* **notifications:** alert on terminal publish state and deep link ([#350](https://github.com/mind-vault-1/mindvault_mobile/issues/350)) ([55a51b5](https://github.com/mind-vault-1/mindvault_mobile/commit/55a51b5a733d5cd5dcd9eccb9e55360fb8b5d88b))
* query cache, modal i18n, French + language picker ([#402](https://github.com/mind-vault-1/mindvault_mobile/issues/402)-[#405](https://github.com/mind-vault-1/mindvault_mobile/issues/405)) ([22d9573](https://github.com/mind-vault-1/mindvault_mobile/commit/22d95736614a2dc1fd316dfdf586ef87317979bb)), closes [#403](https://github.com/mind-vault-1/mindvault_mobile/issues/403) [#404](https://github.com/mind-vault-1/mindvault_mobile/issues/404)
* query cache, modal i18n, French + language picker, modal tests ([701e21a](https://github.com/mind-vault-1/mindvault_mobile/commit/701e21a628db20982557ed62377742e8c3316dfc)), closes [#402](https://github.com/mind-vault-1/mindvault_mobile/issues/402) [#403](https://github.com/mind-vault-1/mindvault_mobile/issues/403) [#404](https://github.com/mind-vault-1/mindvault_mobile/issues/404) [#405](https://github.com/mind-vault-1/mindvault_mobile/issues/405)
* remote config, lazy screens and mutation gate ([#418](https://github.com/mind-vault-1/mindvault_mobile/issues/418)-[#421](https://github.com/mind-vault-1/mindvault_mobile/issues/421)) ([#462](https://github.com/mind-vault-1/mindvault_mobile/issues/462)) ([5c12814](https://github.com/mind-vault-1/mindvault_mobile/commit/5c1281459c2ea1eac48b084f849c63d69bebbc9d))
* **resources:** share a resource as a QR code ([#359](https://github.com/mind-vault-1/mindvault_mobile/issues/359)) ([051d72f](https://github.com/mind-vault-1/mindvault_mobile/commit/051d72f4bfee362545b27dc8aad52c5b37738aa0))
* **security:** verify downloaded content integrity ([#414](https://github.com/mind-vault-1/mindvault_mobile/issues/414)) ([#460](https://github.com/mind-vault-1/mindvault_mobile/issues/460)) ([0a86804](https://github.com/mind-vault-1/mindvault_mobile/commit/0a868049b48a9a74e3981e6c2afb0c52bee8e363))
* Testnet funding, SEP-7 signing, splash screen, network switcher ([#436](https://github.com/mind-vault-1/mindvault_mobile/issues/436)) ([f63669f](https://github.com/mind-vault-1/mindvault_mobile/commit/f63669f06c12abf9dc497b092a887838e5f42f69))
* **wallet:** add receive QR, balances and catalog refresh ([#447](https://github.com/mind-vault-1/mindvault_mobile/issues/447)) ([6716190](https://github.com/mind-vault-1/mindvault_mobile/commit/67161903ef46c0be7ec7312599808fd60fa0ad0f))
* **wallet:** WalletConnect v2 sessions ([#356](https://github.com/mind-vault-1/mindvault_mobile/issues/356)) ([231d45e](https://github.com/mind-vault-1/mindvault_mobile/commit/231d45ed7d3ef2d3adb5111d82c8cadb6d246215))
* **wallet:** wipe wallet secrets and sign out with typed confirmation ([#439](https://github.com/mind-vault-1/mindvault_mobile/issues/439)) ([d717629](https://github.com/mind-vault-1/mindvault_mobile/commit/d7176299cb9c0d872d30723dba84b1bac8b792fd))
* Wave Group 8 - Safe retries, agent status card, and string extraction ([#457](https://github.com/mind-vault-1/mindvault_mobile/issues/457)) ([feec99b](https://github.com/mind-vault-1/mindvault_mobile/commit/feec99b57af219bc9d254c7d62b589d88f667469))


### Bug Fixes

* **catalog:** remove fixed item layout and record finding ([#352](https://github.com/mind-vault-1/mindvault_mobile/issues/352)) ([135220b](https://github.com/mind-vault-1/mindvault_mobile/commit/135220b7484ce66dcbd0b50a32ee77dee558c767))
* **clipboard:** auto-clear copied secrets and signed XDR ([#351](https://github.com/mind-vault-1/mindvault_mobile/issues/351)) ([8cc2cd1](https://github.com/mind-vault-1/mindvault_mobile/commit/8cc2cd1397d9dcb3950633e2141b66f45afdbd14))
* **collections:** restore missing collection files on main ([#425](https://github.com/mind-vault-1/mindvault_mobile/issues/425)) ([c783a4b](https://github.com/mind-vault-1/mindvault_mobile/commit/c783a4b0f83a9444e6e88b9600a2abb9ff2534fb))
* **lockfile:** regenerate with npm 10 for CI compatibility ([f3b49b8](https://github.com/mind-vault-1/mindvault_mobile/commit/f3b49b8701d19c3d371089a09c53c2185907327f))
* **qr:** strip data URL prefix before saving QR to Photos ([04b6f1a](https://github.com/mind-vault-1/mindvault_mobile/commit/04b6f1abd2d7a607313aab0a57dc41dda6c5de8e))
* secure publisher writes, secret inputs, paywall preflight, API client ([78cd24d](https://github.com/mind-vault-1/mindvault_mobile/commit/78cd24d6e26402b1765a7a03288847d7fe0ba78f)), closes [#372](https://github.com/mind-vault-1/mindvault_mobile/issues/372) [#373](https://github.com/mind-vault-1/mindvault_mobile/issues/373) [#374](https://github.com/mind-vault-1/mindvault_mobile/issues/374) [#375](https://github.com/mind-vault-1/mindvault_mobile/issues/375)
* secure publisher writes, secret inputs, paywall preflight, API client ([#437](https://github.com/mind-vault-1/mindvault_mobile/issues/437)) ([78cd24d](https://github.com/mind-vault-1/mindvault_mobile/commit/78cd24d6e26402b1765a7a03288847d7fe0ba78f))
* **test:** align settings and publisher checklist assertions ([463c1a8](https://github.com/mind-vault-1/mindvault_mobile/commit/463c1a8fe84f9e4d0cb63f8cb199e4e9126e6ea4))


### Performance

* **catalog:** add getItemLayout to FlatList for scroll optimisation ([#352](https://github.com/mind-vault-1/mindvault_mobile/issues/352)) ([66484ce](https://github.com/mind-vault-1/mindvault_mobile/commit/66484ce0a2e0efa21691cfafd39eef26243bad00))

## [1.3.0](https://github.com/mind-vault-1/mindvault_mobile/compare/v1.2.0...v1.3.0) (2026-11-21)


### Features

* batch contributions - documentation, tips, and saved searches ([#292](https://github.com/mind-vault-1/mindvault_mobile/issues/292)-[#295](https://github.com/mind-vault-1/mindvault_mobile/issues/295)) ([fa878da](https://github.com/mind-vault-1/mindvault_mobile/commit/fa878da28e773a69d455226ee4b5a21f1ae5cc76))
* batch contributions - documentation, tips, and saved searches ([#292](https://github.com/mind-vault-1/mindvault_mobile/issues/292)-[#295](https://github.com/mind-vault-1/mindvault_mobile/issues/295)) ([#299](https://github.com/mind-vault-1/mindvault_mobile/issues/299)) ([fa878da](https://github.com/mind-vault-1/mindvault_mobile/commit/fa878da28e773a69d455226ee4b5a21f1ae5cc76))
* expo-aware deps, receipt coverage and clear-local-data fix ([#322](https://github.com/mind-vault-1/mindvault_mobile/issues/322)-[#324](https://github.com/mind-vault-1/mindvault_mobile/issues/324)) ([531d01f](https://github.com/mind-vault-1/mindvault_mobile/commit/531d01fff93104552a7eb6c310b623f033854913)), closes [#323](https://github.com/mind-vault-1/mindvault_mobile/issues/323)
* offline mutation queue, receipt sync, secret redaction and biometric re-auth ([#273](https://github.com/mind-vault-1/mindvault_mobile/issues/273)-[#276](https://github.com/mind-vault-1/mindvault_mobile/issues/276)) ([#277](https://github.com/mind-vault-1/mindvault_mobile/issues/277)) ([68ffd34](https://github.com/mind-vault-1/mindvault_mobile/commit/68ffd34ba300032ae225033b3a833042cbac1b72))
* publisher key rotation, E2E flows, flaky quarantine and previews ([#278](https://github.com/mind-vault-1/mindvault_mobile/issues/278)-[#281](https://github.com/mind-vault-1/mindvault_mobile/issues/281)) ([209b9de](https://github.com/mind-vault-1/mindvault_mobile/commit/209b9de22d30bc6c0f5b167ef3261d20d53ecaf2)), closes [#279](https://github.com/mind-vault-1/mindvault_mobile/issues/279) [#280](https://github.com/mind-vault-1/mindvault_mobile/issues/280)


### Bug Fixes

* **batch5:** address typecheck issues and hook ordering ([a3496cf](https://github.com/mind-vault-1/mindvault_mobile/commit/a3496cfe639b3e95e5582508a889b76a1fe1db40))
* **batch5:** resolve lint, stabilize tests, and update onboarding expectations ([68f565a](https://github.com/mind-vault-1/mindvault_mobile/commit/68f565aa85d1f9106d12aa31f217bb2c3c59c7e1))

## [1.2.0](https://github.com/mind-vault-1/mindvault_mobile/compare/v1.1.0...v1.2.0) (2026-10-23)


### Features

* detail refresh, biometric API key unlock and architecture docs ([#242](https://github.com/mind-vault-1/mindvault_mobile/issues/242), [#243](https://github.com/mind-vault-1/mindvault_mobile/issues/243), [#244](https://github.com/mind-vault-1/mindvault_mobile/issues/244)) ([#247](https://github.com/mind-vault-1/mindvault_mobile/issues/247)) ([05744b3](https://github.com/mind-vault-1/mindvault_mobile/commit/05744b3301d0c3604dbb9ed1b11ae287de7ccfd3))
* network status tracking and universal links (iOS/Android) ([#240](https://github.com/mind-vault-1/mindvault_mobile/issues/240)) ([fb2a1e3](https://github.com/mind-vault-1/mindvault_mobile/commit/fb2a1e38f2ef7aa44c936a46784b66099abd504d))
* publisher analytics, unlock and pay from detail, payment receipts, theme memoisation ([#231](https://github.com/mind-vault-1/mindvault_mobile/issues/231)) ([21a02a4](https://github.com/mind-vault-1/mindvault_mobile/commit/21a02a413385078cc3d3a1cf4fc0d64e220001ae)), closes [#224](https://github.com/mind-vault-1/mindvault_mobile/issues/224) [#225](https://github.com/mind-vault-1/mindvault_mobile/issues/225) [#229](https://github.com/mind-vault-1/mindvault_mobile/issues/229) [#230](https://github.com/mind-vault-1/mindvault_mobile/issues/230)
* publisher delist, recently viewed resources, shared status badge ([#226](https://github.com/mind-vault-1/mindvault_mobile/issues/226)) ([41a3c05](https://github.com/mind-vault-1/mindvault_mobile/commit/41a3c05c061f27446110ef5c9d1603e4d0349474)), closes [#220](https://github.com/mind-vault-1/mindvault_mobile/issues/220) [#221](https://github.com/mind-vault-1/mindvault_mobile/issues/221) [#222](https://github.com/mind-vault-1/mindvault_mobile/issues/222)
* purchase history, receipt export, API client and thumbnails ([#239](https://github.com/mind-vault-1/mindvault_mobile/issues/239)) ([646631b](https://github.com/mind-vault-1/mindvault_mobile/commit/646631bc8b68b9e79c4a9d6b9d6e81813ddeba29))
* real x402 v2 payment client ([#228](https://github.com/mind-vault-1/mindvault_mobile/issues/228)) ([3980780](https://github.com/mind-vault-1/mindvault_mobile/commit/3980780f89a0d48983b5be1feef56c0da6c5d7b2)), closes [#219](https://github.com/mind-vault-1/mindvault_mobile/issues/219)

## [1.1.0](https://github.com/mind-vault-1/mindvault_mobile/compare/v1.0.0...v1.1.0) (2026-10-19)


### Features

* on-chain registration, catalog infinite scroll, hook tests, verification details ([#217](https://github.com/mind-vault-1/mindvault_mobile/issues/217)) ([dd68bc2](https://github.com/mind-vault-1/mindvault_mobile/commit/dd68bc270ac58e3a0f8bde4a5d5184a7e9dde702)), closes [#204](https://github.com/mind-vault-1/mindvault_mobile/issues/204) [#205](https://github.com/mind-vault-1/mindvault_mobile/issues/205) [#206](https://github.com/mind-vault-1/mindvault_mobile/issues/206) [#207](https://github.com/mind-vault-1/mindvault_mobile/issues/207)
* publisher profile, diagnostics export, native generation, testing guide ([#223](https://github.com/mind-vault-1/mindvault_mobile/issues/223)) ([b0abc78](https://github.com/mind-vault-1/mindvault_mobile/commit/b0abc783e4d40257c0fdacc1c800e71b759f8fdb)), closes [#208](https://github.com/mind-vault-1/mindvault_mobile/issues/208) [#209](https://github.com/mind-vault-1/mindvault_mobile/issues/209) [#210](https://github.com/mind-vault-1/mindvault_mobile/issues/210) [#211](https://github.com/mind-vault-1/mindvault_mobile/issues/211)

## Changelog

All notable changes to this project are documented in [GitHub Releases](https://github.com/mind-vault-1/mindvault_mobile/releases).

This file is maintained automatically by [release-please](https://github.com/googleapis/release-please); do not edit it by hand. Conventional commit titles (`feat:`, `fix:`, `chore:`, etc.) are grouped into releases per the config in `release-please-config.json`.
